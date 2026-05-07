export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readAll, bucketByDate, isOverdue, isDueToday } from '@/lib/debriefs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');

  const all = await readAll();
  const today = dateParam ? new Date(dateParam) : new Date();

  if (dateParam) {
    // Specific-date query: items due that day or earlier and not done
    const items = all.filter(d => !d.followUpDone && d.followUpDate && d.followUpDate <= dateParam);
    return NextResponse.json({ items, total: items.length });
  }

  const buckets = bucketByDate(all, today);
  const dueToday = all.filter(d => isDueToday(d, today));
  const overdue = all.filter(d => isOverdue(d, today));

  return NextResponse.json({
    buckets,
    counts: {
      overdue: buckets.overdue.length,
      today: buckets.today.length,
      thisWeek: buckets.thisWeek.length,
      nextWeek: buckets.nextWeek.length,
      total: buckets.overdue.length + buckets.today.length + buckets.thisWeek.length + buckets.nextWeek.length,
    },
    dueToday,
    overdue,
  });
}
