"use client";
import { useActionState } from "react";
import { signupAction } from "../actions.ts";

export default function SignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="token" value={token} />
      <label>Your name<br /><input name="name" autoComplete="name" required /></label>
      <label>Password (at least 12 characters)<br />
        <input name="password" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label>Confirm password<br />
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      {state?.error && <p role="alert" className="error">{state.error}</p>}
      <button disabled={pending}>{pending ? "Creating account..." : "Create account"}</button>
    </form>
  );
}