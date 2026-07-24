import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

const DEFAULT_CODE_HASH = "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: NextRequest) {
  const { code } = await request.json().catch(() => ({ code: "" }));
  const suppliedHash = sha256(String(code || "").trim());
  const expectedHash = process.env.COMPANY_ACCESS_CODE_HASH?.trim() || DEFAULT_CODE_HASH;
  const supplied = Buffer.from(suppliedHash, "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "كود الشركة غير صحيح" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("manzor_company_access", expectedHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
