import { NextRequest, NextResponse } from "next/server";
import { finishCampaign } from "@/lib/campaignStore";

export async function POST(req: NextRequest) {
  try {
    const { campaignId, hasErrors } = await req.json();
    if (!campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    await finishCampaign(campaignId, Boolean(hasErrors));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
