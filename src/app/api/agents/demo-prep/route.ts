export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, getExternalAttendeeName, extractPhone, extractCountry } from '@/lib/google-calendar';
import { askClaude, AGENT_PROMPTS } from '@/lib/claude-client';

export async function GET() {
  try {
    const now = new Date();
    const sixtyMinutesAhead = new Date(now.getTime() + 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get upcoming events in next 60 minutes
    const upcoming = await fetchCalendarEvents(now.toISOString(), sixtyMinutesAhead.toISOString());
    const upcomingDemos = upcoming.filter(isSalesCall);

    if (upcomingDemos.length === 0) {
      // If nothing in 60 min, get next demo today
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59);
      const todayEvents = await fetchCalendarEvents(now.toISOString(), endOfDay.toISOString());
      const todayDemos = todayEvents.filter(isSalesCall);

      if (todayDemos.length === 0) {
        return NextResponse.json({
          message: 'No upcoming demos today',
          nextDemo: null,
        });
      }
      upcomingDemos.push(todayDemos[0]);
    }

    const demo = upcomingDemos[0];
    const contactName = getExternalAttendeeName(demo);

    // Check history for this contact
    const allPastEvents = await fetchCalendarEvents(threeMonthsAgo.toISOString(), now.toISOString());
    const historyWithContact = allPastEvents.filter(e =>
      e.attendees?.some(a =>
        (a.displayName || a.email || '').toLowerCase().includes(contactName.toLowerCase().split(' ')[0])
      )
    );

    const demoData = {
      event: {
        title: demo.summary,
        start: demo.start,
        attendees: demo.attendees,
        location: demo.location,
        description: demo.description,
        contactName,
        phone: extractPhone(demo),
        country: extractCountry(demo),
      },
      history: historyWithContact.map(e => ({
        title: e.summary,
        date: e.start,
      })),
    };

    const result = await askClaude(
      AGENT_PROMPTS.demoPrep,
      `Prepare a demo brief for this upcoming event:\n\n${JSON.stringify(demoData, null, 2)}`
    );

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Demo prep agent failed';
    console.error('Demo prep error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
