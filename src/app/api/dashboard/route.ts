import { NextResponse } from 'next/server';
import {
  CalendarEvent, fetchCalendarEvents, isSalesCall, isCancelled,
  extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractCity, extractMeetingNotes,
} from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();

    // Fetch ONE range covering the whole month + 7 days ahead, then filter locally
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 86400000);
    const fetchEnd = sevenDaysAhead > new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      ? sevenDaysAhead : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    console.log('[Dashboard] Fetching calendar data...');
    const allEvents = await fetchCalendarEvents(monthStart.toISOString(), fetchEnd.toISOString());

    // Date boundaries
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const tomorrowEnd = new Date(todayEnd.getTime() + 86400000);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Filter locally
    const inRange = (e: CalendarEvent, start: Date, end: Date) => {
      const d = new Date(e.start);
      return d >= start && d < end;
    };

    const monthEvents = allEvents.filter(e => inRange(e, monthStart, monthEnd));
    const monthlySalesCalls = monthEvents.filter(isSalesCall);
    const monthlyCancellations = monthEvents.filter(isCancelled);
    const weekSalesCalls = allEvents.filter(e => inRange(e, weekStart, weekEnd)).filter(isSalesCall);
    const upcomingDemos = allEvents.filter(e => inRange(e, now, sevenDaysAhead)).filter(isSalesCall);

    // Call list
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

    // Schedule items
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

    const todaySchedule = allEvents.filter(e => inRange(e, todayStart, todayEnd)).filter(isSalesCall).map(buildScheduleItem);
    const tomorrowSchedule = allEvents.filter(e => inRange(e, todayEnd, tomorrowEnd)).filter(isSalesCall).map(buildScheduleItem);

    console.log(`[Dashboard] Sales calls: ${monthlySalesCalls.length}, Cancellations: ${monthlyCancellations.length}, Today: ${todaySchedule.length}, Tomorrow: ${tomorrowSchedule.length}`);

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
