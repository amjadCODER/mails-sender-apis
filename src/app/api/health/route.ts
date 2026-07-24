import { NextResponse } from "next/server";
import { hasPersistentStore } from "@/lib/store";
export async function GET() {
  return NextResponse.json({ ok: true, persistentStoreConfigured: hasPersistentStore(), runtime: "nodejs" });
}
