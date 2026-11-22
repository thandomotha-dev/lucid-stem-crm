export type EmailCheck =
  | { ok: true; normalized: string; isRoleAddress: boolean }
  | { ok: false; reason: "EMPTY" | "INVALID_FORMAT" | "TOO_LONG" };

// Role mailboxes are valid but poor outreach targets; surfaced as a warning, never an error.
const ROLE_LOCALS = new Set([
  "info", "admin", "sales", "support", "contact", "hello", "office", "enquiries", "inquiries",
  "noreply", "no-reply", "postmaster", "webmaster", "accounts", "billing", "hr", "marketing", "team", "mail",
]);

const LOCAL_CHARS = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/;

/** Trim, strip "mailto:" and "Name <addr>" wrappers, lowercase. Does NOT fold Gmail dots or +tags. */
export function normalizeEmail(raw: string): string {
  let s = raw.trim().replace(/^mailto:/i, "");
  const angle = s.match(/<([^<>]+)>\s*$/);
  if (angle) s = angle[1]!;
  return s.trim().toLowerCase();
}

/** Pragmatic ASCII validation. Internationalised domains must be supplied as punycode (xn--). */
export function checkEmail(raw: string): EmailCheck {
  const n = normalizeEmail(raw);
  if (!n) return { ok: false, reason: "EMPTY" };
  if (n.length > 254) return { ok: false, reason: "TOO_LONG" };
  const at = n.lastIndexOf("@");
  if (at < 1 || n.indexOf("@") !== at) return { ok: false, reason: "INVALID_FORMAT" };
  const local = n.slice(0, at), domain = n.slice(at + 1);
  if (local.length > 64 || !LOCAL_CHARS.test(local)) return { ok: false, reason: "INVALID_FORMAT" };
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return { ok: false, reason: "INVALID_FORMAT" };
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => DOMAIN_LABEL.test(l)) || !TLD.test(labels[labels.length - 1]!)) {
    return { ok: false, reason: "INVALID_FORMAT" };
  }
  return { ok: true, normalized: n, isRoleAddress: ROLE_LOCALS.has(local) };
}
