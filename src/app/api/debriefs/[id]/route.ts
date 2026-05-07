export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { update, remove } from '@/lib/debriefs';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    if (body.followUpDone === true && !body.followUpDoneAt) {
      body.followUpDoneAt = new Date().toISOString();
    }
    const result = await update(params.id, body);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ debrief: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const ok = await remove(params.id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
