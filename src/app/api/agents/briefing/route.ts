import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, getExternalAttendeeName, extractPhone, isCancelled } from '@/lib/google-calendar';
import { askClaude, AGENT_PROMPTS } from '@/lib/claude-client';

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfTomorrow = new Date(now);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59);

    // Fetch all needed data
    const [monthEvents, recentEvents, upcomingTomorrowEvents, upcomingWeekEvents] = await Promise.all([
      fetchCalendarEvents(monthStart.toISOString(), now.toISOString()),
      fetchCalendarEvents(fourteenDaysAgo.toISOString(), now.toISOString()),
      fetchCalendarEvents(now.toISOString(), endOfTomorrow.toISOString()),
      fetchCalendarEvents(now.toISOString(), sevenDaysAhead.toISOString()),
    ]);

    const monthlySalesCalls = monthEvents.filter(isSalesCall);
    const monthlyCancellations = monthEvents.filter(isCancelled);
    const recentSalesCalls = recentEvents.filter(isSalesCall);
    const upcomingSalesCalls = upcomingTomorrowEvents.filter(isSalesCall);
    const upcomingWeekDemos = upcomingWeekEvents.filter(isSalesCall);

    // This week demos (Mon-Sun of current week)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const thisWeekDemos = upcomingWeekEvents.filter(e => {
      const d = new Date(e.start);
      return d >= weekStart && d < weekEnd && isSalesCall(e);
    });

    // Today and tomorrow schedule
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59);
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0);

    const todaySchedule = upcomingSalesCalls
      .filter(e => new Date(e.start) <= todayEnd)
      .map(e => ({
        time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        event: `${e.summary} - ${getExternalAttendeeName(e)}`,
        phone: extractPhone(e),
      }));

    const tomorrowSchedule = upcomingSalesCalls
      .filter(e => new Date(e.start) >= tomorrowStart)
      .map(e => ({
        time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        event: `${e.summary} - ${getExternalAttendeeName(e)}`,
        phone: extractPhone(e),
      }));

    const briefingData = {
      date: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      callsThisMonth: monthlySalesCalls.length,
      demosThisWeek: thisWeekDemos.length,
      cancellations: monthlyCancellations.length,
      upcomingDemos: upcomingWeekDemos.length,
      recentCalls: recentSalesCalls.map(e => ({
        name: getExternalAttendeeName(e),
        date: e.start,
        phone: extractPhone(e),
        title: e.summary,
      })),
      todaySchedule,
      tomorrowSchedule,
    };

    const result = await askClaude(
      AGENT_PROMPTS.briefing,
      `Generate the morning briefing. Current data:\n\n${JSON.stringify(briefingData, null, 2)}`
    );

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Briefing agent failed';
    console.error('Briefing error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
