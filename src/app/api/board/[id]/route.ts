export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { update, remove, BoardColumn, COLUMNS } from '@/lib/board';

// PUT /api/board/[id] — patch a card (move column, edit fields, mark won/lost)
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const patch: Record<string, unknown> = {};

    if (body.column !== undefined) {
      if (!COLUMNS.includes(body.column as BoardColumn)) {
        return NextResponse.json({ error: `Invalid column: ${body.column}` }, { status: 400 });
      }
      patch.column = body.column;
    }
    if (body.outcome !== undefined) {
      if (body.outcome !== null && body.outcome !== 'won' && body.outcome !== 'lost') {
        return NextResponse.json({ error: 'outcome must be won, lost, or null' }, { status: 400 });
      }
      patch.outcome = body.outcome;
    }
    if (body.lostReason !== undefined) patch.lostReason = body.lostReason || null;
    if (body.notes !== undefined) patch.notes = String(body.notes);
    if (body.followUpDate !== undefined) patch.followUpDate = body.followUpDate || null;
    if (body.value !== undefined) patch.value = typeof body.value === 'number' ? body.value : null;
    if (body.name !== undefined && body.name) patch.name = String(body.name);
    if (body.phone !== undefined) patch.phone = body.phone || null;
    if (body.country !== undefined) patch.country = body.country || null;
    if (body.frame !== undefined) patch.frame = body.frame || null;
    if (body.magnification !== undefined) {
      patch.magnification = Array.isArray(body.magnification) ? body.magnification : (body.magnification ? [body.magnification] : []);
    }
    if (body.px !== undefined) patch.px = !!body.px;
    if (body.headlight !== undefined) patch.headlight = body.headlight || null;

    const updated = await update(params.id, patch);
    if (!updated) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    return NextResponse.json({ card: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed';
    console.error('[Board PUT]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const ok = await remove(params.id);
  if (!ok) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
