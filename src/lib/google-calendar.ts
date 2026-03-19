import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults: 500,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  return events.map(event => ({
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
