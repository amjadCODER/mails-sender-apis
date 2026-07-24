import nodemailer from "nodemailer";
import { NextRequest, NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { getAccounts, saveAccount } from "@/lib/store";
import { refreshAccessToken } from "@/lib/oauth";
import { ConnectedAccount } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Recipient { name: string; email: string }
interface CustomSmtp {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawMime(from: string, to: string, subject: string, html: string) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

async function sendOAuth(account: ConnectedAccount, to: string, subject: string, html: string) {
  const { accessToken, account: refreshed } = await refreshAccessToken(account);
  if (account.provider === "google") {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: buildRawMime(account.email, to, subject, html) }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "Google could not send the message");
  } else if (account.provider === "microsoft") {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.error?.message || `Microsoft send failed (${response.status})`);
    }
  } else {
    if (!account.zohoAccountId) throw new Error("Zoho account ID is missing. Disconnect and reconnect the account.");
    const response = await fetch(`https://mail.zoho.com/api/accounts/${account.zohoAccountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress: account.email, toAddress: to, subject, content: html, mailFormat: "html" }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.status?.code && Number(json.status.code) >= 400) {
      throw new Error(json.data?.errorCode || json.status?.description || `Zoho send failed (${response.status})`);
    }
  }
  return refreshed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accountId,
      provider,
      customSmtp,
      recipients,
      subject,
      html,
      useGreeting,
      delayMs = 3000,
    }: {
      accountId?: string;
      provider: "google" | "microsoft" | "zoho" | "custom";
      customSmtp?: CustomSmtp;
      recipients: Recipient[];
      subject: string;
      html: string;
      useGreeting: boolean;
      delayMs?: number;
    } = body;

    const cleanRecipients = (recipients || []).filter((item) => item.email?.trim());
    if (!cleanRecipients.length) return NextResponse.json({ error: "Add at least one recipient" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ error: "Subject is required" }, { status: 400 });

    const htmlContent = String(html || "");
    if (!htmlContent.trim()) return NextResponse.json({ error: "Email content is required" }, { status: 400 });

    let account: ConnectedAccount | undefined;
    let sessionId: string | null = null;
    let transporter: nodemailer.Transporter | undefined;

    if (provider === "custom") {
      if (!customSmtp?.host || !customSmtp.username || !customSmtp.password || !customSmtp.port) {
        return NextResponse.json({ error: "Complete all custom SMTP fields" }, { status: 400 });
      }
      transporter = nodemailer.createTransport({
        host: customSmtp.host,
        port: Number(customSmtp.port),
        secure: Boolean(customSmtp.secure),
        auth: { user: customSmtp.username, pass: customSmtp.password },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 45_000,
      });
      await transporter.verify();
    } else {
      sessionId = await getSessionId(false);
      if (!sessionId || !accountId) return NextResponse.json({ error: "Connect and select a sender account first" }, { status: 401 });
      account = (await getAccounts(sessionId)).find((item) => item.id === accountId && item.provider === provider);
      if (!account) return NextResponse.json({ error: "Connected sender account was not found" }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let sent = 0;
        let failed = 0;
        const failedEmails: string[] = [];
        let currentAccount = account;
        for (let i = 0; i < cleanRecipients.length; i++) {
          const recipient = cleanRecipients[i];
          const html = useGreeting && recipient.name
            ? `<p>Dear ${recipient.name},</p>${htmlContent}`
            : htmlContent;
          try {
            if (provider === "custom") {
              await transporter!.sendMail({
                from: customSmtp!.username,
                to: recipient.email,
                subject,
                html,
              });
            } else {
              currentAccount = await sendOAuth(currentAccount!, recipient.email, subject, html);
              await saveAccount(sessionId!, currentAccount);
            }
            sent++;
            controller.enqueue(encoder.encode(JSON.stringify({ status: "success", email: recipient.email, sent, failed, total: cleanRecipients.length }) + "\n"));
          } catch (error) {
            failed++;
            failedEmails.push(recipient.email);
            controller.enqueue(encoder.encode(JSON.stringify({ status: "error", email: recipient.email, error: (error as Error).message, sent, failed, total: cleanRecipients.length }) + "\n"));
          }
          if (i < cleanRecipients.length - 1) await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Math.min(Number(delayMs) || 3000, 60_000))));
        }
        controller.enqueue(encoder.encode(JSON.stringify({ status: "complete", sent, failed, failedEmails }) + "\n"));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
