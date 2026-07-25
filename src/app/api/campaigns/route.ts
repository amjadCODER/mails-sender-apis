import { NextRequest, NextResponse } from "next/server";
import { createCampaign } from "@/lib/campaignStore";
import { getSessionId } from "@/lib/session";

interface Recipient { name: string; email: string }

function normalizeRecipients(recipients: Recipient[]) {
  const seen = new Set<string>();
  return (recipients || []).map((item) => ({ name: String(item.name || "").trim(), email: String(item.email || "").trim().toLowerCase() })).filter((item) => {
    if (!item.email || seen.has(item.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) return false;
    seen.add(item.email);
    return true;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const recipients = normalizeRecipients(body.recipients || []);
    if (!recipients.length) return NextResponse.json({ error: "لا يوجد مستلمين صالحين" }, { status: 400 });
    if (!String(body.subject || "").trim()) return NextResponse.json({ error: "عنوان الرسالة مطلوب" }, { status: 400 });
    if (!String(body.html || "").trim()) return NextResponse.json({ error: "محتوى الرسالة مطلوب" }, { status: 400 });
    const sessionId = await getSessionId(true);
    const campaignId = await createCampaign({
      sessionId: sessionId!,
      accountId: body.accountId,
      provider: body.provider,
      subject: String(body.subject).trim(),
      html: String(body.html),
      useGreeting: Boolean(body.useGreeting),
      delayMs: Math.max(1000, Math.min(Number(body.delayMs) || 3000, 600000)),
      recipients,
      retryOf: body.retryCampaignId || undefined,
    });
    return NextResponse.json({ campaignId, prepared: recipients.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
