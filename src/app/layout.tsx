import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Lucid Stem CRM" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
