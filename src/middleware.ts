import { NextResponse, type NextRequest } from "next/server";

// Cheap gate only (cookie present). Real session validation happens server-side in getContext().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("ls_session");
  const onLogin = req.nextUrl.pathname === "/login";
  if (!hasSession && !onLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (hasSession && onLogin) return NextResponse.redirect(new URL("/leads", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
