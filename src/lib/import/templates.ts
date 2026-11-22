import { CRM_FIELDS } from "./mapping.ts";

/** Neutralise spreadsheet formula injection (=, +, -, @) and quote per RFC 4180. Use for every CSV we export. */
export function escapeCsvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const EXAMPLE: Record<(typeof CRM_FIELDS)[number], string> = {
  email: "jane.doe@example.com", firstName: "Jane", lastName: "Doe", company: "Example Pty Ltd",
  jobTitle: "Operations Manager", phone: "+27 82 000 0000", website: "https://example.com",
  industry: "Logistics", country: "South Africa", timezone: "Africa/Johannesburg",
};

export function generateTemplateCsv(customKeys: string[] = []): string {
  const header = [...CRM_FIELDS, ...customKeys];
  const row = [...CRM_FIELDS.map((f) => EXAMPLE[f]), ...customKeys.map(() => "")];
  return [header, row].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}
