export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchAllJamesLeads, isZohoConfigured } from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false, leads: [], message: 'Zoho CRM not configured' });
  }
  try {
    const leads = await fetchAllJamesLeads();
    const byStatus: Record<string, number> = {};
    leads.forEach(l => { const s = l.Lead_Status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });
    return NextResponse.json({ configured: true, leads, total: leads.length, byStatus });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ configured: true, error: msg, leads: [] }, { status: 500 });
  }
}
