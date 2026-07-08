export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllJamesDeals, isZohoConfigured, ZohoDeal } from '@/lib/zoho-client';
import {
  bulkGetMfg, bulkGetDelivery, bulkGetMeasurement,
  MfgMilestones, DeliveryMilestones, MeasurementFlags,
} from '@/lib/ops-milestones';

// GET /api/ops/deals?stages=A,B,C&withMfg=1&withDelivery=1&withMeasurement=1
//
// Filtered deal list for the ops pages. Fetches every James deal via the
// existing cached helper and filters in JS so we hit Zoho at most once per
// 5 minutes regardless of how many ops tabs are open.
export async function GET(request: NextRequest) {
  if (!isZohoConfigured()) return NextResponse.json({ configured: false, deals: [] });
  try {
    const { searchParams } = new URL(request.url);
    const stages = (searchParams.get('stages') || '').split(',').map(s => s.trim()).filter(Boolean);
    const withMfg = searchParams.get('withMfg') === '1';
    const withDelivery = searchParams.get('withDelivery') === '1';
    const withMeasurement = searchParams.get('withMeasurement') === '1';

    const all = await fetchAllJamesDeals();
    const deals: ZohoDeal[] = stages.length > 0 ? all.filter(d => stages.includes(d.Stage)) : all;
    const ids = deals.map(d => d.id);

    let mfg: Record<string, MfgMilestones> = {};
    let delivery: Record<string, DeliveryMilestones> = {};
    let measurement: Record<string, MeasurementFlags> = {};
    if (withMfg)         mfg         = Object.fromEntries(await bulkGetMfg(ids));
    if (withDelivery)    delivery    = Object.fromEntries(await bulkGetDelivery(ids));
    if (withMeasurement) measurement = Object.fromEntries(await bulkGetMeasurement(ids));

    return NextResponse.json({
      configured: true,
      deals,
      total: deals.length,
      mfg,
      delivery,
      measurement,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    console.error('[ops/deals]', error);
    return NextResponse.json({ configured: true, error: msg, deals: [] }, { status: 500 });
  }
}
