import { OAuthProvider } from "./types";

interface ProviderProfile { email: string; displayName: string; zohoAccountId?: string }

export async function getProviderProfile(provider: OAuthProvider, accessToken: string): Promise<ProviderProfile> {
  if (provider === "google") {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "Could not read Google account");
    return { email: String(json.email), displayName: String(json.name || json.email) };
  }
  if (provider === "microsoft") {
    const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "Could not read Microsoft account");
    return { email: String(json.mail || json.userPrincipalName), displayName: String(json.displayName || json.mail || json.userPrincipalName) };
  }
  const response = await fetch("https://mail.zoho.com/api/accounts", {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok || !json.data?.length) throw new Error(json.data?.errorCode || "Could not read Zoho account");
  const primary = json.data.find((item: { isPrimaryAccount?: boolean }) => item.isPrimaryAccount) || json.data[0];
  return {
    email: String(primary.primaryEmailAddress || primary.emailAddress?.[0] || primary.emailId),
    displayName: String(primary.accountDisplayName || primary.primaryEmailAddress),
    zohoAccountId: String(primary.accountId),
  };
}
