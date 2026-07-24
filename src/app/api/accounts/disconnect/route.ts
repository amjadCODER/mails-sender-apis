import { NextRequest, NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { removeAccount } from "@/lib/store";

export async function POST(req: NextRequest) {
  const { accountId } = await req.json();
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  const sessionId = await getSessionId(false);
  if (sessionId) await removeAccount(sessionId, accountId);
  return NextResponse.json({ ok: true });
}
