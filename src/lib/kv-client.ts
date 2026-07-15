// Small REST client for Upstash Redis / Vercel KV. Accepts either env-var
// pair — Vercel KV auto-provisions KV_REST_API_URL + KV_REST_API_TOKEN, and
// a direct Upstash Redis provision sets UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
// Both point at the same REST protocol so we treat them as interchangeable.

interface Creds {
  url: string;
  token: string;
  source: 'vercel_kv' | 'upstash';
}

export function getKvCreds(): Creds | null {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken, source: 'vercel_kv' };
  const upUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upUrl && upToken) return { url: upUrl, token: upToken, source: 'upstash' };
  return null;
}

export function hasKV(): boolean {
  return getKvCreds() !== null;
}

// Vercel KV and Upstash Redis both support the /get/{key} + /set/{key}
// simplified REST endpoints, so this helper works for either.
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const creds = getKvCreds();
  if (!creds) throw new Error('No KV credentials configured');
  const res = await fetch(`${creds.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
  const data = await res.json();
  if (!data?.result) return null;
  try { return JSON.parse(data.result) as T; } catch { return null; }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const creds = getKvCreds();
  if (!creds) throw new Error('No KV credentials configured');
  const res = await fetch(`${creds.url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KV set failed: ${res.status} ${text}`);
  }
}

export async function kvDel(key: string): Promise<void> {
  const creds = getKvCreds();
  if (!creds) throw new Error('No KV credentials configured');
  const res = await fetch(`${creds.url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KV del failed: ${res.status} ${text}`);
  }
}
