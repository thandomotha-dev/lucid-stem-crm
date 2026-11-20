import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "../../../../server/auth.ts";
import { can } from "../../../../lib/permissions.ts";
import { MAX_IMPORT_BYTES } from "../../../../lib/import/parse.ts";
import { createImportFromUpload } from "../../../../server/imports/service.ts";

// A route handler (not a server action) so large uploads are not capped by the 1 MB server-action body limit.
export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url), 303);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) return new NextResponse("Bad origin", { status: 403 });
  const back = (msg: string) => NextResponse.redirect(new URL(`/imports/new?error=${encodeURIComponent(msg)}`, req.url), 303);
  if (!can(ctx.role, "import:create")) return back("You do not have permission to import leads.");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return back("Choose a CSV file.");
  if (file.size > MAX_IMPORT_BYTES) return back("File is larger than 25 MB.");
  const res = await createImportFromUpload(ctx, { filename: file.name, text: await file.text(), sourceLabel: String(form.get("sourceLabel") ?? "") });
  return res.ok ? NextResponse.redirect(new URL(`/imports/${res.data.id}`, req.url), 303) : back(res.error);
}
