// Import engine: no Next.js imports, so the worker process can run it too.
import type { Import } from "@prisma/client";
import { prisma } from "../db.ts";
import { recordAudit } from "../events.ts";
import { chunk } from "../../lib/util.ts";
import type { ColumnMapping, CrmField } from "../../lib/import/mapping.ts";
import { evaluateRow, type ValidationSummary } from "../../lib/import/pipeline.ts";
import { classifyDuplicates, mergeLeadFields, resolveAction, type DuplicateKind } from "../../lib/import/dedupe.ts";

export const IMPORT_QUEUE = "import.commit";
const VALIDATE_BATCH = 1000;
const COMMIT_BATCH = 500;
const j = (v: unknown) => v as never; // Prisma Json input helper

type Item = { rowNumber: number; email: string; fields: Partial<Record<CrmField, string>>; custom: Record<string, string> };

/**
 * Pass 1+2: validate every staged row against the saved mapping, then classify duplicates
 * (within the file and against existing leads, archived included). Batched; safe to re-run.
 * Only INVALID rows get per-row writes; valid rows are updated in bulk.
 */
export async function validateImport(importId: string): Promise<ValidationSummary> {
  const imp = await prisma.import.findUniqueOrThrow({ where: { id: importId } });
  const mapping = imp.columnMapping as unknown as ColumnMapping;

  await prisma.importRow.updateMany({ where: { importId }, data: { status: "PENDING", issues: j([]), duplicateKind: null } });

  const summary: ValidationSummary = { valid: 0, invalid: 0, dupInFile: 0, dupExisting: 0, warnings: {} };
  const validRows: { rowNumber: number; email: string }[] = [];
  let cursor = 0;
  for (;;) {
    const rows = await prisma.importRow.findMany({
      where: { importId, rowNumber: { gt: cursor } }, orderBy: { rowNumber: "asc" }, take: VALIDATE_BATCH,
      select: { rowNumber: true, raw: true },
    });
    if (rows.length === 0) break;
    const validNumbers: number[] = [];
    for (const r of rows) {
      const v = evaluateRow(r.raw as unknown as string[], mapping);
      for (const w of v.warnings) summary.warnings[w.code] = (summary.warnings[w.code] ?? 0) + 1;
      if (v.ok) {
        summary.valid++;
        validNumbers.push(r.rowNumber);
        validRows.push({ rowNumber: r.rowNumber, email: v.fields.email! });
      } else {
        summary.invalid++;
        await prisma.importRow.update({
          where: { importId_rowNumber: { importId, rowNumber: r.rowNumber } },
          data: { status: "INVALID", issues: j(v.errors) },
        });
      }
    }
    if (validNumbers.length) await prisma.importRow.updateMany({ where: { importId, rowNumber: { in: validNumbers } }, data: { status: "VALID" } });
    cursor = rows[rows.length - 1]!.rowNumber;
  }

  // Existing leads, including archived ones, so an import can never resurrect or double-create a lead.
  const existing = new Set<string>();
  for (const part of chunk([...new Set(validRows.map((r) => r.email))], 1000)) {
    const found = await prisma.lead.findMany({ where: { organizationId: imp.organizationId, emailNormalized: { in: part } }, select: { emailNormalized: true } });
    for (const f of found) existing.add(f.emailNormalized);
  }

  const classified = classifyDuplicates(validRows, existing);
  const byKind: Record<"IN_FILE" | "EXISTING", number[]> = { IN_FILE: [], EXISTING: [] };
  for (const [rowNumber, info] of classified) if (info.kind !== "NONE") byKind[info.kind].push(rowNumber);
  summary.dupInFile = byKind.IN_FILE.length;
  summary.dupExisting = byKind.EXISTING.length;
  for (const kind of ["IN_FILE", "EXISTING"] as const) {
    for (const part of chunk(byKind[kind], 1000)) {
      await prisma.importRow.updateMany({ where: { importId, rowNumber: { in: part } }, data: { status: "DUPLICATE", duplicateKind: kind } });
    }
  }

  await prisma.import.update({
    where: { id: importId },
    data: { status: "VALIDATED", totalRows: summary.valid + summary.invalid, summary: j({ ...summary, validatedAt: new Date().toISOString() }) },
  });
  return summary;
}

async function ensureTagIds(organizationId: string, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of new Set(names)) {
    const t = await prisma.tag.upsert({ where: { organizationId_name: { organizationId, name } }, create: { organizationId, name }, update: {} });
    ids.push(t.id);
  }
  return ids;
}

async function ensureCustomFields(organizationId: string, headers: string[], mapping: ColumnMapping) {
  for (const [i, t] of mapping.entries()) {
    if (t.kind === "custom") {
      await prisma.customFieldDefinition.upsert({
        where: { organizationId_key: { organizationId, key: t.key } },
        create: { organizationId, key: t.key, label: headers[i] ?? t.key }, update: {},
      });
    }
  }
}

async function markRows(importId: string, rowNumbers: number[], status: "SKIPPED" | "FAILED", issue: { code: string; message: string }) {
  for (const part of chunk(rowNumbers, 1000)) {
    await prisma.importRow.updateMany({ where: { importId, rowNumber: { in: part } }, data: { status, issues: j([issue]) } });
  }
}

/** Create leads for a set of rows in ONE transaction, together with tags, timeline entries, outbox events and row statuses. */
async function createBatch(imp: Import, tagIds: string[], items: Item[]) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const created = await tx.lead.createManyAndReturn({
      data: items.map((it) => ({
        ...it.fields, email: it.email, emailNormalized: it.email,
        organizationId: imp.organizationId, customFields: j(it.custom),
        source: imp.sourceLabel, importId: imp.id, importedAt: now,
      })),
      skipDuplicates: true, // a lead created by someone else mid-import is skipped, never overwritten
      select: { id: true, emailNormalized: true },
    });
    if (created.length) {
      if (tagIds.length) await tx.leadTag.createMany({ data: created.flatMap((l) => tagIds.map((tagId) => ({ leadId: l.id, tagId }))), skipDuplicates: true });
      await tx.leadActivity.createMany({ data: created.map((l) => ({ organizationId: imp.organizationId, leadId: l.id, type: "lead.created", actorId: imp.createdById, data: j({ source: "import", importId: imp.id }) })) });
      await tx.domainEvent.createMany({ data: created.map((l) => ({ organizationId: imp.organizationId, type: "lead.imported", entityType: "lead", entityId: l.id, payload: j({ importId: imp.id }) })) });
    }
    const made = new Set(created.map((c) => c.emailNormalized));
    const ok = items.filter((i) => made.has(i.email)).map((i) => i.rowNumber);
    const raced = items.filter((i) => !made.has(i.email)).map((i) => i.rowNumber);
    if (ok.length) await tx.importRow.updateMany({ where: { importId: imp.id, rowNumber: { in: ok } }, data: { status: "IMPORTED" } });
    if (raced.length) await tx.importRow.updateMany({ where: { importId: imp.id, rowNumber: { in: raced } }, data: { status: "SKIPPED", issues: j([{ code: "DUPLICATE_EXISTING", message: "A lead with this email was created while the import was running." }]) } });
  }, { timeout: 60_000 });
}

async function createWithFallback(imp: Import, tagIds: string[], items: Item[]) {
  if (items.length === 0) return;
  try {
    await createBatch(imp, tagIds, items);
  } catch (err) {
    console.error(`[import ${imp.id}] batch failed, retrying row by row:`, err);
    for (const it of items) {
      try { await createBatch(imp, tagIds, [it]); }
      catch (e) { await markRows(imp.id, [it.rowNumber], "FAILED", { code: "DB_ERROR", message: e instanceof Error ? e.message.slice(0, 300) : "Database error." }); }
    }
  }
}

/** "Update existing" fills blank fields only; it never touches email, status, consent or bounce state. */
async function updateOne(imp: Import, tagIds: string[], it: Item) {
  const lead = await prisma.lead.findUnique({ where: { organizationId_emailNormalized: { organizationId: imp.organizationId, emailNormalized: it.email } } });
  if (!lead) return markRows(imp.id, [it.rowNumber], "FAILED", { code: "LEAD_NOT_FOUND", message: "Existing lead could not be found." });
  if (lead.archivedAt) return markRows(imp.id, [it.rowNumber], "SKIPPED", { code: "ARCHIVED_LEAD", message: "The existing lead is archived; it was not changed." });

  const existingCustom = (lead.customFields ?? {}) as Record<string, string>;
  const patch = mergeLeadFields({ ...lead, custom: existingCustom }, { ...it.fields, custom: it.custom }, "FILL_BLANKS");
  const changedFields = Object.keys(patch.fields);
  const hasCustom = Object.keys(patch.custom).length > 0;
  if (changedFields.length === 0 && !hasCustom && tagIds.length === 0) {
    return markRows(imp.id, [it.rowNumber], "SKIPPED", { code: "NO_NEW_DATA", message: "Existing lead already has this information." });
  }
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: { ...patch.fields, ...(hasCustom ? { customFields: j({ ...existingCustom, ...patch.custom }) } : {}) } });
    if (tagIds.length) await tx.leadTag.createMany({ data: tagIds.map((tagId) => ({ leadId: lead.id, tagId })), skipDuplicates: true });
    await tx.leadActivity.create({ data: { organizationId: imp.organizationId, leadId: lead.id, type: "lead.updated_by_import", actorId: imp.createdById, data: j({ importId: imp.id, fields: [...changedFields, ...Object.keys(patch.custom)] }) } });
    await tx.importRow.update({ where: { importId_rowNumber: { importId: imp.id, rowNumber: it.rowNumber } }, data: { status: "UPDATED" } });
  });
}

async function finalize(imp: Import) {
  const groups = await prisma.importRow.groupBy({ by: ["status"], where: { importId: imp.id }, _count: { _all: true } });
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  const counts = { importedCount: n("IMPORTED"), updatedCount: n("UPDATED"), skippedCount: n("SKIPPED"), failedCount: n("INVALID") + n("FAILED") };
  await prisma.$transaction(async (tx) => {
    await tx.import.update({ where: { id: imp.id }, data: { status: "COMPLETED", completedAt: new Date(), ...counts } });
    await recordAudit(tx, { organizationId: imp.organizationId, actorId: imp.createdById, action: "import.completed", entityType: "import", entityId: imp.id, metadata: counts });
  });
}

/**
 * Process one batch. Resumable and safe to retry: every row ends in a non-VALID/DUPLICATE status in the same
 * transaction that writes its lead, so a crash never double-imports and the next call picks up what is left.
 */
export async function commitImportBatch(importId: string, size = COMMIT_BATCH): Promise<{ done: boolean }> {
  const imp = await prisma.import.findUniqueOrThrow({ where: { id: importId } });
  if (imp.status !== "IMPORTING") return { done: true };

  const rows = await prisma.importRow.findMany({ where: { importId, status: { in: ["VALID", "DUPLICATE"] } }, orderBy: { rowNumber: "asc" }, take: size });
  if (rows.length === 0) { await finalize(imp); return { done: true }; }

  const mapping = imp.columnMapping as unknown as ColumnMapping;
  await ensureCustomFields(imp.organizationId, imp.headers as unknown as string[], mapping);
  const tagIds = await ensureTagIds(imp.organizationId, imp.defaultTags as unknown as string[]);

  const creates: Item[] = [], updates: Item[] = [];
  const skipped: Record<DuplicateKind, number[]> = { NONE: [], IN_FILE: [], EXISTING: [] };
  const broken: number[] = [];
  for (const row of rows) {
    const v = evaluateRow(row.raw as unknown as string[], mapping);
    if (!v.ok) { broken.push(row.rowNumber); continue; }
    const dup = (row.duplicateKind ?? "NONE") as DuplicateKind;
    const item: Item = { rowNumber: row.rowNumber, email: v.fields.email!, fields: v.fields, custom: v.custom };
    const action = resolveAction(dup, imp.duplicateStrategy);
    if (action === "IMPORT") creates.push(item);
    else if (action === "UPDATE") updates.push(item);
    else skipped[dup].push(row.rowNumber); // SKIP (REVIEW is blocked before commit and is treated as skip here)
  }

  if (broken.length) await markRows(imp.id, broken, "FAILED", { code: "REVALIDATION_FAILED", message: "Row no longer passes validation." });
  if (skipped.IN_FILE.length) await markRows(imp.id, skipped.IN_FILE, "SKIPPED", { code: "DUPLICATE_IN_FILE", message: "Repeated email within this file; the first occurrence was used." });
  if (skipped.EXISTING.length) await markRows(imp.id, skipped.EXISTING, "SKIPPED", { code: "DUPLICATE_EXISTING", message: "A lead with this email already exists." });
  await createWithFallback(imp, tagIds, creates);
  for (const it of updates) {
    try { await updateOne(imp, tagIds, it); }
    catch (e) { await markRows(imp.id, [it.rowNumber], "FAILED", { code: "DB_ERROR", message: e instanceof Error ? e.message.slice(0, 300) : "Database error." }); }
  }
  return { done: false };
}
