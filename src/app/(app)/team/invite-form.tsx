"use client";
import { useActionState } from "react";
import { createInviteAction } from "./actions.ts";

export default function InviteForm() {
  const [state, action, pending] = useActionState(createInviteAction, undefined);
  return (
    <form action={action} className="stack">
      <label>Email<br /><input name="email" type="email" required /></label>
      <label>Role<br />
        <select name="role" defaultValue="MEMBER">
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
          <option value="VIEWER">Viewer</option>
        </select>
      </label>
      {state?.error && <p role="alert" className="error">{state.error}</p>}
      {state?.link && (
        <div>
          <p>Invite created for {state.email}. Send them this link. It works once, expires in 7 days and is not shown again.</p>
          <input readOnly value={state.link} style={{ width: "100%" }} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <button disabled={pending}>{pending ? "Creating..." : "Create invite"}</button>
    </form>
  );
}