import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestMapping, encodeTarget, decodeTarget, validateMapping } from "./mapping.ts";
import { evaluateRow, outcomeFor } from "./pipeline.ts";
import { classifyDuplicates } from "./dedupe.ts";

test("target encode/decode round trip", () => {
  assert.deepEqual(decodeTarget("field:email", "Email"), { kind: "field", field: "email" });
  assert.deepEqual(decodeTarget("custom", "Lead Score"), { kind: "custom", key: "lead_score" });
  assert.deepEqual(decodeTarget("field:hacker", "x"), { kind: "ignore" });
  assert.deepEqual(decodeTarget("garbage", "x"), { kind: "ignore" });
  assert.equal(encodeTarget({ kind: "field", field: "company" }), "field:company");
});

test("end to end on parsed rows: map -> validate -> classify -> outcome", () => {
  const headers = ["Email", "First Name", "Company"];
  const rows = [
    ["a@x.co", "Ann", "Acme"],
    ["b@x.co", "", ""],
    ["bad-email", "Bob", "Beta"],
    ["A@X.CO", "Ann again", ""],
    ["", "No Email", "Gamma"],
  ];
  const mapping = suggestMapping(headers);
  assert.deepEqual(validateMapping(mapping), []);
  const results = rows.map((r) => evaluateRow(r, mapping));
  assert.deepEqual(results.map((r) => r.ok), [true, true, false, true, false]);

  const dup = classifyDuplicates(
    results.map((r, i) => ({ rowNumber: i + 2, email: r.ok ? r.fields.email! : null })),
    new Set(["b@x.co"]),
  );
  assert.equal(dup.get(5)?.kind, "IN_FILE");
  assert.equal(dup.get(3)?.kind, "EXISTING");

  const summary = { valid: 3, invalid: 2, dupInFile: 1, dupExisting: 1, warnings: {} };
  assert.deepEqual(outcomeFor(summary, "SKIP"), { willImport: 1, willUpdate: 0, willSkip: 2, needsReview: 0, willFail: 2 });
  assert.deepEqual(outcomeFor(summary, "UPDATE"), { willImport: 1, willUpdate: 1, willSkip: 1, needsReview: 0, willFail: 2 });
  assert.deepEqual(outcomeFor(summary, "REVIEW"), { willImport: 1, willUpdate: 0, willSkip: 0, needsReview: 2, willFail: 2 });
});

test("outcome totals always add up to the valid + invalid rows", () => {
  const s = { valid: 10, invalid: 4, dupInFile: 3, dupExisting: 2, warnings: {} };
  for (const strat of ["SKIP", "UPDATE", "REVIEW"] as const) {
    const o = outcomeFor(s, strat);
    assert.equal(o.willImport + o.willUpdate + o.willSkip + o.needsReview + o.willFail, 14, strat);
  }
});
