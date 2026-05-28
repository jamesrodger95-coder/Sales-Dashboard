export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readAll, update, bucketByDate, magsJoin, Debrief } from '@/lib/debriefs';
import { isTelegramConfigured, sendToJames } from '@/lib/telegram';

function fmtRow(d: Debrief, prefix: string): string {
  const cfg = [magsJoin(d) || null, d.headlight, d.outcome].filter(Boolean).join(', ');
  const note = d.notes ? ` — "${d.notes}"` : '';
  const country = d.country ? ` (${d.country})` : '';
  const overdue = d.followUpDate ? Math.max(0, Math.floor((Date.now() - new Date(d.followUpDate).getTime()) / 86400000)) : 0;
  const overdueStr = overdue > 0 ? ` — ${overdue} ${overdue === 1 ? 'day' : 'days'} overdue` : '';
  return `${prefix} <b>${d.name}</b>${country} — ${cfg}${note}${overdueStr}`;
}

export async function GET(request: NextRequest) {
  // Allow manual triggers in dev; check vercel cron auth in prod
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const all = await readAll();
  const buckets = bucketByDate(all);
  const total = buckets.overdue.length + buckets.today.length;

  if (total === 0) {
    return NextResponse.json({ sent: false, reason: 'no follow-ups due', total: 0 });
  }

  const lines: string[] = [`Good morning James. You have ${total} follow-up${total === 1 ? '' : 's'} today:`, ''];
  buckets.overdue.forEach(d => lines.push(fmtRow(d, '🔴 OVERDUE:')));
  if (buckets.overdue.length > 0 && buckets.today.length > 0) lines.push('');
  buckets.today.forEach(d => lines.push(fmtRow(d, '📞 TODAY:')));
  lines.push('');
  lines.push("Reply <code>done [name]</code> to mark complete or <code>reschedule [name] [date]</code>.");

  const message = lines.join('\n');
  let telegramSent = false;

  if (isTelegramConfigured()) {
    telegramSent = await sendToJames(message);
  }

  // Mark each as reminder-sent so the nudge doesn't double-fire on already-handled items
  await Promise.all(
    [...buckets.overdue, ...buckets.today].map(d =>
      update(d.id, { reminderSent: true })
    )
  );

  return NextResponse.json({
    sent: telegramSent,
    telegramConfigured: isTelegramConfigured(),
    total,
    overdue: buckets.overdue.length,
    today: buckets.today.length,
    message,
  });
}
