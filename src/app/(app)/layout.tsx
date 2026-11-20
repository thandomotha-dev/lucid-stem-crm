import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "../../server/auth.ts";
import { logoutAction } from "./actions.ts";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return (
    <>
      <nav>
        <strong>Lucid Stem CRM</strong>
        <Link href="/leads">Leads</Link>
        <Link href="/imports">Imports</Link>
        <Link href="/imports/new">Import CSV</Link>
        <span className="spacer" />
        <span className="muted">{ctx.userName} · {ctx.role.toLowerCase()}</span>
        <form action={logoutAction}><button>Sign out</button></form>
      </nav>
      <main>{children}</main>
    </>
  );
}