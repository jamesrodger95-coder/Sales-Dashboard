export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchAllJamesDeals, isZohoConfigured, getDealValue, categorizeDealStage } from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false, deals: [] });
  }
  try {
    const deals = await fetchAllJamesDeals();
    const byStage: Record<string, { count: number; value: number }> = {};
    const byCategory: Record<string, number> = {};
    let totalValue = 0;
    deals.forEach(d => {
      const s = d.Stage;
      if (!byStage[s]) byStage[s] = { count: 0, value: 0 };
      byStage[s].count++;
      const v = getDealValue(d);
      byStage[s].value += v;
      totalValue += v;
      const c = categorizeDealStage(s);
      byCategory[c] = (byCategory[c] || 0) + 1;
    });
    return NextResponse.json({ configured: true, deals, total: deals.length, totalValue: Math.round(totalValue), byStage, byCategory });
  } catch (error: unknown) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : 'Failed', deals: [] }, { status: 500 });
  }
}
