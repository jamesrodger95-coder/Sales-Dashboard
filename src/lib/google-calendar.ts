// Direct Google Calendar API calls using fetch (no googleapis dependency)
// This avoids module-level initialization issues in Next.js serverless

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  console.log('[Calendar] Refreshing access token...');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.error('[Calendar] Token error:', data);
    throw new Error(`Google OAuth error: ${data.error_description || data.error}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
  console.log('[Calendar] Got access token:', data.access_token?.substring(0, 20) + '...');
  return data.access_token;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: { email: string; displayName?: string; responseStatus?: string }[];
  location?: string;
  description?: string;
  status?: string;
  htmlLink?: string;
}

const PHONE_REGEX = /(\+?\d[\d\s\-().]{7,}\d)/g;
const COUNTRY_REGEX = /Country\s*:?\s*([A-Za-z\s]+)/i;

export function extractPhone(event: CalendarEvent): string | null {
  const sources = [event.location, event.description].filter(Boolean);
  for (const source of sources) {
    const match = source?.match(PHONE_REGEX);
    if (match) return match[0].trim();
  }
  return null;
}

export function extractCountry(event: CalendarEvent): string | null {
  if (event.description) {
    const match = event.description.match(COUNTRY_REGEX);
    if (match) return match[1].trim();
  }
  const phone = extractPhone(event);
  if (phone) {
    if (phone.startsWith('+44')) return 'United Kingdom';
    if (phone.startsWith('+1')) return 'United States/Canada';
    if (phone.startsWith('+61')) return 'Australia';
    if (phone.startsWith('+353')) return 'Ireland';
    if (phone.startsWith('+49')) return 'Germany';
    if (phone.startsWith('+33')) return 'France';
    if (phone.startsWith('+971')) return 'UAE';
    if (phone.startsWith('+966')) return 'Saudi Arabia';
    if (phone.startsWith('+91')) return 'India';
    if (phone.startsWith('+65')) return 'Singapore';
    if (phone.startsWith('+64')) return 'New Zealand';
  }
  return null;
}

export function isCancelled(event: CalendarEvent): boolean {
  if (event.status === 'cancelled') return true;
  if (event.summary?.toLowerCase().startsWith('canceled:')) return true;
  if (event.summary?.toLowerCase().startsWith('cancelled:')) return true;
  const selfAttendee = event.attendees?.find(a =>
    a.email?.endsWith('@bryant.dental') && a.responseStatus === 'declined'
  );
  return !!selfAttendee;
}

export function isInternalOnly(event: CalendarEvent): boolean {
  if (!event.attendees || event.attendees.length === 0) return true;
  return event.attendees.every(
    a => a.email?.endsWith('@bryant.dental') || a.email?.endsWith('@calendar.google.com')
  );
}

export function hasCalendlyOrCalcom(event: CalendarEvent): boolean {
  const desc = event.description?.toLowerCase() || '';
  return desc.includes('calendly.com') || desc.includes('cal.com');
}

export function hasPhoneInLocation(event: CalendarEvent): boolean {
  return !!event.location?.match(PHONE_REGEX);
}

export function isSalesCall(event: CalendarEvent): boolean {
  if (isCancelled(event)) return false;
  if (event.summary?.toLowerCase().includes('leave') || event.summary?.toLowerCase().includes('holiday')) return false;
  // Skip all-day events (start has date but no dateTime)
  if (event.start && !event.start.includes('T')) return false;
  if (!isInternalOnly(event)) return true;
  if (hasCalendlyOrCalcom(event)) return true;
  if (hasPhoneInLocation(event)) return true;
  return false;
}

export function getExternalAttendeeName(event: CalendarEvent): string {
  const external = event.attendees?.find(
    a => !a.email?.endsWith('@bryant.dental') && !a.email?.endsWith('@calendar.google.com')
  );
  return external?.displayName || external?.email?.split('@')[0] || event.summary || 'Unknown';
}

export async function fetchCalendarEvents(
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: '500',
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;
  console.log(`[Calendar] Fetching events: ${timeMin} to ${timeMax}`);

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (data.error) {
    console.error('[Calendar] API error:', data.error);
    throw new Error(`Calendar API: ${data.error.message || data.error}`);
  }

  const items = data.items || [];
  console.log(`[Calendar] Got ${items.length} raw events`);

  interface GCalEvent {
    id?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
    location?: string;
    description?: string;
    status?: string;
    htmlLink?: string;
  }

  return items.map((event: GCalEvent) => ({
    id: event.id || '',
    summary: event.summary || '',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    attendees: (event.attendees || []).map(a => ({
      email: a.email || '',
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus || undefined,
    })),
    location: event.location || undefined,
    description: event.description || undefined,
    status: event.status || undefined,
    htmlLink: event.htmlLink || undefined,
  }));
}

export async function getSalesCallsForRange(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const events = await fetchCalendarEvents(timeMin, timeMax);
  return events.filter(isSalesCall);
}
