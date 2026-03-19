import { NextResponse } from 'next/server';
import {
  CalendarEvent, fetchCalendarEvents, isSalesCall, isCancelled,
  extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractCity, extractMeetingNotes,
} from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

function getWeekRange(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(start)} - ${fmt(end)}`;
}

function getTimeSlot(hour: number): 'morning' | 'afternoon' | 'late' {
  if (hour < 12) return 'morning';
  if (hour < 16) return 'afternoon';
  return 'late';
}

export async function GET() {
  try {
    const now = new Date();

    // Single fetch: 3 months back to 7 days ahead — covers dashboard + analytics
    const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 86400000);

    console.log('[Dashboard] Fetching calendar data (single call)...');
    const allEvents = await fetchCalendarEvents(threeMonthsAgo.toISOString(), sevenDaysAhead.toISOString());

    // Date boundaries
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const tomorrowEnd = new Date(todayEnd.getTime() + 86400000);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

    const inRange = (e: CalendarEvent, start: Date, end: Date) => {
      const d = new Date(e.start);
      return d >= start && d < end;
    };

    // === DASHBOARD DATA ===
    const monthEvents = allEvents.filter(e => inRange(e, monthStart, monthEnd));
    const monthlySalesCalls = monthEvents.filter(isSalesCall);
    const monthlyCancellations = monthEvents.filter(isCancelled);
    const weekSalesCalls = allEvents.filter(e => inRange(e, weekStart, weekEnd)).filter(isSalesCall);
    const upcomingDemos = allEvents.filter(e => inRange(e, now, sevenDaysAhead)).filter(isSalesCall);

    const calls = monthlySalesCalls.map(e => {
      const country = extractCountry(e);
      const city = extractCity(e);
      return {
        name: extractLeadName(e),
        email: getExternalAttendeeEmail(e),
        phone: extractPhone(e),
        date: e.start,
        country: [country, city].filter(Boolean).join(', ') || null,
        eventTitle: e.summary,
      };
    });

    const buildScheduleItem = (e: CalendarEvent) => {
      const n = extractMeetingNotes(e);
      return {
        time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
        name: extractLeadName(e),
        email: getExternalAttendeeEmail(e),
        phone: extractPhone(e),
        type: 'demo',
        location: [n.country, n.city].filter(Boolean).join(', ') || null,
        notes: n.notes || null,
        attendanceConfirmed: n.attendanceConfirmed ?? null,
        rescheduleReason: n.rescheduleReason || null,
      };
    };

    const todaySchedule = allEvents.filter(e => inRange(e, todayStart, todayEnd)).filter(isSalesCall).map(buildScheduleItem);
    const tomorrowSchedule = allEvents.filter(e => inRange(e, todayEnd, tomorrowEnd)).filter(isSalesCall).map(buildScheduleItem);

    // === ANALYTICS DATA (computed from same events, no extra API calls) ===
    const salesCalls = allEvents.filter(isSalesCall);
    const cancelled = allEvents.filter(isCancelled);

    // Weekly volume
    const weekMap = new Map<string, { calls: number; isCurrent: boolean }>();
    for (let i = 13; i >= 0; i--) {
      const weekDate = new Date(now.getTime() - i * 7 * 86400000);
      const label = getWeekRange(weekDate);
      if (!weekMap.has(label)) weekMap.set(label, { calls: 0, isCurrent: i === 0 });
    }
    for (const event of salesCalls) {
      const label = getWeekRange(new Date(event.start));
      if (weekMap.has(label)) weekMap.get(label)!.calls++;
    }
    const weeklyVolume = Array.from(weekMap.entries()).map(([week, data]) => ({
      week, calls: data.calls, isCurrent: data.isCurrent,
    }));

    // Day breakdown
    const dayBreakdown: Record<string, number> = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
    for (const event of salesCalls) {
      const day = new Date(event.start).toLocaleDateString('en-GB', { weekday: 'long' });
      if (day in dayBreakdown) dayBreakdown[day]++;
    }

    // Time slots
    const timeSlots = { morning: 0, afternoon: 0, late: 0 };
    for (const event of salesCalls) {
      timeSlots[getTimeSlot(new Date(event.start).getHours())]++;
    }

    // Monthly comparison
    const monthlyComparison: { month: string; calls: number; isCurrent: boolean }[] = [];
    for (let i = 3; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      const count = salesCalls.filter(e => { const d = new Date(e.start); return d >= mDate && d <= mEnd; }).length;
      monthlyComparison.push({ month: label, calls: count, isCurrent: i === 0 });
    }

    const busiestDay = Object.entries(dayBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
    const timeLabels = { morning: 'Morning (8-12)', afternoon: 'Afternoon (12-4)', late: 'Late (4-6)' };
    const busiestTime = Object.entries(timeSlots).sort(([, a], [, b]) => b - a)[0]?.[0] as keyof typeof timeLabels || 'morning';

    console.log(`[Dashboard] Sales calls: ${monthlySalesCalls.length}, Total 3mo: ${salesCalls.length}, Today: ${todaySchedule.length}, Tomorrow: ${tomorrowSchedule.length}`);

    // Zoho CRM data (non-blocking — won't break dashboard if Zoho fails)
    let zoho = null;
    try {
      const { isZohoConfigured, fetchAllJamesDeals, fetchAllJamesLeads, getDealValue, categorizeStage } = await import('@/lib/zoho-client');
      if (isZohoConfigured()) {
        const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
        const totalValue = deals.reduce((s: number, d) => s + getDealValue(d), 0);
        const activeLeads = leads.filter(l => l.Lead_Status && !['Won', 'Lost Lead', 'Junk Lead'].includes(l.Lead_Status)).length;

        // Conversion: match calendar emails to Zoho
        const dealEmails = new Set(deals.map(d => d.Email?.toLowerCase()).filter(Boolean));
        const calEmails = monthlySalesCalls.map(e => getExternalAttendeeEmail(e).toLowerCase()).filter(Boolean);
        const convertedCount = calEmails.filter(e => dealEmails.has(e)).length;
        const conversionRate = calEmails.length > 0 ? Math.round((convertedCount / calEmails.length) * 100) : 0;

        // Follow-up counts
        const nowMs = Date.now();
        let redCount = 0;
        leads.forEach(l => {
          const days = Math.floor((nowMs - new Date(l.Created_Time).getTime()) / 86400000);
          if ((!l.Lead_Status || l.Lead_Status === 'Not Contacted') && days > 1) redCount++;
        });
        deals.forEach(d => {
          const days = Math.floor((nowMs - new Date(d.Modified_Time).getTime()) / 86400000);
          if ((d.Stage === 'Awaiting Measurements' && days > 10) || d.Stage === 'LATE' || d.Stage === 'No Response from Customer') redCount++;
        });

        // Stage summary
        const stageSummary: Record<string, number> = {};
        deals.forEach(d => {
          const cat = categorizeStage(d.Stage);
          stageSummary[cat] = (stageSummary[cat] || 0) + 1;
        });

        zoho = {
          connected: true,
          totalLeads: leads.length,
          totalDeals: deals.length,
          totalValue: Math.round(totalValue),
          activeLeads,
          conversionRate,
          followUpsNeeded: redCount,
          stageSummary,
        };
        console.log(`[Dashboard] Zoho: ${leads.length} leads, ${deals.length} deals, £${Math.round(totalValue)}`);
      }
    } catch (zohoErr) {
      console.error('[Dashboard] Zoho error (non-fatal):', zohoErr);
    }

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
      analytics: {
        weeklyVolume, dayBreakdown, timeSlots, monthlyComparison,
        busiestDay, busiestTime: timeLabels[busiestTime],
        totalCancellations: cancelled.length,
        totalCalls: salesCalls.length,
      },
      zoho,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Dashboard data failed';
    console.error('[Dashboard] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
