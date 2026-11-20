"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logout, requireContext } from "../../server/auth.ts";
import { createLead, changeLeadStatus } from "../../server/leads.ts";

export async function logoutAction() { await logout(); redirect("/login"); }

export async function createLeadAction(form: FormData) {
  const ctx = await requireContext("lead:create");
  const get = (k: string) => String(form.get(k) ?? "");
  const tags = get("tags").split(",").map((t) => t.trim()).filter(Boolean);
  const res = await createLead(ctx, { email: get("email"), firstName: get("firstName"), lastName: get("lastName"), company: get("company"), tags });
  if (!res.ok) redirect(`/leads?error=${encodeURIComponent(res.error)}`);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function changeStatusAction(form: FormData) {
  const ctx = await requireContext("lead:update");
  const id = String(form.get("id") ?? "");
  await changeLeadStatus(ctx, id, String(form.get("status") ?? ""));
  revalidatePath(`/leads/${id}`);
}
