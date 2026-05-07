export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readAll, create, Debrief, resolveFollowUpDate } from '@/lib/debriefs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = await readAll();

  const date = searchParams.get('date');
  const outcome = searchParams.get('outcome');
  const followUpDone = searchParams.get('followUpDone');
  const name = searchParams.get('name');
  const email = searchParams.get('email');

  let filtered = all;
  if (date) filtered = filtered.filter(d => d.callDate.startsWith(date));
  if (outcome) filtered = filtered.filter(d => d.outcome === outcome);
  if (followUpDone === 'true') filtered = filtered.filter(d => d.followUpDone);
  if (followUpDone === 'false') filtered = filtered.filter(d => !d.followUpDone);
  if (name) filtered = filtered.filter(d => d.name.toLowerCase().includes(name.toLowerCase()));
  if (email) filtered = filtered.filter(d => d.email?.toLowerCase() === email.toLowerCase());

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ debriefs: filtered, total: filtered.length });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const followUpDate = body.followUpDate
      || resolveFollowUpDate(body.followUpType || 'No Follow Up', body.followUpCustomDate);

    const debrief = await create({
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      country: body.country || null,
      callDate: body.callDate || new Date().toISOString(),
      frame: body.frame || null,
      magnification: body.magnification || null,
      px: !!body.px,
      headlight: body.headlight || null,
      outcome: body.outcome || null,
      notes: body.notes || '',
      followUpDate,
      followUpType: body.followUpType || 'No Follow Up',
      source: body.source || 'dashboard',
    } as Omit<Debrief, 'id' | 'createdAt' | 'reminderSent' | 'followUpDone'>);

    return NextResponse.json({ debrief });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save debrief';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
