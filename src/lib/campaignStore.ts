import crypto from "crypto";
import { hasSupabase, supabaseRest } from "./supabase";

export interface CampaignRecipientInput { name: string; email: string }

export async function createCampaign(args: {
  sessionId: string;
  accountId?: string;
  provider: string;
  subject: string;
  html: string;
  useGreeting: boolean;
  delayMs: number;
  recipients: CampaignRecipientInput[];
  retryOf?: string;
}) {
  const campaignId = crypto.randomUUID();
  if (!hasSupabase()) return campaignId;
  await supabaseRest("campaigns", {
    method: "POST",
    body: JSON.stringify({
      id: campaignId,
      session_id: args.sessionId,
      sender_account_id: args.accountId || null,
      provider: args.provider,
      subject: args.subject,
      html_content: args.html,
      use_greeting: args.useGreeting,
      delay_ms: args.delayMs,
      status: "running",
      total_count: args.recipients.length,
      prepared_count: args.recipients.length,
      sent_count: 0,
      failed_count: 0,
      retry_of: args.retryOf || null,
    }),
  }, { prefer: "return=minimal" });
  await supabaseRest("campaign_recipients", {
    method: "POST",
    body: JSON.stringify(args.recipients.map((recipient, index) => ({
      campaign_id: campaignId,
      name: recipient.name || null,
      email: recipient.email.toLowerCase(),
      status: "prepared",
      queue_position: index + 1,
    }))),
  }, { prefer: "return=minimal" });
  return campaignId;
}

export async function recordCampaignResult(campaignId: string, email: string, status: "sent" | "failed", error?: string) {
  if (!hasSupabase()) return;
  await supabaseRest("rpc/record_campaign_result", {
    method: "POST",
    body: JSON.stringify({ p_campaign_id: campaignId, p_email: email.toLowerCase(), p_status: status, p_error: error || null }),
  });
}

export async function finishCampaign(campaignId: string, hasErrors: boolean) {
  if (!hasSupabase()) return;
  await supabaseRest(`campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: hasErrors ? "completed_with_errors" : "completed", completed_at: new Date().toISOString() }),
  }, { prefer: "return=minimal" });
}
