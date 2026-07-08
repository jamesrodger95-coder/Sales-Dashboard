export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  setMfgMilestone, getMfgMilestones,
  setDeliveryMilestone, getDeliveryMilestones,
} from '@/lib/ops-milestones';

// GET  /api/ops/milestones?type=mfg&dealId=X
// POST /api/ops/milestones  { type: 'mfg'|'delivery', dealId, weekKey, sent, sentBy?, dispatchedAt? }
//
// The whole VA UI is optimistic — one milestone per POST is the simplest
// contract and avoids read-modify-write issues if two VAs mark different
// milestones concurrently.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const dealId = searchParams.get('dealId');
  if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 });

  if (type === 'mfg') {
    return NextResponse.json({ milestones: await getMfgMilestones(dealId) });
  }
  if (type === 'delivery') {
    return NextResponse.json({ milestones: await getDeliveryMilestones(dealId) });
  }
  return NextResponse.json({ error: 'type must be mfg or delivery' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, dealId, weekKey, sent, sentBy, dispatchedAt } = body || {};
    if (!type || !dealId || !weekKey) {
      return NextResponse.json({ error: 'type, dealId, weekKey required' }, { status: 400 });
    }
    const entry = {
      sent: sent === undefined ? true : !!sent,
      sentAt: sent === false ? undefined : new Date().toISOString(),
      sentBy: typeof sentBy === 'string' && sentBy ? sentBy : undefined,
    };
    if (type === 'mfg') {
      const updated = await setMfgMilestone(dealId, weekKey, entry);
      return NextResponse.json({ milestones: updated });
    }
    if (type === 'delivery') {
      const validKeys = ['week1', 'week8', 'week16', 'week20'];
      if (!validKeys.includes(weekKey)) {
        return NextResponse.json({ error: `weekKey must be one of ${validKeys.join(', ')}` }, { status: 400 });
      }
      const updated = await setDeliveryMilestone(
        dealId,
        weekKey as 'week1' | 'week8' | 'week16' | 'week20',
        entry,
        dispatchedAt,
      );
      return NextResponse.json({ milestones: updated });
    }
    return NextResponse.json({ error: 'type must be mfg or delivery' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed';
    console.error('[ops/milestones POST]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
