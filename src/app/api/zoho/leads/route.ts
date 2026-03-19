export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchAllJamesLeads, isZohoConfigured, categorizeLeadStatus } from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false, leads: [] });
  }
  try {
    const leads = await fetchAllJamesLeads();
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    leads.forEach(l => {
      const s = l.Status || 'No Status';
      byStatus[s] = (byStatus[s] || 0) + 1;
      const c = categorizeLeadStatus(l.Status);
      byCategory[c] = (byCategory[c] || 0) + 1;
    });
    return NextResponse.json({ configured: true, leads, total: leads.length, byStatus, byCategory });
  } catch (error: unknown) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : 'Failed', leads: [] }, { status: 500 });
  }
}
