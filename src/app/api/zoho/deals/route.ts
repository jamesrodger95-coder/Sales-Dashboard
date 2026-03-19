export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchAllJamesDeals, isZohoConfigured, getDealValue, categorizeStage } from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false, deals: [], message: 'Zoho CRM not configured' });
  }
  try {
    const deals = await fetchAllJamesDeals();

    const byStage: Record<string, { count: number; value: number }> = {};
    let totalValue = 0;
    deals.forEach(d => {
      const s = d.Stage || 'Unknown';
      if (!byStage[s]) byStage[s] = { count: 0, value: 0 };
      byStage[s].count++;
      const v = getDealValue(d);
      byStage[s].value += v;
      totalValue += v;
    });

    const byCategory: Record<string, number> = {};
    deals.forEach(d => {
      const cat = categorizeStage(d.Stage);
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    return NextResponse.json({
      configured: true,
      deals,
      total: deals.length,
      totalValue: Math.round(totalValue * 100) / 100,
      byStage,
      byCategory,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ configured: true, error: msg, deals: [] }, { status: 500 });
  }
}
