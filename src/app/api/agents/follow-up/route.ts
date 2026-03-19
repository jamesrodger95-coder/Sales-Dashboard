import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, getExternalAttendeeName, extractPhone } from '@/lib/google-calendar';
import { askClaude, AGENT_PROMPTS } from '@/lib/claude-client';

export async function GET() {
  try {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const events = await fetchCalendarEvents(fourteenDaysAgo.toISOString(), threeDaysAhead.toISOString());
    const salesCalls = events.filter(isSalesCall);

    const eventSummary = salesCalls.map(e => ({
      title: e.summary,
      date: e.start,
      isPast: new Date(e.start) < now,
      attendees: e.attendees.map(a => ({
        name: a.displayName || a.email,
        email: a.email,
        response: a.responseStatus,
      })),
      location: e.location,
      description: e.description?.substring(0, 300),
      contactName: getExternalAttendeeName(e),
      phone: extractPhone(e),
    }));

    const result = await askClaude(
      AGENT_PROMPTS.followUp,
      `Today is ${now.toISOString().split('T')[0]}. Here are calendar events from the past 14 days and next 3 days:\n\n${JSON.stringify(eventSummary, null, 2)}`
    );

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Follow-up agent failed';
    console.error('Follow-up error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
