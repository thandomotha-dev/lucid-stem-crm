import Link from "next/link";
import { requireContext } from "../../../server/auth.ts";
import { listImports } from "../../../server/imports/service.ts";
import { can } from "../../../lib/permissions.ts";

export default async function ImportsPage() {
  const ctx = await requireContext("import:read");
  const imports = await listImports(ctx);
  return (
    <>
      <h1>Imports</h1>
      {can(ctx.role, "import:create") && <p><Link href="/imports/new">Import a CSV</Link> · <a href="/imports/template.csv">Download CSV template</a></p>}
      <table>
        <thead><tr><th>File</th><th>Source</th><th>Status</th><th>Rows</th><th>Imported</th><th>Updated</th><th>Skipped</th><th>Failed</th><th>Date</th></tr></thead>
        <tbody>
          {imports.map((i) => (
            <tr key={i.id}>
              <td><Link href={`/imports/${i.id}`}>{i.filename}</Link></td><td>{i.sourceLabel}</td><td>{i.status.toLowerCase()}</td>
              <td>{i.totalRows}</td><td>{i.importedCount}</td><td>{i.updatedCount}</td><td>{i.skippedCount}</td><td>{i.failedCount}</td>
              <td>{i.createdAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
          {imports.length === 0 && <tr><td colSpan={9} className="muted">No imports yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
