// Direct Google Calendar API calls using fetch (no googleapis dependency)

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;
let refreshPromise: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  // Deduplicate concurrent refresh calls — all callers share one promise
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    console.log('[Calendar] Refreshing access token...');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      cache: 'no-store',
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
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    console.log('[Calendar] Got access token:', data.access_token?.substring(0, 20) + '...');
    return data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
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

// --- Name extraction: parse from event title first ---

export function extractLeadName(event: CalendarEvent): string {
  const summary = event.summary || '';

  // Try parsing from title: "Lead Name and James..." or "Lead Name and James | Bryant Dental Demo"
  const patterns = [
    / and James Rodger$/i,
    / and James \| Bryant Dental Demo$/i,
    / and James \| Bryant Dental$/i,
    / and James$/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(summary)) {
      const name = summary.replace(pattern, '').replace(/\s+/g, ' ').trim();
      if (name.length > 0 && name.length < 80) return name;
    }
  }

  // Fallback: try splitting on " and James"
  const andJamesIdx = summary.toLowerCase().indexOf(' and james');
  if (andJamesIdx > 0) {
    const name = summary.substring(0, andJamesIdx).replace(/\s+/g, ' ').trim();
    if (name.length > 0 && name.length < 80) return name;
  }

  // Fallback: attendee displayName
  const external = event.attendees?.find(
    a => !a.email?.endsWith('@bryant.dental') && !a.email?.endsWith('@calendar.google.com')
  );
  if (external?.displayName && external.displayName.length > 1) {
    return external.displayName;
  }

  // Last resort: format email nicely
  if (external?.email) {
    const prefix = external.email.split('@')[0];
    // Capitalize, replace dots/underscores with spaces, strip trailing numbers
    return prefix
      .replace(/[._]/g, ' ')
      .replace(/\d+$/g, '')
      .trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || prefix;
  }

  return summary || 'Unknown';
}

export function getExternalAttendeeEmail(event: CalendarEvent): string {
  const external = event.attendees?.find(
    a => !a.email?.endsWith('@bryant.dental') && !a.email?.endsWith('@calendar.google.com')
  );
  return external?.email || '';
}

// Keep old function name for backwards compat but use new logic
export function getExternalAttendeeName(event: CalendarEvent): string {
  return extractLeadName(event);
}

// --- Phone extraction ---

export function extractPhone(event: CalendarEvent): string | null {
  const sources = [event.location, event.description].filter(Boolean);
  for (const source of sources) {
    const match = source?.match(PHONE_REGEX);
    if (match) return match[0].trim();
  }
  return null;
}

// --- Country & city extraction ---

const PHONE_COUNTRY_MAP: Record<string, string> = {
  '+44': 'United Kingdom', '+1': 'North America', '+61': 'Australia',
  '+353': 'Ireland', '+49': 'Germany', '+33': 'France', '+34': 'Spain',
  '+39': 'Italy', '+31': 'Netherlands', '+32': 'Belgium', '+41': 'Switzerland',
  '+46': 'Sweden', '+47': 'Norway', '+358': 'Finland', '+36': 'Hungary',
  '+355': 'Albania', '+359': 'Bulgaria', '+56': 'Chile', '+27': 'South Africa',
  '+971': 'UAE', '+966': 'Saudi Arabia', '+965': 'Kuwait',
  '+91': 'India', '+65': 'Singapore', '+64': 'New Zealand',
};

export function extractCountry(event: CalendarEvent): string | null {
  const desc = event.description || '';

  // Priority 1: Parse "Country?: value" from description
  const countryMatch = desc.match(/Country\s*\??\s*:?\s*([^\n]+)/i);
  if (countryMatch) {
    const val = countryMatch[1].trim();
    if (val.length > 0 && val.length < 50) return val;
  }

  // Priority 2: Phone country code
  const phone = extractPhone(event);
  if (phone) {
    // Check longer codes first
    const sorted = Object.keys(PHONE_COUNTRY_MAP).sort((a, b) => b.length - a.length);
    for (const code of sorted) {
      if (phone.startsWith(code)) return PHONE_COUNTRY_MAP[code];
    }
  }

  return null;
}

export function extractCity(event: CalendarEvent): string | null {
  const desc = event.description || '';
  const cityMatch = desc.match(/City\s*\??\s*:?\s*([^\n]+)/i);
  if (cityMatch) {
    const val = cityMatch[1].trim();
    if (val.length > 0 && val.length < 50) return val;
  }
  return null;
}

// --- Meeting notes extraction from Calendly/Cal.com descriptions ---

export interface MeetingNotes {
  country?: string;
  city?: string;
  notes?: string;
  attendanceConfirmed?: boolean;
  rescheduleReason?: string;
}

export function extractMeetingNotes(event: CalendarEvent): MeetingNotes {
  const desc = event.description || '';
  const result: MeetingNotes = {};

  result.country = extractCountry(event) || undefined;
  result.city = extractCity(event) || undefined;

  // Notes from Calendly/Cal.com
  const notesPatterns = [
    /Please share anything that will help prepare for our meeting\s*\.?\s*:?\s*([^\n]+)/i,
    /Additional notes?\s*:?\s*([^\n]+)/i,
    /Notes?\s*:?\s*([^\n]+)/i,
    /Message\s*:?\s*([^\n]+)/i,
  ];
  for (const pattern of notesPatterns) {
    const match = desc.match(pattern);
    if (match && match[1].trim().length > 0) {
      result.notes = match[1].trim();
      break;
    }
  }

  // Attendance confirmation
  const attendanceMatch = desc.match(/Can we count on your attendance[^:]*:?\s*([^\n]+)/i);
  if (attendanceMatch) {
    result.attendanceConfirmed = attendanceMatch[1].trim().toLowerCase().startsWith('yes');
  }

  // Reschedule reason
  const rescheduleMatch = desc.match(/Reschedule Reason\s*:?\s*([^\n]+)/i);
  if (rescheduleMatch) {
    result.rescheduleReason = rescheduleMatch[1].trim();
  }

  return result;
}

// --- Event status helpers ---

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
  if (event.start && !event.start.includes('T')) return false;
  if (!isInternalOnly(event)) return true;
  if (hasCalendlyOrCalcom(event)) return true;
  if (hasPhoneInLocation(event)) return true;
  return false;
}

// --- Fetch ---

export async function fetchCalendarEvents(
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin, timeMax, maxResults: '500', singleEvents: 'true', orderBy: 'startTime',
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;
  console.log(`[Calendar] Fetching events: ${timeMin} to ${timeMax}`);

  // Try with current token, retry once with fresh token on 401
  for (let attempt = 0; attempt < 2; attempt++) {
    const accessToken = await getAccessToken();
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (res.status === 401 && attempt === 0) {
      console.log('[Calendar] Got 401, refreshing token and retrying...');
      cachedAccessToken = null;
      tokenExpiry = 0;
      continue;
    }

    const data = await res.json();

    if (data.error) {
      console.error('[Calendar] API error:', data.error);
      throw new Error(`Calendar API: ${data.error.message || data.error}`);
    }

    return parseEvents(data.items || []);
  }

  throw new Error('Calendar API: failed after retry');
}

interface GCalEvent {
  id?: string; summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
  location?: string; description?: string; status?: string; htmlLink?: string;
}

function parseEvents(items: GCalEvent[]): CalendarEvent[] {
  console.log(`[Calendar] Got ${items.length} raw events`);
  return items.map(event => ({
    id: event.id || '',
    summary: event.summary || '',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    attendees: (event.attendees || []).map(a => ({
      email: a.email || '', displayName: a.displayName || undefined, responseStatus: a.responseStatus || undefined,
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
