"use server";
import { redirect } from "next/navigation";
import { requireContext } from "../../../server/auth.ts";
import { configureImport, setDuplicateStrategy, startCommit } from "../../../server/imports/service.ts";

const go = (id: string, error?: string) => redirect(`/imports/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);

export async function configureImportAction(form: FormData) {
  const ctx = await requireContext("import:create");
  const id = String(form.get("id") ?? "");
  const count = Math.min(Number(form.get("columns")) || 0, 200);
  const targets = Array.from({ length: count }, (_, i) => String(form.get(`col_${i}`) ?? "ignore"));
  const res = await configureImport(ctx, id, { targets, strategy: String(form.get("strategy") ?? "SKIP"), tags: String(form.get("tags") ?? ""), sourceLabel: String(form.get("sourceLabel") ?? "") });
  go(id, res.ok ? undefined : res.error);
}

export async function setStrategyAction(form: FormData) {
  const ctx = await requireContext("import:create");
  const id = String(form.get("id") ?? "");
  const res = await setDuplicateStrategy(ctx, id, String(form.get("strategy") ?? ""));
  go(id, res.ok ? undefined : res.error);
}

export async function startImportAction(form: FormData) {
  const ctx = await requireContext("import:create");
  const id = String(form.get("id") ?? "");
  const res = await startCommit(ctx, id);
  go(id, res.ok ? undefined : res.error);
}
