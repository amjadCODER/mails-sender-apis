import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CODE_HASH = "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c";

export function middleware(request: NextRequest) {
  const expectedHash = process.env.COMPANY_ACCESS_CODE_HASH?.trim() || DEFAULT_CODE_HASH;
  const accessCookie = request.cookies.get("manzor_company_access")?.value;
  if (accessCookie === expectedHash) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "غير مصرح بالدخول" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/access";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!access|api/access|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
