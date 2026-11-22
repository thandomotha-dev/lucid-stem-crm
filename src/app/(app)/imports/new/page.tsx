import { requireContext } from "../../../../server/auth.ts";

export default async function NewImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireContext("import:create");
  const { error } = await searchParams;
  return (
    <>
      <h1>Import leads from CSV</h1>
      <p>Imported leads start as <strong>New</strong> and are <strong>not emailed</strong>. You choose a campaign separately.</p>
      <p><a href="/imports/template.csv">Download the CSV template</a> (UTF-8, first row = column names, up to 25 MB / 200,000 rows).</p>
      {error && <p role="alert" className="error">{error}</p>}
      <form action="/imports/upload" method="post" encType="multipart/form-data" className="stack">
        <label>CSV file<br /><input type="file" name="file" accept=".csv,text/csv" required /></label>
        <label>Where did this list come from?<br /><input name="sourceLabel" maxLength={100} placeholder="e.g. Expo attendee list, Nov 2026" required /></label>
        <button>Upload and continue</button>
      </form>
    </>
  );
}
