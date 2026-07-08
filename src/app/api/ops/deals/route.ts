export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllJamesDeals, isZohoConfigured, ZohoDeal } from '@/lib/zoho-client';
import {
  bulkGetMfg, bulkGetDelivery, bulkGetMeasurement, ensureMfgStartDate,
  MfgMilestones, DeliveryMilestones, MeasurementFlags,
} from '@/lib/ops-milestones';

const MANUFACTURING = 'In Manufacturing';

// GET /api/ops/deals?stages=A,B,C&withMfg=1&withDelivery=1&withMeasurement=1
//
// Filtered deal list for the ops pages. Fetches every James deal via the
// existing cached helper and filters in JS so we hit Zoho at most once per
// 5 minutes regardless of how many ops tabs are open.
//
// When `withMfg=1`, every deal currently at "In Manufacturing" that has no
// stored startDate gets one stamped with its current Modified_Time. This is
// the reliable clock for build progress — Zoho's Modified_Time drifts every
// time anyone edits the deal, but once we've stamped a startDate we never
// touch it again.
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

    if (withMfg) {
      const map = await bulkGetMfg(ids);
      // First-sight stamp: for any deal currently at "In Manufacturing" that
      // has no startDate yet, freeze its Modified_Time as the manufacturing
      // clock start. Idempotent — safe to run on every load.
      const needStamp = deals.filter(d =>
        d.Stage === MANUFACTURING && !map.get(d.id)?.startDate,
      );
      if (needStamp.length > 0) {
        console.log(`[ops/deals] stamping startDate for ${needStamp.length} manufacturing deal(s)`);
        await Promise.all(needStamp.map(async d => {
          const fallback = d.Modified_Time || d.Created_Time || new Date().toISOString();
          const record = await ensureMfgStartDate(d.id, fallback);
          map.set(d.id, record);
        }));
      }
      mfg = Object.fromEntries(map);
    }
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
