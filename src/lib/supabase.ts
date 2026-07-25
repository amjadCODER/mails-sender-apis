function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

export function hasSupabase() {
  return Boolean(config());
}

export async function supabaseRest<T = unknown>(
  path: string,
  init: RequestInit = {},
  options: { prefer?: string; allow404?: boolean } = {},
): Promise<T> {
  const current = config();
  if (!current) throw new Error("Supabase server settings are missing");
  const response = await fetch(`${current.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: current.key,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (options.allow404 && response.status === 404) return null as T;
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase request failed (${response.status})`);
  return text ? JSON.parse(text) as T : (null as T);
}
