export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  readAll, activeCards, wonThisMonth, lostThisMonth,
  countByColumn, totalValue, create, BoardColumn, COLUMNS,
} from '@/lib/board';

// GET /api/board                 → active cards only (default for the Kanban)
// GET /api/board?include=summary → active + won/lost + counts (for dashboard)
// GET /api/board?include=all     → every card
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const include = searchParams.get('include');

  if (include === 'all') {
    const all = await readAll();
    return NextResponse.json({ cards: all, total: all.length });
  }

  if (include === 'summary') {
    const [active, won, lost] = await Promise.all([activeCards(), wonThisMonth(), lostThisMonth()]);
    return NextResponse.json({
      activeCount: active.length,
      byColumn: countByColumn(active),
      wonThisMonth: { count: won.length, value: totalValue(won) },
      lostThisMonth: { count: lost.length },
    });
  }

  const cards = await activeCards();
  return NextResponse.json({
    cards,
    total: cards.length,
    byColumn: countByColumn(cards),
  });
}

// POST /api/board — add a card to the board
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const column: BoardColumn = COLUMNS.includes(body.column) ? body.column : 'interested';
    const card = await create({
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
      country: body.country || null,
      frame: body.frame || null,
      magnification: Array.isArray(body.magnification) ? body.magnification : (body.magnification ? [body.magnification] : []),
      px: !!body.px,
      headlight: body.headlight || null,
      notes: body.notes || '',
      column,
      followUpDate: body.followUpDate || null,
      debriefId: body.debriefId || null,
      value: typeof body.value === 'number' ? body.value : null,
    });
    return NextResponse.json({ card });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed';
    console.error('[Board POST]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
