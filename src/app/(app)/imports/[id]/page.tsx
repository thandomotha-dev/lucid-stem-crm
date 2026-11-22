import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "../../../../server/auth.ts";
import { getImportDetail } from "../../../../server/imports/service.ts";
import { can } from "../../../../lib/permissions.ts";
import { CRM_FIELDS, encodeTarget, suggestMapping } from "../../../../lib/import/mapping.ts";
import { outcomeFor } from "../../../../lib/import/pipeline.ts";
import { configureImportAction, setStrategyAction, startImportAction } from "../actions.ts";

const FIELD_LABELS: Record<string, string> = { email: "Email", firstName: "First name", lastName: "Last name", company: "Company", jobTitle: "Job title", phone: "Phone", website: "Website", industry: "Industry", country: "Country", timezone: "Time zone" };

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; remap?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireContext("import:read");
  const d = await getImportDetail(ctx, id);
  if (!d) notFound();
  const { imp, headers, summary, statusCounts } = d;
  const canEdit = can(ctx.role, "import:create");
  const showMapping = imp.status === "UPLOADED" || imp.status === "MAPPED" || (imp.status === "VALIDATED" && sp.remap === "1");
  const mapping = d.mapping ?? suggestMapping(headers);
  const tags = (imp.defaultTags as unknown as string[]).join(", ");

  return (
    <>
      <h1>Import: {imp.filename}</h1>
      <p className="muted">Source: {imp.sourceLabel} · status: {imp.status.toLowerCase()} · {imp.totalRows} rows</p>
      {sp.error && <p role="alert" className="error">{sp.error}</p>}

      {showMapping && canEdit && (
        <>
          <h2>1. Map columns</h2>
          <p>Choose what each CSV column is. Email is required. &quot;Custom field&quot; keeps the column on the lead under its header name.</p>
          <form action={configureImportAction}>
            <input type="hidden" name="id" value={imp.id} />
            <input type="hidden" name="columns" value={headers.length} />
            <table>
              <thead><tr><th>CSV column</th><th>Example</th><th>Maps to</th></tr></thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td>{h}</td>
                    <td className="muted">{d.preview.slice(0, 2).map((r) => r.cells[i] ?? "").filter(Boolean).join(" · ").slice(0, 60)}</td>
                    <td>
                      <select name={`col_${i}`} defaultValue={encodeTarget(mapping[i] ?? { kind: "ignore" })}>
                        <option value="ignore">Ignore</option>
                        {CRM_FIELDS.map((f) => <option key={f} value={`field:${f}`}>{FIELD_LABELS[f]}</option>)}
                        <option value="custom">Custom field</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Options</h3>
            <div className="stack">
              <label>Source label<br /><input name="sourceLabel" defaultValue={imp.sourceLabel} maxLength={100} required /></label>
              <label>Tags to add to every imported lead (comma separated)<br /><input name="tags" defaultValue={tags} placeholder="e.g. expo-2026, warm" /></label>
              <label>If a lead already exists<br />
                <select name="strategy" defaultValue={imp.duplicateStrategy}>
                  <option value="SKIP">Skip it</option>
                  <option value="UPDATE">Update it (fills blank fields only)</option>
                  <option value="REVIEW">Let me review first</option>
                </select>
              </label>
              <button>Validate and preview</button>
            </div>
          </form>
        </>
      )}

      {imp.status === "VALIDATED" && !showMapping && summary && (() => {
        const o = outcomeFor(summary, imp.duplicateStrategy);
        return (
          <>
            <h2>2. Review and confirm</h2>
            <table>
              <tbody>
                <tr><td>Will be imported as new leads (status New)</td><td><strong>{o.willImport}</strong></td></tr>
                <tr><td>Existing leads that will be updated</td><td>{o.willUpdate}</td></tr>
                <tr><td>Duplicates that will be skipped</td><td>{o.willSkip}</td></tr>
                {o.needsReview > 0 && <tr><td>Duplicates waiting for your decision</td><td className="error">{o.needsReview}</td></tr>}
                <tr><td>Rows with errors (will not be imported)</td><td>{o.willFail}</td></tr>
              </tbody>
            </table>
            {Object.keys(summary.warnings).length > 0 && (
              <p className="muted">Missing information (rows still import): {Object.entries(summary.warnings).map(([k, n]) => `${k.replace("_", " ").toLowerCase()}: ${n}`).join(", ")}</p>
            )}
            <p>Tags: {tags || "none"} · duplicates: {imp.duplicateStrategy.toLowerCase()}. <strong>No emails are sent</strong> and no one is added to a campaign.</p>
            {canEdit && (
              <>
                <form action={setStrategyAction} className="row">
                  <input type="hidden" name="id" value={imp.id} />
                  <label>Duplicates <select name="strategy" defaultValue={imp.duplicateStrategy}>
                    <option value="SKIP">Skip</option><option value="UPDATE">Update (fill blanks)</option><option value="REVIEW">Review first</option>
                  </select></label>
                  <button>Apply</button>
                </form>
                <form action={startImportAction} className="row">
                  <input type="hidden" name="id" value={imp.id} />
                  <button disabled={o.needsReview > 0 || summary.valid === 0}>Confirm and import</button>
                  <Link href={`/imports/${imp.id}?remap=1`}>Change mapping</Link>
                </form>
              </>
            )}
            {d.invalid.length > 0 && (<><h3>Rows with errors (first {d.invalid.length})</h3><ul>{d.invalid.map((r) => <li key={r.rowNumber}>Row {r.rowNumber}: {r.issues.join(" ")} <span className="muted">({r.email})</span></li>)}</ul></>)}
            {d.duplicates.length > 0 && (<><h3>Duplicates (first {d.duplicates.length})</h3><ul>{d.duplicates.map((r) => <li key={r.rowNumber}>Row {r.rowNumber}: {r.email} <span className="muted">{r.kind === "IN_FILE" ? "repeated in this file" : "already in your CRM"}</span></li>)}</ul></>)}
          </>
        );
      })()}

      {imp.status === "IMPORTING" && (
        <>
          <meta httpEquiv="refresh" content="3" />
          <h2>Importing…</h2>
          <p>Imported {statusCounts.IMPORTED ?? 0} · updated {statusCounts.UPDATED ?? 0} · skipped {statusCounts.SKIPPED ?? 0} · failed {statusCounts.FAILED ?? 0} · remaining {(statusCounts.VALID ?? 0) + (statusCounts.DUPLICATE ?? 0)}</p>
          <p className="muted">This runs in the background worker. If the numbers don&apos;t move, make sure <code>npm run worker</code> is running.</p>
        </>
      )}

      {imp.status === "COMPLETED" && (
        <>
          <h2>Import complete</h2>
          <p>Imported {imp.importedCount} · updated {imp.updatedCount} · skipped {imp.skippedCount} · failed {imp.failedCount}</p>
          <p><a href={`/imports/${imp.id}/report.csv`}>Download the import report (CSV)</a> · <Link href="/leads">View leads</Link></p>
        </>
      )}
      {imp.status === "COMPLETED" || imp.status === "IMPORTING" ? null : <p><Link href="/imports">All imports</Link></p>}
    </>
  );
}
