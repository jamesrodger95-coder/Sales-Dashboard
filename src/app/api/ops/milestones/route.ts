export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  setMfgMilestone, getMfgMilestones,
  setDeliveryMilestone, getDeliveryMilestones, patchDeliveryFlags,
  setMeasurementIssue, getMeasurementFlags,
} from '@/lib/ops-milestones';

// GET  /api/ops/milestones?type=mfg|delivery|measurement&dealId=X
// POST /api/ops/milestones
//   Milestone send:  { type: 'mfg'|'delivery', dealId, weekKey, sent, sentBy?, dispatchedAt? }
//   Delivery flags:  { type: 'delivery', dealId, action: 'flags', fitCallDone?, customerHappy?, dispatchedAt? }
//   Measurement flag: { type: 'measurement', dealId, issueFlagged: boolean, notes? }
//
// One patch per request avoids read-modify-write races when multiple VAs are
// clicking through the same view.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const dealId = searchParams.get('dealId');
  if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 });

  if (type === 'mfg') return NextResponse.json({ milestones: await getMfgMilestones(dealId) });
  if (type === 'delivery') return NextResponse.json({ milestones: await getDeliveryMilestones(dealId) });
  if (type === 'measurement') return NextResponse.json({ measurement: await getMeasurementFlags(dealId) });
  return NextResponse.json({ error: 'type must be mfg, delivery, or measurement' }, { status: 400 });
}

const VALID_DELIVERY_KEYS = ['week1', 'week8', 'week16', 'week20', 'week24'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, dealId } = body || {};
    if (!type || !dealId) return NextResponse.json({ error: 'type and dealId required' }, { status: 400 });

    if (type === 'measurement') {
      const issueFlagged = !!body.issueFlagged;
      const record = await setMeasurementIssue(dealId, issueFlagged, body.notes);
      return NextResponse.json({ measurement: record });
    }

    // Delivery flag patches (fit call, customer happy) — separate path from milestone sends
    if (type === 'delivery' && body.action === 'flags') {
      const record = await patchDeliveryFlags(dealId, {
        fitCallDone: body.fitCallDone,
        fitCallDate: body.fitCallDate,
        customerHappy: body.customerHappy,
        dispatchedAt: body.dispatchedAt,
      });
      return NextResponse.json({ milestones: record });
    }

    // Milestone-sent updates
    const { weekKey, sent, sentBy, dispatchedAt } = body;
    if (!weekKey) return NextResponse.json({ error: 'weekKey required' }, { status: 400 });

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
      if (!(VALID_DELIVERY_KEYS as readonly string[]).includes(weekKey)) {
        return NextResponse.json({ error: `weekKey must be one of ${VALID_DELIVERY_KEYS.join(', ')}` }, { status: 400 });
      }
      const updated = await setDeliveryMilestone(
        dealId,
        weekKey as (typeof VALID_DELIVERY_KEYS)[number],
        entry,
        dispatchedAt,
      );
      return NextResponse.json({ milestones: updated });
    }
    return NextResponse.json({ error: 'type must be mfg, delivery, or measurement' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed';
    console.error('[ops/milestones POST]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
