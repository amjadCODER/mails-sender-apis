import { ConnectedAccount } from "./types";

const memory = new Map<string, string>();

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function command(args: (string | number)[]) {
  const config = kvConfig();
  if (!config) return null;
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`KV request failed: ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const result = await command(["GET", key]);
  const raw = result === null ? memory.get(key) : result;
  return raw ? JSON.parse(String(raw)) as T : null;
}

export async function setJson(key: string, value: unknown, ttlSeconds?: number) {
  const raw = JSON.stringify(value);
  const result = ttlSeconds
    ? await command(["SET", key, raw, "EX", ttlSeconds])
    : await command(["SET", key, raw]);
  if (result === null) memory.set(key, raw);
}

export async function deleteKey(key: string) {
  const result = await command(["DEL", key]);
  if (result === null) memory.delete(key);
}

const accountsKey = (sessionId: string) => `mail-sender:accounts:${sessionId}`;

export async function getAccounts(sessionId: string): Promise<ConnectedAccount[]> {
  return (await getJson<ConnectedAccount[]>(accountsKey(sessionId))) || [];
}

export async function saveAccount(sessionId: string, account: ConnectedAccount) {
  const accounts = await getAccounts(sessionId);
  const withoutSame = accounts.filter((item) => !(item.provider === account.provider && item.email.toLowerCase() === account.email.toLowerCase()));
  withoutSame.push(account);
  await setJson(accountsKey(sessionId), withoutSame);
}

export async function removeAccount(sessionId: string, accountId: string) {
  const accounts = await getAccounts(sessionId);
  await setJson(accountsKey(sessionId), accounts.filter((item) => item.id !== accountId));
}

export function hasPersistentStore() {
  return Boolean(kvConfig());
}
