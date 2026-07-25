import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { encrypt } from "./crypto";
import { appUrl } from "./env";
import { createAuthorizationUrl, exchangeCode, verifyState } from "./oauth";
import { getProviderProfile } from "./providerProfile";
import { getSessionId } from "./session";
import { saveAccount } from "./store";
import { OAuthProvider } from "./types";

export async function connect(provider: OAuthProvider) {
  try {
    const sessionId = await getSessionId(true);
    const url = await createAuthorizationUrl(provider, sessionId!);
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.redirect(`${appUrl()}/?oauth_error=${encodeURIComponent((error as Error).message)}`);
  }
}

export async function callback(req: NextRequest, provider: OAuthProvider) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (providerError) throw new Error(providerError);
    if (!code || !state) throw new Error("Missing OAuth callback parameters");
    const sessionId = await getSessionId(true);
    await verifyState(state, provider, sessionId!);
    const token = await exchangeCode(provider, code);
    if (!token.refresh_token) throw new Error("The provider did not return a refresh token. Reconnect and approve access again.");
    const profile = await getProviderProfile(provider, token.access_token);
    await saveAccount(sessionId!, {
      id: crypto.randomUUID(),
      provider,
      email: profile.email,
      displayName: profile.displayName,
      zohoAccountId: profile.zohoAccountId,
      refreshToken: encrypt(token.refresh_token),
      accessToken: encrypt(token.access_token),
      expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
      createdAt: Date.now(),
    });
    return NextResponse.redirect(`${appUrl()}/?connected=${provider}`);
  } catch (error) {
    return NextResponse.redirect(`${appUrl()}/?oauth_error=${encodeURIComponent((error as Error).message)}`);
  }
}
