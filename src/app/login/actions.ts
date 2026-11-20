"use server";
import { redirect } from "next/navigation";
import { login } from "../../server/auth.ts";

export async function loginAction(_prev: { error?: string } | undefined, form: FormData) {
  const res = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!res.ok) return { error: res.error };
  redirect("/leads");
}
