export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readAll, update, isOverdue } from '@/lib/debriefs';
import { isTelegramConfigured, sendToJames } from '@/lib/telegram';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const all = await readAll();
  // Only items overdue, not done, where the morning reminder already went out and we haven't already nudged today.
  const today = new Date().toISOString().split('T')[0];
  const items = all.filter(d =>
    isOverdue(d)
    && d.reminderSent
    && (!d.nudgeSent || d.nudgeSent !== true)
    && d.followUpDate && d.followUpDate < today
  );

  if (items.length === 0) {
    return NextResponse.json({ sent: false, reason: 'no overdue items needing nudge', total: 0 });
  }

  const lines = items.slice(0, 5).map(d => {
    const overdue = d.followUpDate ? Math.floor((Date.now() - new Date(d.followUpDate).getTime()) / 86400000) : 0;
    return `• <b>${d.name}</b> — ${overdue} ${overdue === 1 ? 'day' : 'days'} overdue${d.notes ? ` — "${d.notes}"` : ''}`;
  });
  const message = `Reminder: ${items.length} follow-up${items.length === 1 ? '' : 's'} still overdue.\n\n${lines.join('\n')}\n\nReply <code>done [name]</code> or <code>reschedule [name] [date]</code>.`;

  let telegramSent = false;
  if (isTelegramConfigured()) {
    telegramSent = await sendToJames(message);
  }

  await Promise.all(items.map(d => update(d.id, { nudgeSent: true })));

  return NextResponse.json({ sent: telegramSent, total: items.length, message });
}
