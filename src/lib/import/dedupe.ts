import type { CrmField } from "./mapping.ts";

export type DuplicateKind = "NONE" | "IN_FILE" | "EXISTING";
export type DuplicateStrategy = "SKIP" | "UPDATE" | "REVIEW";
export type RowAction = "IMPORT" | "SKIP" | "UPDATE" | "REVIEW";
export type DuplicateInfo = { kind: DuplicateKind; firstRowNumber?: number };

/**
 * Classify rows by normalised email. `existing` holds emails already in the CRM (including archived leads).
 * The first occurrence in the file is the "original"; later repeats are IN_FILE duplicates of it.
 * Rows with no valid email (null) are never duplicates; they fail validation instead.
 */
export function classifyDuplicates(
  rows: { rowNumber: number; email: string | null }[],
  existing: ReadonlySet<string>,
): Map<number, DuplicateInfo> {
  const firstSeen = new Map<string, number>();
  const out = new Map<number, DuplicateInfo>();
  for (const { rowNumber, email } of rows) {
    if (!email) { out.set(rowNumber, { kind: "NONE" }); continue; }
    const first = firstSeen.get(email);
    if (first !== undefined) { out.set(rowNumber, { kind: "IN_FILE", firstRowNumber: first }); continue; }
    firstSeen.set(email, rowNumber);
    out.set(rowNumber, { kind: existing.has(email) ? "EXISTING" : "NONE" });
  }
  return out;
}

/** In-file repeats: first row wins, repeats are skipped (or sent to review). Strategy governs existing leads. */
export function resolveAction(kind: DuplicateKind, strategy: DuplicateStrategy): RowAction {
  if (kind === "NONE") return "IMPORT";
  if (kind === "IN_FILE") return strategy === "REVIEW" ? "REVIEW" : "SKIP";
  return strategy;
}

export type MergeMode = "FILL_BLANKS" | "OVERWRITE";
type Mergeable = Partial<Record<Exclude<CrmField, "email">, string | null>>;

/**
 * Build the patch for "update existing" imports. By design this can never touch email, status,
 * unsubscribe/consent state or bounce state, and never blanks out an existing value.
 */
export function mergeLeadFields(
  existing: Mergeable & { custom?: Record<string, string> },
  incoming: Partial<Record<CrmField, string>> & { custom?: Record<string, string> },
  mode: MergeMode,
): { fields: Mergeable; custom: Record<string, string> } {
  const fields: Mergeable = {};
  for (const [k, v] of Object.entries(incoming) as [string, unknown][]) {
    if (k === "email" || k === "custom" || typeof v !== "string" || !v) continue;
    const key = k as Exclude<CrmField, "email">;
    if (mode === "OVERWRITE" || !existing[key]) fields[key] = v;
  }
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming.custom ?? {})) {
    if (!v) continue;
    if (mode === "OVERWRITE" || !existing.custom?.[k]) custom[k] = v;
  }
  return { fields, custom };
}
