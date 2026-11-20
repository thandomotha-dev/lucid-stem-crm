import { notFound } from "next/navigation";
import { requireContext } from "../../../../server/auth.ts";
import { getLead } from "../../../../server/leads.ts";
import { can } from "../../../../lib/permissions.ts";
import { changeStatusAction } from "../../actions.ts";

const STATUSES = ["NEW", "CONTACTED", "AWAITING_RESPONSE", "REPLIED", "MEETING_SCHEDULED", "ON_HOLD", "NOT_INTERESTED", "CLIENT"];

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext("lead:read");
  const lead = await getLead(ctx, id);
  if (!lead) notFound();
  return (
    <>
      <h1>{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email}</h1>
      <p className="muted">{lead.email}{lead.company ? ` · ${lead.company}` : ""} · source: {lead.source ?? "unknown"}</p>
      <p>Outreach eligibility: {lead.marketingStatus.toLowerCase().replace("_", " ")} · email: {lead.emailHealth.toLowerCase()}</p>
      {can(ctx.role, "lead:update") && (
        <form action={changeStatusAction} className="row">
          <input type="hidden" name="id" value={lead.id} />
          <label>Status <select name="status" defaultValue={lead.status}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select></label>
          <button>Update status</button>
        </form>
      )}
      <h2>Activity</h2>
      <ul>
        {lead.activities.map((a) => (
          <li key={a.id}>{a.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC: {a.type}{Object.keys(a.data as object).length ? ` ${JSON.stringify(a.data)}` : ""}</li>
        ))}
      </ul>
    </>
  );
}
