import crypto from "crypto";
import { appUrl, requireEnv } from "./env";
import { decrypt, encrypt } from "./crypto";
import { ConnectedAccount, OAuthProvider } from "./types";
import { getJson, setJson } from "./store";

export const oauthConfig = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"],
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Send"],
  },
  zoho: {
    authorize: "https://accounts.zoho.com/oauth/v2/auth",
    token: "https://accounts.zoho.com/oauth/v2/token",
    scopes: ["ZohoMail.accounts.READ", "ZohoMail.messages.CREATE"],
  },
} as const;

const envNames: Record<OAuthProvider, { id: string; secret: string }> = {
  google: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  microsoft: { id: "MICROSOFT_CLIENT_ID", secret: "MICROSOFT_CLIENT_SECRET" },
  zoho: { id: "ZOHO_CLIENT_ID", secret: "ZOHO_CLIENT_SECRET" },
};

export function callbackUrl(provider: OAuthProvider) {
  return `${appUrl()}/api/auth/${provider}/callback`;
}

export async function createAuthorizationUrl(provider: OAuthProvider, sessionId: string) {
  const config = oauthConfig[provider];
  const state = crypto.randomBytes(24).toString("base64url");
  await setJson(`mail-sender:oauth-state:${state}`, { sessionId, provider }, 600);
  const params = new URLSearchParams({
    client_id: requireEnv(envNames[provider].id),
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    state,
    scope: provider === "zoho" ? config.scopes.join(",") : config.scopes.join(" "),
  });
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent select_account");
  } else if (provider === "microsoft") {
    params.set("prompt", "select_account");
  } else {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }
  return `${config.authorize}?${params}`;
}

export async function verifyState(state: string, provider: OAuthProvider, sessionId: string) {
  const saved = await getJson<{ sessionId: string; provider: OAuthProvider }>(`mail-sender:oauth-state:${state}`);
  if (!saved || saved.sessionId !== sessionId || saved.provider !== provider) throw new Error("Invalid or expired OAuth state");
}

export async function exchangeCode(provider: OAuthProvider, code: string) {
  const config = oauthConfig[provider];
  const env = envNames[provider];
  const body = new URLSearchParams({
    client_id: requireEnv(env.id),
    client_secret: requireEnv(env.secret),
    redirect_uri: callbackUrl(provider),
    code,
    grant_type: "authorization_code",
  });
  if (provider === "microsoft") body.set("scope", config.scopes.join(" "));
  const response = await fetch(config.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || "Token exchange failed");
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function refreshAccessToken(account: ConnectedAccount): Promise<{ accessToken: string; account: ConnectedAccount }> {
  if (account.accessToken && account.expiresAt && account.expiresAt > Date.now() + 60_000) {
    return { accessToken: decrypt(account.accessToken), account };
  }
  const provider = account.provider;
  const config = oauthConfig[provider];
  const env = envNames[provider];
  const body = new URLSearchParams({
    client_id: requireEnv(env.id),
    client_secret: requireEnv(env.secret),
    refresh_token: decrypt(account.refreshToken),
    grant_type: "refresh_token",
  });
  if (provider === "microsoft") body.set("scope", config.scopes.join(" "));
  const response = await fetch(config.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || "Could not refresh account connection");
  const updated: ConnectedAccount = {
    ...account,
    accessToken: encrypt(json.access_token),
    refreshToken: json.refresh_token ? encrypt(json.refresh_token) : account.refreshToken,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
  return { accessToken: json.access_token, account: updated };
}
