import Papa from "papaparse";
import { uniqueHeaders } from "./mapping.ts";

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024; // parsed server-side, then staged in the DB in batches
export const MAX_IMPORT_ROWS = 200_000;

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: string; warnings: string[] };

/**
 * Parse CSV text with header:false so we control header handling (duplicate/blank headers are common).
 * Pass `maxRows` for a preview; omit it to parse the whole file.
 */
export function parseCsv(text: string, maxRows?: number): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const res = Papa.parse<string[]>(clean, {
    header: false,
    skipEmptyLines: "greedy",
    ...(maxRows ? { preview: maxRows + 1 } : {}),
  });
  const [head, ...rows] = res.data;
  const warnings = res.errors.map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  if (!head) return { headers: [], rows: [], delimiter: res.meta.delimiter, warnings: ["File is empty."] };
  return { headers: uniqueHeaders(head), rows, delimiter: res.meta.delimiter, warnings };
}
