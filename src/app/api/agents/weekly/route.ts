import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, isCancelled } from '@/lib/google-calendar';
import { askClaude, AGENT_PROMPTS } from '@/lib/claude-client';

export async function GET() {
  try {
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const allEvents = await fetchCalendarEvents(fourWeeksAgo.toISOString(), now.toISOString());
    const salesCalls = allEvents.filter(isSalesCall);
    const cancelled = allEvents.filter(isCancelled);

    const eventSummary = salesCalls.map(e => ({
      title: e.summary,
      date: e.start,
      dayOfWeek: new Date(e.start).toLocaleDateString('en-GB', { weekday: 'long' }),
      hour: new Date(e.start).getHours(),
      attendeeCount: e.attendees.length,
      attendeeResponses: e.attendees.map(a => a.responseStatus),
    }));

    const result = await askClaude(
      AGENT_PROMPTS.weekly,
      `Today is ${now.toISOString().split('T')[0]}. Here are sales calls from the past 4 weeks:\n\n${JSON.stringify(eventSummary, null, 2)}\n\nCancelled events (${cancelled.length}): ${JSON.stringify(cancelled.map(e => ({ title: e.summary, date: e.start })))}`
    );

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Weekly analyst agent failed';
    console.error('Weekly analyst error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
