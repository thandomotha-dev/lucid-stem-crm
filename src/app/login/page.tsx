"use client";
import { useActionState } from "react";
import { loginAction } from "./actions.ts";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <main>
      <h1>Sign in to Lucid Stem CRM</h1>
      <form action={action} className="stack">
        <label>Email<br /><input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<br /><input name="password" type="password" autoComplete="current-password" required /></label>
        {state?.error && <p role="alert" className="error">{state.error}</p>}
        <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
