export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, isCancelled } from '@/lib/google-calendar';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();

    const range = searchParams.get('range') || '3m';
    const customFrom = searchParams.get('from');
    const customTo = searchParams.get('to');

    let startDate: Date;
    const endDate = customTo ? new Date(customTo) : now;

    if (customFrom) {
      startDate = new Date(customFrom);
    } else {
      switch (range) {
        case '1w': startDate = new Date(now.getTime() - 7 * 86400000); break;
        case '1m': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
        case '30d': startDate = new Date(now.getTime() - 30 * 86400000); break;
        case '6m': startDate = new Date(now.getTime() - 180 * 86400000); break;
        case '1y': startDate = new Date(now.getTime() - 365 * 86400000); break;
        default: startDate = new Date(now.getTime() - 90 * 86400000); break;
      }
    }

    // Single fetch for the entire range
    const allEvents = await fetchCalendarEvents(startDate.toISOString(), endDate.toISOString());
    const salesCalls = allEvents.filter(isSalesCall);
    const cancelled = allEvents.filter(isCancelled);

    // Weekly volume
    const weekMap = new Map<string, { calls: number; isCurrent: boolean }>();
    const weeksBack = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 86400000));
    for (let i = Math.min(weeksBack, 52); i >= 0; i--) {
      const weekDate = new Date(endDate.getTime() - i * 7 * 86400000);
      const label = getWeekRange(weekDate);
      if (!weekMap.has(label)) {
        weekMap.set(label, { calls: 0, isCurrent: i === 0 });
      }
    }
    for (const event of salesCalls) {
      const label = getWeekRange(new Date(event.start));
      if (weekMap.has(label)) weekMap.get(label)!.calls++;
    }
    const weeklyVolume = Array.from(weekMap.entries()).map(([week, data]) => ({
      week, calls: data.calls, isCurrent: data.isCurrent,
    }));

    // Day breakdown
    const dayBreakdown: Record<string, number> = {
      Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0,
    };
    for (const event of salesCalls) {
      const day = new Date(event.start).toLocaleDateString('en-GB', { weekday: 'long' });
      if (day in dayBreakdown) dayBreakdown[day]++;
    }

    // Time slots
    const timeSlots = { morning: 0, afternoon: 0, late: 0 };
    for (const event of salesCalls) {
      timeSlots[getTimeSlot(new Date(event.start).getHours())]++;
    }

    // Monthly comparison — computed from the already-fetched data only
    const monthlyComparison: { month: string; calls: number; isCurrent: boolean }[] = [];
    const monthsSpan = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (30 * 86400000)));
    for (let i = Math.min(monthsSpan, 12) - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = monthDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      const count = salesCalls.filter(e => {
        const d = new Date(e.start);
        return d >= monthDate && d <= monthEnd;
      }).length;
      monthlyComparison.push({ month: label, calls: count, isCurrent: i === 0 });
    }

    const busiestDay = Object.entries(dayBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
    const timeLabels = { morning: 'Morning (8-12)', afternoon: 'Afternoon (12-4)', late: 'Late (4-6)' };
    const busiestTime = Object.entries(timeSlots).sort(([, a], [, b]) => b - a)[0]?.[0] as keyof typeof timeLabels || 'morning';

    return NextResponse.json({
      weeklyVolume, dayBreakdown, timeSlots, monthlyComparison,
      busiestDay, busiestTime: timeLabels[busiestTime],
      totalCancellations: cancelled.length,
      totalCalls: salesCalls.length,
      range,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Analytics failed';
    console.error('Analytics error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
