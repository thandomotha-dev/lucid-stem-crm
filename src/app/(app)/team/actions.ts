"use server";
import { revalidatePath } from "next/cache";
import { createInvite, revokeInvite } from "../../../server/invites.ts";

type State = { error?: string; link?: string; email?: string } | undefined;

export async function createInviteAction(_prev: State, form: FormData): Promise<State> {
  try {
    const res = await createInvite(String(form.get("email") ?? ""), String(form.get("role") ?? ""));
    if (!res.ok) return { error: res.error };
    revalidatePath("/team");
    return { link: res.link, email: res.email };
  } catch (e) {
    console.error("[team] create invite failed", e);
    return { error: "You do not have permission, or something went wrong." };
  }
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  await revokeInvite(String(form.get("id") ?? ""));
  revalidatePath("/team");
}