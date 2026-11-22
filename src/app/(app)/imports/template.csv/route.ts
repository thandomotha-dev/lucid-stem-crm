import { getContext } from "../../../../server/auth.ts";
import { prisma } from "../../../../server/db.ts";
import { can } from "../../../../lib/permissions.ts";
import { generateTemplateCsv } from "../../../../lib/import/templates.ts";

export async function GET() {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, "import:read")) return new Response("Unauthorised", { status: 401 });
  const defs = await prisma.customFieldDefinition.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { key: "asc" } });
  return new Response(generateTemplateCsv(defs.map((d) => d.key)), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="lucid-stem-leads-template.csv"' },
  });
}
