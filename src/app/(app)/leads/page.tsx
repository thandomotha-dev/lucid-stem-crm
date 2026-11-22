import Link from "next/link";
import { requireContext } from "../../../server/auth.ts";
import { listLeads } from "../../../server/leads.ts";
import { can } from "../../../lib/permissions.ts";
import { createLeadAction } from "../actions.ts";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireContext("lead:read");
  const { items, total, page, pageSize } = await listLeads(ctx, { search: sp.q, status: sp.status, page: Number(sp.page) || 1 });
  return (
    <>
      <h1>Leads <span className="muted">({total})</span></h1>
      <form className="row" method="get">
        <input name="q" placeholder="Search name, company, email" defaultValue={sp.q} />
        <button>Search</button>
      </form>
      {sp.error && <p role="alert" className="error">{sp.error}</p>}
      <table>
        <thead><tr><th>Email</th><th>Name</th><th>Company</th><th>Status</th><th>Tags</th></tr></thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <td><Link href={`/leads/${l.id}`}>{l.email}</Link></td>
              <td>{[l.firstName, l.lastName].filter(Boolean).join(" ")}</td>
              <td>{l.company}</td>
              <td>{l.status.replace("_", " ").toLowerCase()}</td>
              <td>{l.tags.map((t) => t.tag.name).join(", ")}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="muted">No leads yet. Add one below; CSV import arrives in the next step.</td></tr>}
        </tbody>
      </table>
      <p className="muted">Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</p>
      {can(ctx.role, "lead:create") && (
        <>
          <h2>Add a lead</h2>
          <form action={createLeadAction} className="row">
            <input name="email" type="email" placeholder="Email (required)" required />
            <input name="firstName" placeholder="First name" />
            <input name="lastName" placeholder="Last name" />
            <input name="company" placeholder="Company" />
            <input name="tags" placeholder="Tags, comma separated" />
            <button>Add lead</button>
          </form>
        </>
      )}
    </>
  );
}
