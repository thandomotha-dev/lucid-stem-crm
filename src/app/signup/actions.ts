"use server";
import { redirect } from "next/navigation";
import { acceptInvite } from "../../server/invites.ts";

export async function signupAction(_prev: { error?: string } | undefined, form: FormData) {
  const res = await acceptInvite(
    String(form.get("token") ?? ""),
    String(form.get("name") ?? ""),
    String(form.get("password") ?? ""),
    String(form.get("confirm") ?? ""),
  );
  if (!res.ok) return { error: res.error };
  redirect("/leads");
}