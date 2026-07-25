import { ConnectedAccount } from "./types";
import { hasSupabase, supabaseRest } from "./supabase";

const memory = new Map<string, string>();

export async function getJson<T>(key: string): Promise<T | null> {
  if (!hasSupabase()) {
    const raw = memory.get(key);
    return raw ? JSON.parse(raw) as T : null;
  }
  const rows = await supabaseRest<Array<{ value: T }>>(`app_kv?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  return rows[0]?.value ?? null;
}

export async function setJson(key: string, value: unknown, ttlSeconds?: number) {
  if (!hasSupabase()) {
    memory.set(key, JSON.stringify(value));
    return;
  }
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  await supabaseRest("app_kv?on_conflict=key", {
    method: "POST",
    body: JSON.stringify({ key, value, expires_at: expiresAt, updated_at: new Date().toISOString() }),
  }, { prefer: "resolution=merge-duplicates,return=minimal" });
}

export async function deleteKey(key: string) {
  if (!hasSupabase()) {
    memory.delete(key);
    return;
  }
  await supabaseRest(`app_kv?key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }, { prefer: "return=minimal" });
}

interface AccountRow {
  session_id: string;
  account_id: string;
  provider: ConnectedAccount["provider"];
  email: string;
  display_name?: string | null;
  refresh_token: string;
  access_token?: string | null;
  expires_at?: number | null;
  zoho_account_id?: string | null;
  created_at: string;
}

function fromRow(row: AccountRow): ConnectedAccount {
  return {
    id: row.account_id,
    provider: row.provider,
    email: row.email,
    displayName: row.display_name || undefined,
    refreshToken: row.refresh_token,
    accessToken: row.access_token || undefined,
    expiresAt: row.expires_at || undefined,
    zohoAccountId: row.zoho_account_id || undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function getAccounts(sessionId: string): Promise<ConnectedAccount[]> {
  if (!hasSupabase()) return (await getJson<ConnectedAccount[]>(`mail-sender:accounts:${sessionId}`)) || [];
  const rows = await supabaseRest<AccountRow[]>(`connected_accounts?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.asc`);
  return rows.map(fromRow);
}

export async function saveAccount(sessionId: string, account: ConnectedAccount) {
  if (!hasSupabase()) {
    const accounts = await getAccounts(sessionId);
    const withoutSame = accounts.filter((item) => !(item.provider === account.provider && item.email.toLowerCase() === account.email.toLowerCase()));
    withoutSame.push(account);
    await setJson(`mail-sender:accounts:${sessionId}`, withoutSame);
    return;
  }
  await supabaseRest("connected_accounts?on_conflict=session_id,provider,email", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      account_id: account.id,
      provider: account.provider,
      email: account.email.toLowerCase(),
      display_name: account.displayName || null,
      refresh_token: account.refreshToken,
      access_token: account.accessToken || null,
      expires_at: account.expiresAt || null,
      zoho_account_id: account.zohoAccountId || null,
      created_at: new Date(account.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    }),
  }, { prefer: "resolution=merge-duplicates,return=minimal" });
}

export async function removeAccount(sessionId: string, accountId: string) {
  if (!hasSupabase()) {
    const accounts = await getAccounts(sessionId);
    await setJson(`mail-sender:accounts:${sessionId}`, accounts.filter((item) => item.id !== accountId));
    return;
  }
  await supabaseRest(`connected_accounts?session_id=eq.${encodeURIComponent(sessionId)}&account_id=eq.${encodeURIComponent(accountId)}`, { method: "DELETE" }, { prefer: "return=minimal" });
}

export function hasPersistentStore() {
  return hasSupabase();
}
