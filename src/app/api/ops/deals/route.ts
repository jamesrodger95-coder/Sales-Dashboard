export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllJamesDeals, isZohoConfigured, fetchStageHistory, stageEntryDate, ZohoDeal } from '@/lib/zoho-client';
import {
  bulkGetMfg, bulkGetDelivery, bulkGetMeasurement, setMfgStartDate, needsStartDateRefresh,
  MfgMilestones, DeliveryMilestones, MeasurementFlags,
} from '@/lib/ops-milestones';

const MANUFACTURING = 'In Manufacturing';

// Pull Stage_History from Zoho and figure out when the deal actually entered
// "In Manufacturing". If Stage_History is empty or errors, fall back to
// Modified_Time — that's the same rough proxy we had before, but tagged so
// the next load will try Stage_History again.
async function resolveMfgStart(deal: ZohoDeal): Promise<{ date: string; source: 'stage_history' | 'modified_time' }> {
  const history = await fetchStageHistory(deal.id);
  const date = stageEntryDate(history, MANUFACTURING);
  if (date) return { date, source: 'stage_history' };
  return { date: deal.Modified_Time || deal.Created_Time || new Date().toISOString(), source: 'modified_time' };
}

// GET /api/ops/deals?stages=A,B,C&withMfg=1&withDelivery=1&withMeasurement=1
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
      // Refresh any manufacturing-stage deal whose startDate is missing or
      // came from a fallback (modified_time). Stage_history and manual stamps
      // are trusted and skipped.
      const needsRefresh = deals.filter(d => d.Stage === MANUFACTURING && needsStartDateRefresh(map.get(d.id)));
      if (needsRefresh.length > 0) {
        console.log(`[ops/deals] refreshing startDate via Zoho Stage_History for ${needsRefresh.length} deal(s)`);
        // Chunked concurrency — Zoho v6 rate limit is ~100 req/min, so 10 in
        // flight is safe and keeps first-load latency in the 3–5s range.
        const CHUNK = 10;
        for (let i = 0; i < needsRefresh.length; i += CHUNK) {
          const chunk = needsRefresh.slice(i, i + CHUNK);
          await Promise.all(chunk.map(async d => {
            const { date, source } = await resolveMfgStart(d);
            const record = await setMfgStartDate(d.id, date, source);
            map.set(d.id, record);
          }));
        }
        const bySource = { stage_history: 0, modified_time: 0 };
        for (const d of needsRefresh) {
          const src = map.get(d.id)?.startDateSource;
          if (src === 'stage_history') bySource.stage_history++;
          else if (src === 'modified_time') bySource.modified_time++;
        }
        console.log(`[ops/deals] refresh complete — stage_history: ${bySource.stage_history}, modified_time (fallback): ${bySource.modified_time}`);
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
