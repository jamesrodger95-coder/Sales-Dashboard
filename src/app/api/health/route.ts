export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

interface ServiceOk { status: 'ok'; detail?: string; [k: string]: unknown }
interface ServiceErr { status: 'error'; message: string; httpStatus?: number; raw?: unknown }
type ServiceResult = ServiceOk | ServiceErr;

interface HealthPayload {
  ok: boolean;
  env: Record<string, boolean>;
  calendar: ServiceResult;
  zoho: ServiceResult;
  anthropic: ServiceResult;
}

// ---- Helpers ----

function envFlags() {
  return {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
    ZOHO_CLIENT_ID: !!process.env.ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET: !!process.env.ZOHO_CLIENT_SECRET,
    ZOHO_REFRESH_TOKEN: !!process.env.ZOHO_REFRESH_TOKEN,
    ZOHO_API_DOMAIN: !!process.env.ZOHO_API_DOMAIN,
    ZOHO_AUTH_DOMAIN: !!process.env.ZOHO_AUTH_DOMAIN,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };
}

async function checkCalendar(): Promise<ServiceResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return { status: 'error', message: 'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN' };
  }

  // 1. Refresh token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || tokenBody.error) {
    console.error('[Health] Google token refresh failed:', tokenRes.status, tokenBody);
    return {
      status: 'error',
      httpStatus: tokenRes.status,
      message: `Google token refresh: ${tokenBody.error_description || tokenBody.error || tokenRes.statusText}`,
      raw: tokenBody,
    };
  }
  const accessToken = tokenBody.access_token as string;

  // 2. Tiny calendar API ping
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
  const params = new URLSearchParams({
    timeMin: start, timeMax: end, maxResults: '50', singleEvents: 'true', orderBy: 'startTime',
  });
  const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const calBody = await calRes.json().catch(() => ({}));
  if (!calRes.ok || calBody.error) {
    console.error('[Health] Calendar API failed:', calRes.status, calBody);
    return {
      status: 'error',
      httpStatus: calRes.status,
      message: `Calendar API: ${calBody?.error?.message || calRes.statusText}`,
      raw: calBody?.error || calBody,
    };
  }
  const events = (calBody.items as unknown[] | undefined) || [];
  return { status: 'ok', detail: `${events.length} events this month`, events: events.length };
}

async function checkZoho(): Promise<ServiceResult> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  const authDomain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';

  if (!clientId || !clientSecret || !refreshToken) {
    return { status: 'error', message: 'Missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN' };
  }

  // 1. Refresh token
  const tokenRes = await fetch(`${authDomain}/oauth/v2/token`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || tokenBody.error) {
    console.error('[Health] Zoho token refresh failed:', tokenRes.status, tokenBody);
    return {
      status: 'error',
      httpStatus: tokenRes.status,
      message: `Zoho token refresh: ${tokenBody.error || tokenRes.statusText}`,
      raw: tokenBody,
    };
  }
  const accessToken = tokenBody.access_token as string;

  // 2. Tiny leads ping
  const leadsUrl = `${apiDomain}/crm/v6/Leads/search?criteria=(Owner.name:equals:James Rodger)&fields=id&per_page=1`;
  const leadsRes = await fetch(leadsUrl, {
    cache: 'no-store',
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  });
  // Zoho returns 204 No Content when search finds zero records — that's not an error
  if (leadsRes.status === 204) {
    return { status: 'ok', detail: '0 leads (empty search)', leads: 0 };
  }
  const leadsBody = await leadsRes.json().catch(() => ({}));
  if (!leadsRes.ok) {
    console.error('[Health] Zoho leads ping failed:', leadsRes.status, leadsBody);
    return {
      status: 'error',
      httpStatus: leadsRes.status,
      message: `Zoho Leads: ${leadsBody?.message || leadsBody?.code || leadsRes.statusText}`,
      raw: leadsBody,
    };
  }
  const info = leadsBody.info as { count?: number } | undefined;
  return { status: 'ok', detail: `connected (Owner=James Rodger has ${info?.count ?? '?'} pages)`, leads: info?.count ?? null };
}

async function checkAnthropic(): Promise<ServiceResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 'error', message: 'Missing ANTHROPIC_API_KEY' };

  // /v1/models is a cheap GET that validates the key
  const res = await fetch('https://api.anthropic.com/v1/models', {
    cache: 'no-store',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[Health] Anthropic check failed:', res.status, body);
    return {
      status: 'error',
      httpStatus: res.status,
      message: `Anthropic: ${body?.error?.message || res.statusText}`,
      raw: body?.error || body,
    };
  }
  const count = Array.isArray(body.data) ? body.data.length : 0;
  return { status: 'ok', detail: `key valid (${count} models visible)` };
}

export async function GET() {
  const [calendar, zoho, anthropic] = await Promise.all([
    checkCalendar().catch((e: unknown) => ({
      status: 'error' as const,
      message: e instanceof Error ? e.message : String(e),
    })),
    checkZoho().catch((e: unknown) => ({
      status: 'error' as const,
      message: e instanceof Error ? e.message : String(e),
    })),
    checkAnthropic().catch((e: unknown) => ({
      status: 'error' as const,
      message: e instanceof Error ? e.message : String(e),
    })),
  ]);

  const payload: HealthPayload = {
    ok: calendar.status === 'ok' && zoho.status === 'ok' && anthropic.status === 'ok',
    env: envFlags(),
    calendar,
    zoho,
    anthropic,
  };
  return NextResponse.json(payload, { status: payload.ok ? 200 : 207 });
}
