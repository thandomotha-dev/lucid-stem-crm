import { createHash } from "node:crypto";
import { prisma } from "../db.ts";
import { getBoss } from "../queue/boss.ts";
import { assertCan } from "../../lib/permissions.ts";
import { chunk } from "../../lib/util.ts";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv } from "../../lib/import/parse.ts";
import { decodeTarget, validateMapping, type ColumnMapping } from "../../lib/import/mapping.ts";
import { evaluateRow, type ValidationSummary } from "../../lib/import/pipeline.ts";
import { escapeCsvCell } from "../../lib/import/templates.ts";
import type { Ctx } from "../auth.ts";
import { IMPORT_QUEUE, validateImport } from "./engine.ts";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const j = (v: unknown) => v as never;
const STRATEGIES = ["SKIP", "UPDATE", "REVIEW"] as const;
type Strategy = (typeof STRATEGIES)[number];

function scoped(ctx: Ctx, id: string) {
  return prisma.import.findFirst({ where: { id, organizationId: ctx.organizationId } });
}

export async function createImportFromUpload(ctx: Ctx, input: { filename: string; text: string; sourceLabel: string }): Promise<Result<{ id: string }>> {
  assertCan(ctx.role, "import:create");
  const sourceLabel = input.sourceLabel.trim();
  if (!sourceLabel || sourceLabel.length > 100) return fail("Enter a source label (up to 100 characters), e.g. \"Expo attendee list, Nov 2026\".");
  if (Buffer.byteLength(input.text) > MAX_IMPORT_BYTES) return fail("File is larger than 25 MB.");

  const parsed = parseCsv(input.text);
  if (parsed.headers.length === 0) return fail("The file is empty.");
  if (parsed.headers.length > 200) return fail("The file has more than 200 columns.");
  if (parsed.rows.length === 0) return fail("The file has a header row but no data rows.");
  if (parsed.rows.length > MAX_IMPORT_ROWS) return fail(`The file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it and import in parts.`);

  const imp = await prisma.import.create({
    data: {
      organizationId: ctx.organizationId, createdById: ctx.userId, filename: input.filename.slice(0, 200),
      fileSha256: createHash("sha256").update(input.text).digest("hex"), sourceLabel,
      headers: j(parsed.headers), totalRows: parsed.rows.length,
    },
  });
  try {
    // rowNumber: position among non-blank lines, header = 1.
    for (const part of chunk(parsed.rows.map((raw, i) => ({ importId: imp.id, rowNumber: i + 2, raw: j(raw) })), 1000)) {
      await prisma.importRow.createMany({ data: part });
    }
  } catch (e) {
    await prisma.import.delete({ where: { id: imp.id } }).catch(() => {});
    throw e;
  }
  return { ok: true, data: { id: imp.id } };
}

function mappingMessage(code: string): string {
  if (code === "EMAIL_NOT_MAPPED") return "Map one column to Email.";
  if (code.startsWith("DUPLICATE_TARGET:")) return `Two columns are mapped to ${code.slice(17)}. Each field can be used once.`;
  if (code.startsWith("INVALID_CUSTOM_KEY")) return "A column marked as custom field has a header that can't be used as a field name. Rename it in the CSV or ignore it.";
  return code;
}

export async function configureImport(ctx: Ctx, importId: string, cfg: { targets: string[]; strategy: string; tags: string; sourceLabel: string }): Promise<Result<{ id: string }>> {
  assertCan(ctx.role, "import:create");
  const imp = await scoped(ctx, importId);
  if (!imp) return fail("Import not found.");
  if (!["UPLOADED", "MAPPED", "VALIDATED"].includes(imp.status)) return fail("This import can no longer be changed.");

  const headers = imp.headers as unknown as string[];
  const mapping: ColumnMapping = headers.map((h, i) => decodeTarget(cfg.targets[i] ?? "ignore", h));
  const errors = validateMapping(mapping);
  if (errors.length) return fail(errors.map(mappingMessage).join(" "));

  const strategy = STRATEGIES.find((s) => s === cfg.strategy);
  if (!strategy) return fail("Choose how to handle duplicates.");
  const sourceLabel = cfg.sourceLabel.trim();
  if (!sourceLabel || sourceLabel.length > 100) return fail("Enter a source label (up to 100 characters).");
  const tags = [...new Set(cfg.tags.split(",").map((t) => t.trim()).filter(Boolean))];
  if (tags.length > 20 || tags.some((t) => t.length > 50)) return fail("Use at most 20 tags of up to 50 characters.");

  await prisma.import.update({ where: { id: imp.id }, data: { columnMapping: j(mapping), duplicateStrategy: strategy, defaultTags: j(tags), sourceLabel, status: "MAPPED" } });
  try {
    await validateImport(imp.id);
  } catch (e) {
    console.error(`[import ${imp.id}] validation failed`, e);
    return fail("Validation failed unexpectedly. Try again; if it repeats, check the server logs.");
  }
  return { ok: true, data: { id: imp.id } };
}

export async function setDuplicateStrategy(ctx: Ctx, importId: string, strategy: string): Promise<Result<{ id: string }>> {
  assertCan(ctx.role, "import:create");
  const s = STRATEGIES.find((x) => x === strategy);
  if (!s) return fail("Unknown option.");
  const res = await prisma.import.updateMany({ where: { id: importId, organizationId: ctx.organizationId, status: "VALIDATED" }, data: { duplicateStrategy: s } });
  return res.count ? { ok: true, data: { id: importId } } : fail("Import not found or no longer editable.");
}

/** Confirm: queue the background commit. Imports never email anyone and never enrol leads in a campaign. */
export async function startCommit(ctx: Ctx, importId: string): Promise<Result<{ id: string }>> {
  assertCan(ctx.role, "import:create");
  const imp = await scoped(ctx, importId);
  if (!imp) return fail("Import not found.");
  if (imp.status !== "VALIDATED") return fail("Validate the import before confirming it.");
  const s = imp.summary as unknown as ValidationSummary | null;
  if (!s || s.valid === 0) return fail("There are no valid rows to import.");
  if (imp.duplicateStrategy === "REVIEW" && s.dupInFile + s.dupExisting > 0) return fail("Choose Skip or Update for the duplicates before importing.");

  const claimed = await prisma.import.updateMany({ where: { id: imp.id, status: "VALIDATED" }, data: { status: "IMPORTING" } });
  if (claimed.count === 0) return fail("This import was already started.");
  try {
    const boss = await getBoss();
    await boss.createQueue(IMPORT_QUEUE).catch(() => {});
    await boss.send(IMPORT_QUEUE, { importId: imp.id }, { singletonKey: imp.id, expireInSeconds: 4 * 3600, retryLimit: 3, retryDelay: 30 });
  } catch (e) {
    await prisma.import.update({ where: { id: imp.id }, data: { status: "VALIDATED" } });
    console.error("[import] could not enqueue", e);
    return fail("Could not queue the import. Please try again.");
  }
  await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorId: ctx.userId, action: "import.started", entityType: "import", entityId: imp.id } });
  return { ok: true, data: { id: imp.id } };
}

export async function listImports(ctx: Ctx) {
  assertCan(ctx.role, "import:read");
  return prisma.import.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function getImportDetail(ctx: Ctx, importId: string) {
  assertCan(ctx.role, "import:read");
  const imp = await scoped(ctx, importId);
  if (!imp) return null;
  const mapping = imp.columnMapping as unknown as ColumnMapping | null;
  const [groups, preview, invalid, dups] = await Promise.all([
    prisma.importRow.groupBy({ by: ["status"], where: { importId }, _count: { _all: true } }),
    prisma.importRow.findMany({ where: { importId }, orderBy: { rowNumber: "asc" }, take: 5, select: { rowNumber: true, raw: true } }),
    prisma.importRow.findMany({ where: { importId, status: "INVALID" }, orderBy: { rowNumber: "asc" }, take: 25, select: { rowNumber: true, raw: true, issues: true } }),
    prisma.importRow.findMany({ where: { importId, status: "DUPLICATE" }, orderBy: { rowNumber: "asc" }, take: 25, select: { rowNumber: true, raw: true, duplicateKind: true } }),
  ]);
  const emailOf = (raw: unknown) => (mapping ? evaluateRow(raw as string[], mapping).fields.email : undefined) ?? "";
  return {
    imp, headers: imp.headers as unknown as string[], mapping,
    summary: imp.summary as unknown as ValidationSummary | null,
    statusCounts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number>,
    preview: preview.map((r) => ({ rowNumber: r.rowNumber, cells: r.raw as unknown as string[] })),
    invalid: invalid.map((r) => ({ rowNumber: r.rowNumber, email: (r.raw as unknown as string[]).join(" | ").slice(0, 80), issues: (r.issues as unknown as { message: string }[]).map((i) => i.message) })),
    duplicates: dups.map((r) => ({ rowNumber: r.rowNumber, email: emailOf(r.raw), kind: r.duplicateKind })),
  };
}

/** Downloadable report: every original row plus its outcome and reason, so failed rows can be fixed and re-uploaded. */
export async function buildReportCsv(ctx: Ctx, importId: string): Promise<string | null> {
  assertCan(ctx.role, "import:read");
  const imp = await scoped(ctx, importId);
  if (!imp) return null;
  const headers = imp.headers as unknown as string[];
  const lines: string[] = [["row", "status", "reason", ...headers].map(escapeCsvCell).join(",")];
  let cursor = 0;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { importId, rowNumber: { gt: cursor } }, orderBy: { rowNumber: "asc" }, take: 2000 });
    if (rows.length === 0) break;
    for (const r of rows) {
      const reason = (r.issues as unknown as { message: string }[]).map((i) => i.message).join("; ");
      lines.push([String(r.rowNumber), r.status.toLowerCase(), reason, ...(r.raw as unknown as string[])].map(escapeCsvCell).join(","));
    }
    cursor = rows[rows.length - 1]!.rowNumber;
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export type { Strategy };
