import { getContext } from "../../../../../server/auth.ts";
import { can } from "../../../../../lib/permissions.ts";
import { buildReportCsv } from "../../../../../server/imports/service.ts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, "import:read")) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const csv = await buildReportCsv(ctx, id);
  if (csv === null) return new Response("Not found", { status: 404 });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="import-report-${id}.csv"` } });
}
