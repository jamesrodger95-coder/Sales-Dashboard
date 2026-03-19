export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured, getDealValue, categorizeStage } from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false });
  }
  try {
    const [leads, deals] = await Promise.all([
      fetchAllJamesLeads(),
      fetchAllJamesDeals(),
    ]);

    // Lead pipeline
    const leadsByStatus: Record<string, { count: number; leads: { name: string; email: string | null; country: string | null; created: string }[] }> = {};
    leads.forEach(l => {
      const s = l.Lead_Status || 'Unknown';
      if (!leadsByStatus[s]) leadsByStatus[s] = { count: 0, leads: [] };
      leadsByStatus[s].count++;
      if (leadsByStatus[s].leads.length < 20) {
        leadsByStatus[s].leads.push({ name: l.Full_Name, email: l.Email, country: l.Country, created: l.Created_Time });
      }
    });

    // Deal pipeline
    const dealsByStage: Record<string, { count: number; value: number; category: string; deals: { name: string; value: number; country: string | null; created: string; daysInStage: number }[] }> = {};
    const now = Date.now();
    deals.forEach(d => {
      const s = d.Stage || 'Unknown';
      const cat = categorizeStage(s);
      const val = getDealValue(d);
      const daysInStage = Math.floor((now - new Date(d.Modified_Time).getTime()) / 86400000);
      if (!dealsByStage[s]) dealsByStage[s] = { count: 0, value: 0, category: cat, deals: [] };
      dealsByStage[s].count++;
      dealsByStage[s].value += val;
      if (dealsByStage[s].deals.length < 20) {
        dealsByStage[s].deals.push({ name: d.Deal_Name, value: val, country: d.Country, created: d.Created_Time, daysInStage });
      }
    });

    // Follow-up flags
    const redFlags: { name: string; stage: string; days: number; type: string }[] = [];
    const yellowFlags: { name: string; stage: string; days: number; type: string }[] = [];

    // Lead flags
    leads.forEach(l => {
      const days = Math.floor((now - new Date(l.Created_Time).getTime()) / 86400000);
      const modDays = Math.floor((now - new Date(l.Modified_Time).getTime()) / 86400000);
      if ((!l.Lead_Status || l.Lead_Status === 'Not Contacted') && days > 1) {
        redFlags.push({ name: l.Full_Name, stage: 'Not Contacted', days, type: 'lead' });
      } else if (l.Lead_Status === 'Attempted to Contact' && modDays > 14) {
        redFlags.push({ name: l.Full_Name, stage: 'Attempted to Contact', days: modDays, type: 'lead' });
      } else if (l.Lead_Status === 'Attempted to Contact' && modDays > 7) {
        yellowFlags.push({ name: l.Full_Name, stage: 'Attempted to Contact', days: modDays, type: 'lead' });
      }
    });

    // Deal flags
    deals.forEach(d => {
      const daysInStage = Math.floor((now - new Date(d.Modified_Time).getTime()) / 86400000);
      if (d.Stage === 'Awaiting Measurements' && daysInStage > 10) {
        redFlags.push({ name: d.Deal_Name, stage: d.Stage, days: daysInStage, type: 'deal' });
      } else if (d.Stage === 'Awaiting Measurements' && daysInStage > 7) {
        yellowFlags.push({ name: d.Deal_Name, stage: d.Stage, days: daysInStage, type: 'deal' });
      }
      if (d.Stage === 'In Manufacturing' && daysInStage > 105) { // 15 weeks
        redFlags.push({ name: d.Deal_Name, stage: d.Stage, days: daysInStage, type: 'deal' });
      }
      if (d.Stage === 'No Response from Customer' || d.Stage === 'LATE') {
        redFlags.push({ name: d.Deal_Name, stage: d.Stage, days: daysInStage, type: 'deal' });
      }
    });

    const totalPipelineValue = deals.reduce((sum, d) => sum + getDealValue(d), 0);

    return NextResponse.json({
      configured: true,
      totalLeads: leads.length,
      totalDeals: deals.length,
      totalPipelineValue: Math.round(totalPipelineValue * 100) / 100,
      leadsByStatus,
      dealsByStage,
      redFlags: redFlags.slice(0, 20),
      yellowFlags: yellowFlags.slice(0, 20),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Pipeline failed';
    console.error('[Zoho Pipeline]', error);
    return NextResponse.json({ configured: true, error: msg }, { status: 500 });
  }
}
