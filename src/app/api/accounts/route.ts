import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { getAccounts, hasPersistentStore } from "@/lib/store";

export async function GET() {
  const sessionId = await getSessionId(true);
  const accounts = await getAccounts(sessionId!);
  return NextResponse.json({
    accounts: accounts.map(({ id, provider, email, displayName, createdAt }) => ({ id, provider, email, displayName, createdAt })),
    persistentStoreConfigured: hasPersistentStore(),
  });
}
