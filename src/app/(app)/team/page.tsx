import { redirect } from "next/navigation";
import { getContext } from "../../../server/auth.ts";
import { listTeam } from "../../../server/invites.ts";
import { can } from "../../../lib/permissions.ts";
import InviteForm from "./invite-form.tsx";
import { revokeInviteAction } from "./actions.ts";

export default async function TeamPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "user:manage")) redirect("/leads");
  const { members, invites } = await listTeam();
  return (
    <>
      <h1>Team</h1>

      <h2>Members</h2>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{m.role.toLowerCase()}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Invite someone</h2>
      <InviteForm />

      <h2>Invites</h2>
      {invites.length === 0 ? <p className="muted">No invites yet.</p> : (
        <table>
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th /></tr></thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{i.role.toLowerCase()}</td>
                <td>{i.state === "valid" ? "pending" : i.state}</td>
                <td>{i.expiresAt.toISOString().slice(0, 10)}</td>
                <td>
                  {i.state === "valid" && (
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <button>Revoke</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}