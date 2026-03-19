import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, isCancelled } from '@/lib/google-calendar';

function getWeekRange(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  const end = new Date(start);
  end.setDate(end.getDate() + 4); // Friday
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

    // Fetch 8 weeks of data
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
    const allEvents = await fetchCalendarEvents(eightWeeksAgo.toISOString(), now.toISOString());
    const salesCalls = allEvents.filter(isSalesCall);
    const cancelled = allEvents.filter(isCancelled);

    // Weekly volume (8 weeks)
    const weekMap = new Map<string, { calls: number; isCurrent: boolean }>();
    for (let i = 7; i >= 0; i--) {
      const weekDate = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const label = getWeekRange(weekDate);
      if (!weekMap.has(label)) {
        weekMap.set(label, { calls: 0, isCurrent: i === 0 });
      }
    }
    for (const event of salesCalls) {
      const d = new Date(event.start);
      const label = getWeekRange(d);
      if (weekMap.has(label)) {
        weekMap.get(label)!.calls++;
      }
    }
    const weeklyVolume = Array.from(weekMap.entries()).map(([week, data]) => ({
      week,
      calls: data.calls,
      isCurrent: data.isCurrent,
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
      const hour = new Date(event.start).getHours();
      timeSlots[getTimeSlot(hour)]++;
    }

    // Monthly comparison (past 6 months)
    const monthlyComparison: { month: string; calls: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

      if (monthDate >= eightWeeksAgo) {
        const count = salesCalls.filter(e => {
          const d = new Date(e.start);
          return d >= monthDate && d <= monthEnd;
        }).length;
        monthlyComparison.push({ month: label, calls: count });
      } else {
        // Need to fetch older months separately
        try {
          const olderEvents = await fetchCalendarEvents(monthDate.toISOString(), monthEnd.toISOString());
          const olderSales = olderEvents.filter(isSalesCall);
          monthlyComparison.push({ month: label, calls: olderSales.length });
        } catch {
          monthlyComparison.push({ month: label, calls: 0 });
        }
      }
    }

    // Busiest day and time
    const busiestDay = Object.entries(dayBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
    const timeLabels = { morning: 'Morning (8-12)', afternoon: 'Afternoon (12-4)', late: 'Late (4-6)' };
    const busiestTime = Object.entries(timeSlots).sort(([, a], [, b]) => b - a)[0]?.[0] as keyof typeof timeLabels || 'morning';

    return NextResponse.json({
      weeklyVolume,
      dayBreakdown,
      timeSlots,
      monthlyComparison,
      busiestDay,
      busiestTime: timeLabels[busiestTime],
      totalCancellations: cancelled.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Analytics failed';
    console.error('Analytics error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
