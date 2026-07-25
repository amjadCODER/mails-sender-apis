export type OAuthProvider = "google" | "microsoft" | "zoho";
export type MailProvider = OAuthProvider | "custom";

export interface ConnectedAccount {
  id: string;
  provider: OAuthProvider;
  email: string;
  displayName?: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  zohoAccountId?: string;
  createdAt: number;
}

export interface PublicConnectedAccount {
  id: string;
  provider: OAuthProvider;
  email: string;
  displayName?: string;
  createdAt: number;
}
