import { checkEmail } from "./email.ts";
import type { CrmField, MappedRow } from "./mapping.ts";

export type RowIssue = { code: string; field?: string; message: string };
export type ValidatedRow = {
  ok: boolean;
  errors: RowIssue[];   // block import of this row
  warnings: RowIssue[]; // "missing information": row still imports
  fields: Partial<Record<CrmField, string>>;
  custom: Record<string, string>;
};

const MAX_LEN: Partial<Record<CrmField, number>> = { phone: 40 };
const DEFAULT_MAX = 200;
const CUSTOM_MAX = 1000;

function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

export function validateMappedRow(row: MappedRow): ValidatedRow {
  const errors: RowIssue[] = [], warnings: RowIssue[] = [];
  const fields = { ...row.fields };

  const emailRaw = fields.email;
  if (!emailRaw) {
    errors.push({ code: "EMAIL_MISSING", field: "email", message: "Email address is missing." });
    delete fields.email;
  } else {
    const c = checkEmail(emailRaw);
    if (!c.ok) {
      errors.push({ code: `EMAIL_${c.reason}`, field: "email", message: `Email address is not valid (${c.reason.toLowerCase().replace("_", " ")}).` });
      delete fields.email;
    } else {
      fields.email = c.normalized;
      if (c.isRoleAddress) warnings.push({ code: "ROLE_ADDRESS", field: "email", message: "Shared mailbox (info@, sales@ ...): poor outreach target." });
    }
  }

  for (const [k, v] of Object.entries(fields) as [CrmField, string][]) {
    if (k !== "email" && v.length > (MAX_LEN[k] ?? DEFAULT_MAX)) {
      errors.push({ code: "FIELD_TOO_LONG", field: k, message: `${k} is too long.` });
    }
  }
  if (fields.timezone && !isValidTimeZone(fields.timezone)) {
    errors.push({ code: "TIMEZONE_INVALID", field: "timezone", message: `"${fields.timezone}" is not a valid IANA time zone (e.g. Africa/Johannesburg).` });
  }
  for (const [k, v] of Object.entries(row.custom)) {
    if (v.length > CUSTOM_MAX) errors.push({ code: "FIELD_TOO_LONG", field: `custom.${k}`, message: `${k} is too long.` });
  }

  if (!fields.firstName && !fields.lastName) warnings.push({ code: "MISSING_NAME", message: "No name: personalisation will fall back to a generic greeting." });
  if (!fields.company) warnings.push({ code: "MISSING_COMPANY", field: "company", message: "No company." });

  return { ok: errors.length === 0, errors, warnings, fields, custom: row.custom };
}
