import { NextResponse } from 'next/server';
import {
  CalendarEvent, fetchCalendarEvents, isSalesCall, isCancelled,
  extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractCity, extractMeetingNotes,
} from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 86400000);

    console.log('[Dashboard] Fetching calendar data...');

    const [monthEvents, todayEvents, tomorrowEvents, weekEvents, upcomingEvents] = await Promise.all([
      fetchCalendarEvents(monthStart.toISOString(), monthEnd.toISOString()),
      fetchCalendarEvents(todayStart.toISOString(), todayEnd.toISOString()),
      fetchCalendarEvents(tomorrowStart.toISOString(), tomorrowEnd.toISOString()),
      fetchCalendarEvents(weekStart.toISOString(), weekEnd.toISOString()),
      fetchCalendarEvents(now.toISOString(), sevenDaysAhead.toISOString()),
    ]);

    const monthlySalesCalls = monthEvents.filter(isSalesCall);
    const monthlyCancellations = monthEvents.filter(isCancelled);
    const weekSalesCalls = weekEvents.filter(isSalesCall);
    const upcomingDemos = upcomingEvents.filter(isSalesCall);

    // Call list with proper names
    const calls = monthlySalesCalls.map(e => {
      const country = extractCountry(e);
      const city = extractCity(e);
      const location = [country, city].filter(Boolean).join(', ');
      return {
        name: extractLeadName(e),
        email: getExternalAttendeeEmail(e),
        phone: extractPhone(e),
        date: e.start,
        country: location || null,
        eventTitle: e.summary,
      };
    });

    // Build rich schedule items
    const buildScheduleItem = (e: CalendarEvent) => {
      const n = extractMeetingNotes(e);
      const loc = [n.country, n.city].filter(Boolean).join(', ');
      return {
        time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
        name: extractLeadName(e),
        email: getExternalAttendeeEmail(e),
        phone: extractPhone(e),
        type: 'demo',
        location: loc || null,
        notes: n.notes || null,
        attendanceConfirmed: n.attendanceConfirmed ?? null,
        rescheduleReason: n.rescheduleReason || null,
      };
    };

    const todaySchedule = todayEvents.filter(isSalesCall).map(buildScheduleItem);
    const tomorrowSchedule = tomorrowEvents.filter(isSalesCall).map(buildScheduleItem);

    console.log(`[Dashboard] Sales calls: ${monthlySalesCalls.length}, Cancellations: ${monthlyCancellations.length}`);

    return NextResponse.json({
      kpis: {
        callsThisMonth: monthlySalesCalls.length,
        demosThisWeek: weekSalesCalls.length,
        cancellations: monthlyCancellations.length,
        upcomingDemos: upcomingDemos.length,
      },
      calls,
      todaySchedule,
      tomorrowSchedule,
      month: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Dashboard data failed';
    console.error('[Dashboard] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
