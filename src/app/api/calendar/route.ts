import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, isCancelled, getExternalAttendeeName, extractPhone, extractCountry } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const timeMax = searchParams.get('timeMax') || new Date().toISOString();
    const filterSales = searchParams.get('salesOnly') !== 'false';
    const showCancelled = searchParams.get('cancelled') === 'true';

    const events = await fetchCalendarEvents(timeMin, timeMax);

    if (showCancelled) {
      const cancelled = events.filter(isCancelled);
      const mapped = cancelled.map(e => ({
        name: getExternalAttendeeName(e),
        date: e.start,
        originalTitle: e.summary,
        reason: e.status === 'cancelled' ? 'Event cancelled' :
          e.summary?.toLowerCase().startsWith('canceled:') ? 'Cancelled by organiser' :
          'Declined',
        phone: extractPhone(e),
        country: extractCountry(e),
      }));
      return NextResponse.json({ events: mapped, total: mapped.length });
    }

    const filtered = filterSales ? events.filter(isSalesCall) : events;

    const enriched = filtered.map(e => ({
      ...e,
      contactName: getExternalAttendeeName(e),
      phone: extractPhone(e),
      country: extractCountry(e),
      attendeeStatus: e.attendees?.find(a =>
        !a.email?.endsWith('@bryant.dental') && !a.email?.endsWith('@calendar.google.com')
      )?.responseStatus || 'unknown',
    }));

    return NextResponse.json({ events: enriched, total: enriched.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch calendar events';
    console.error('Calendar API error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
