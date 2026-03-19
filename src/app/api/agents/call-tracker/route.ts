export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, getExternalAttendeeName, extractPhone, extractCountry } from '@/lib/google-calendar';
import { askClaude, AGENT_PROMPTS } from '@/lib/claude-client';

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const events = await fetchCalendarEvents(monthStart.toISOString(), monthEnd.toISOString());
    const salesCalls = events.filter(isSalesCall);

    const eventSummary = salesCalls.map(e => ({
      title: e.summary,
      date: e.start,
      attendees: e.attendees.map(a => `${a.displayName || ''} <${a.email}> (${a.responseStatus})`),
      location: e.location,
      description: e.description?.substring(0, 300),
      extractedName: getExternalAttendeeName(e),
      extractedPhone: extractPhone(e),
      extractedCountry: extractCountry(e),
    }));

    const result = await askClaude(
      AGENT_PROMPTS.callTracker,
      `Here are the calendar events for ${now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}:\n\n${JSON.stringify(eventSummary, null, 2)}`
    );

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Call tracker agent failed';
    console.error('Call tracker error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
