import { NextResponse } from 'next/server';
import {
  fetchCalendarEvents,
  isSalesCall,
  isCancelled,
  getExternalAttendeeName,
  extractPhone,
  extractCountry,
} from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();

    // Date ranges
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(todayEnd);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    console.log('[Dashboard] Fetching calendar data...');

    // Fetch all data in parallel
    const [monthEvents, todayEvents, tomorrowEvents, weekEvents, upcomingEvents] = await Promise.all([
      fetchCalendarEvents(monthStart.toISOString(), monthEnd.toISOString()),
      fetchCalendarEvents(todayStart.toISOString(), todayEnd.toISOString()),
      fetchCalendarEvents(tomorrowStart.toISOString(), tomorrowEnd.toISOString()),
      fetchCalendarEvents(weekStart.toISOString(), weekEnd.toISOString()),
      fetchCalendarEvents(now.toISOString(), sevenDaysAhead.toISOString()),
    ]);

    console.log(`[Dashboard] Month: ${monthEvents.length}, Today: ${todayEvents.length}, Tomorrow: ${tomorrowEvents.length}`);

    // KPIs
    const monthlySalesCalls = monthEvents.filter(isSalesCall);
    const monthlyCancellations = monthEvents.filter(isCancelled);
    const weekSalesCalls = weekEvents.filter(isSalesCall);
    const upcomingDemos = upcomingEvents.filter(isSalesCall);

    // Call list
    const calls = monthlySalesCalls.map(e => ({
      name: getExternalAttendeeName(e),
      phone: extractPhone(e),
      date: e.start,
      country: extractCountry(e),
      eventTitle: e.summary,
    }));

    // Today schedule
    const todaySales = todayEvents.filter(isSalesCall);
    const todaySchedule = todaySales.map(e => ({
      time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
      event: `${e.summary} — ${getExternalAttendeeName(e)}`,
      type: 'demo',
      phone: extractPhone(e),
    }));

    // Tomorrow schedule
    const tomorrowSales = tomorrowEvents.filter(isSalesCall);
    const tomorrowSchedule = tomorrowSales.map(e => ({
      time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
      event: `${e.summary} — ${getExternalAttendeeName(e)}`,
      type: 'demo',
      phone: extractPhone(e),
    }));

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
