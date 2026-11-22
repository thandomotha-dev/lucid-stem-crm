import { applyMapping, type ColumnMapping } from "./mapping.ts";
import { validateMappedRow, type ValidatedRow } from "./validate.ts";
import { resolveAction, type DuplicateStrategy } from "./dedupe.ts";

/** One CSV row -> validated, normalised record. Deterministic, so it is recomputed rather than stored. */
export function evaluateRow(cells: string[], mapping: ColumnMapping): ValidatedRow {
  return validateMappedRow(applyMapping(cells, mapping));
}

export type ValidationSummary = {
  valid: number;      // rows that passed validation (includes duplicates)
  invalid: number;
  dupInFile: number;
  dupExisting: number;
  warnings: Record<string, number>;
};

export type Outcome = { willImport: number; willUpdate: number; willSkip: number; needsReview: number; willFail: number };

/** What confirming the import will do, for the summary screen. Uses the same rule as the commit step. */
export function outcomeFor(s: ValidationSummary, strategy: DuplicateStrategy): Outcome {
  const out: Outcome = { willImport: s.valid - s.dupInFile - s.dupExisting, willUpdate: 0, willSkip: 0, needsReview: 0, willFail: s.invalid };
  for (const [kind, n] of [["IN_FILE", s.dupInFile], ["EXISTING", s.dupExisting]] as const) {
    const a = resolveAction(kind, strategy);
    if (a === "UPDATE") out.willUpdate += n;
    else if (a === "REVIEW") out.needsReview += n;
    else out.willSkip += n;
  }
  return out;
}
