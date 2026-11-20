export const CRM_FIELDS = [
  "email", "firstName", "lastName", "company", "jobTitle", "phone", "website", "industry", "country", "timezone",
] as const;
export type CrmField = (typeof CRM_FIELDS)[number];

export type MappingTarget =
  | { kind: "field"; field: CrmField }
  | { kind: "custom"; key: string }
  | { kind: "ignore" };

/** One entry per CSV column, aligned by column index (robust to duplicate or blank headers). */
export type ColumnMapping = MappingTarget[];

const ALIASES: Record<CrmField, string[]> = {
  email: ["email", "emailaddress", "workemail", "businessemail", "contactemail", "mail"],
  firstName: ["firstname", "first", "givenname", "forename"],
  lastName: ["lastname", "last", "surname", "familyname"],
  company: ["company", "companyname", "organisation", "organization", "business", "businessname", "employer"],
  jobTitle: ["jobtitle", "title", "position", "role"],
  phone: ["phone", "phonenumber", "mobile", "cell", "telephone", "tel"],
  website: ["website", "url", "site", "web"],
  industry: ["industry", "sector"],
  country: ["country"],
  timezone: ["timezone", "tz"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Make headers unique and non-empty: blanks become column_N, repeats become name_2, name_3 ... */
export function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const key = base.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

export const CUSTOM_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

export function customKeyFromHeader(header: string): string {
  const k = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(k) ? k.slice(0, 40) : `f_${k}`.slice(0, 40);
}

/** Suggest a mapping from headers. Each CRM field is claimed by at most one column; the rest are ignored. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const claimed = new Set<CrmField>();
  return headers.map((h): MappingTarget => {
    const s = squash(h);
    for (const field of CRM_FIELDS) {
      if (!claimed.has(field) && ALIASES[field].includes(s)) {
        claimed.add(field);
        return { kind: "field", field };
      }
    }
    return { kind: "ignore" };
  });
}

export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  const fields = new Set<string>(), customs = new Set<string>();
  for (const t of mapping) {
    if (t.kind === "field") {
      if (fields.has(t.field)) errors.push(`DUPLICATE_TARGET:${t.field}`);
      fields.add(t.field);
    } else if (t.kind === "custom") {
      if (!CUSTOM_KEY_PATTERN.test(t.key)) errors.push(`INVALID_CUSTOM_KEY:${t.key}`);
      if (customs.has(t.key)) errors.push(`DUPLICATE_TARGET:custom.${t.key}`);
      customs.add(t.key);
    }
  }
  if (!fields.has("email")) errors.push("EMAIL_NOT_MAPPED");
  return errors;
}

export type MappedRow = { fields: Partial<Record<CrmField, string>>; custom: Record<string, string> };

/** Apply a mapping to one CSV row. Values are trimmed; empty cells are omitted. */
export function applyMapping(cells: string[], mapping: ColumnMapping): MappedRow {
  const out: MappedRow = { fields: {}, custom: {} };
  mapping.forEach((t, i) => {
    const v = (cells[i] ?? "").trim();
    if (!v || t.kind === "ignore") return;
    if (t.kind === "field") out.fields[t.field] = v;
    else out.custom[t.key] = v;
  });
  return out;
}

export function encodeTarget(t: MappingTarget): string {
  if (t.kind === "field") return `field:${t.field}`;
  if (t.kind === "custom") return "custom";
  return "ignore";
}

export function decodeTarget(value: string, header: string): MappingTarget {
  if (value.startsWith("field:")) {
    const f = value.slice("field:".length);
    if ((CRM_FIELDS as readonly string[]).includes(f)) {
      return { kind: "field", field: f as CrmField };
    }
    return { kind: "ignore" };
  }
  if (value === "custom") {
    return { kind: "custom", key: customKeyFromHeader(header) };
  }
  return { kind: "ignore" };
}