import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEmail, normalizeEmail } from "./email.ts";
import { suggestMapping, validateMapping, applyMapping, uniqueHeaders, customKeyFromHeader } from "./mapping.ts";
import { validateMappedRow } from "./validate.ts";
import { classifyDuplicates, resolveAction, mergeLeadFields } from "./dedupe.ts";
import { escapeCsvCell, generateTemplateCsv } from "./templates.ts";
import { chunk } from "../util.ts";

test("email: normalisation", () => {
  assert.equal(normalizeEmail("  Jane <JANE@Example.COM> "), "jane@example.com");
  assert.equal(normalizeEmail("mailto:A@B.co"), "a@b.co");
});

test("email: accepts valid, rejects invalid", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.co.za", "x@xn--bcher-kva.example"]) assert.ok(checkEmail(ok).ok, ok);
  for (const bad of ["", "plain", "a@b", "a@@b.com", "a b@c.com", ".a@b.com", "a..b@c.com", "a@-b.com", "a@b.c", "José@example.com", "a@b.com.", `${"x".repeat(65)}@b.com`]) {
    assert.equal(checkEmail(bad).ok, false, bad);
  }
  assert.equal(checkEmail("a@" + "b".repeat(250) + ".com").ok, false);
});

test("email: role addresses flagged", () => {
  const r = checkEmail("Info@Example.com");
  assert.ok(r.ok && r.isRoleAddress);
  const p = checkEmail("jane@example.com");
  assert.ok(p.ok && !p.isRoleAddress);
});

test("mapping: suggests sensible targets, one column per field", () => {
  const m = suggestMapping(["Email Address", "First Name", "Surname", "Company Name", "Notes", "E-mail"]);
  assert.deepEqual(m.map((t) => (t.kind === "field" ? t.field : t.kind)), ["email", "firstName", "lastName", "company", "ignore", "ignore"]);
});

test("mapping: validation", () => {
  assert.ok(validateMapping([{ kind: "ignore" }]).includes("EMAIL_NOT_MAPPED"));
  assert.ok(validateMapping([{ kind: "field", field: "email" }, { kind: "field", field: "email" }]).includes("DUPLICATE_TARGET:email"));
  assert.ok(validateMapping([{ kind: "field", field: "email" }, { kind: "custom", key: "Bad Key" }]).some((e) => e.startsWith("INVALID_CUSTOM_KEY")));
  assert.deepEqual(validateMapping([{ kind: "field", field: "email" }, { kind: "custom", key: "lead_score" }]), []);
});

test("mapping: applyMapping trims and omits empty cells", () => {
  const out = applyMapping([" a@b.co ", "", "Acme", "9"], [
    { kind: "field", field: "email" }, { kind: "field", field: "firstName" },
    { kind: "field", field: "company" }, { kind: "custom", key: "score" },
  ]);
  assert.deepEqual(out, { fields: { email: "a@b.co", company: "Acme" }, custom: { score: "9" } });
});

test("mapping: unique headers and custom keys", () => {
  assert.deepEqual(uniqueHeaders(["Name", "name", "", "Name"]), ["Name", "name_2", "column_3", "Name_3"]);
  assert.equal(customKeyFromHeader("Lead Score (0-100)"), "lead_score_0_100");
  assert.equal(customKeyFromHeader("2024 revenue"), "f_2024_revenue");
});

test("validate: errors vs warnings", () => {
  const bad = validateMappedRow({ fields: { email: "nope" }, custom: {} });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0]?.code, "EMAIL_INVALID_FORMAT");
  assert.equal(validateMappedRow({ fields: {}, custom: {} }).errors[0]?.code, "EMAIL_MISSING");

  const warn = validateMappedRow({ fields: { email: "Info@Example.com" }, custom: {} });
  assert.ok(warn.ok);
  assert.equal(warn.fields.email, "info@example.com");
  assert.deepEqual(warn.warnings.map((w) => w.code).sort(), ["MISSING_COMPANY", "MISSING_NAME", "ROLE_ADDRESS"]);

  assert.equal(validateMappedRow({ fields: { email: "a@b.co", timezone: "Mars/Olympus" }, custom: {} }).errors[0]?.code, "TIMEZONE_INVALID");
  assert.ok(validateMappedRow({ fields: { email: "a@b.co", timezone: "Africa/Johannesburg", firstName: "A", company: "C" }, custom: {} }).ok);
});

test("dedupe: in-file and existing classification", () => {
  const res = classifyDuplicates(
    [{ rowNumber: 2, email: "a@x.co" }, { rowNumber: 3, email: "b@x.co" }, { rowNumber: 4, email: "a@x.co" }, { rowNumber: 5, email: null }],
    new Set(["b@x.co"]),
  );
  assert.deepEqual(res.get(2), { kind: "NONE" });
  assert.deepEqual(res.get(3), { kind: "EXISTING" });
  assert.deepEqual(res.get(4), { kind: "IN_FILE", firstRowNumber: 2 });
  assert.deepEqual(res.get(5), { kind: "NONE" });
});

test("dedupe: strategy resolution", () => {
  assert.equal(resolveAction("NONE", "SKIP"), "IMPORT");
  assert.equal(resolveAction("EXISTING", "SKIP"), "SKIP");
  assert.equal(resolveAction("EXISTING", "UPDATE"), "UPDATE");
  assert.equal(resolveAction("EXISTING", "REVIEW"), "REVIEW");
  assert.equal(resolveAction("IN_FILE", "UPDATE"), "SKIP");
  assert.equal(resolveAction("IN_FILE", "REVIEW"), "REVIEW");
});

test("dedupe: merge never touches email/status and never blanks values", () => {
  const existing = { firstName: "Jane", company: null, custom: { tier: "A" } };
  const incoming = { email: "evil@x.co", firstName: "Janet", company: "Acme", jobTitle: "", custom: { tier: "B", region: "EU" } } as never;
  const fill = mergeLeadFields(existing, incoming, "FILL_BLANKS");
  assert.deepEqual(fill, { fields: { company: "Acme" }, custom: { region: "EU" } });
  const over = mergeLeadFields(existing, incoming, "OVERWRITE");
  assert.deepEqual(over, { fields: { firstName: "Janet", company: "Acme" }, custom: { tier: "B", region: "EU" } });
  assert.ok(!("email" in over.fields));
});

test("csv export: formula injection neutralised and quoting correct", () => {
  assert.equal(escapeCsvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(escapeCsvCell("+27 82"), "'+27 82");
  assert.equal(escapeCsvCell("a,b"), "\"a,b\"");
  assert.equal(escapeCsvCell("plain"), "plain");
});

test("template csv: header, example row and custom columns line up", () => {
  const lines = generateTemplateCsv(["lead_score"]).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0]!.split(",").length, lines[1]!.split(",").length);
  assert.ok(lines[0]!.startsWith("email,firstName"));
  assert.ok(lines[0]!.endsWith("lead_score"));
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
  assert.throws(() => chunk([1], 0));
});
