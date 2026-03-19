export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import {
  fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured,
  getDealValue, categorizeLeadStatus, categorizeDealStage, getLeadPhone,
} from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) return NextResponse.json({ configured: false });

  try {
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const now = Date.now();

    // Lead counts by status
    const leadsByStatus: Record<string, number> = {};
    leads.forEach(l => { const s = l.Status || 'No Status'; leadsByStatus[s] = (leadsByStatus[s] || 0) + 1; });

    // Deal counts by stage with values
    const dealsByStage: Record<string, { count: number; value: number; category: string; deals: { name: string; value: number; country: string | null; daysInStage: number }[] }> = {};
    deals.forEach(d => {
      const s = d.Stage;
      const val = getDealValue(d);
      const days = Math.floor((now - new Date(d.Modified_Time).getTime()) / 86400000);
      if (!dealsByStage[s]) dealsByStage[s] = { count: 0, value: 0, category: categorizeDealStage(s), deals: [] };
      dealsByStage[s].count++;
      dealsByStage[s].value += val;
      if (dealsByStage[s].deals.length < 20) dealsByStage[s].deals.push({ name: d.Deal_Name, value: val, country: d.Country, daysInStage: days });
    });

    // Follow-up flags
    const redFlags: { name: string; stage: string; days: number; email: string | null; phone: string | null; action: string }[] = [];
    const yellowFlags: { name: string; stage: string; days: number; email: string | null; phone: string | null; action: string }[] = [];

    leads.forEach(l => {
      const days = Math.floor((now - new Date(l.Modified_Time).getTime()) / 86400000);
      const cat = categorizeLeadStatus(l.Status);
      const phone = getLeadPhone(l);

      if (cat === 'pre_purchase' && (!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted' || l.Status === '-None-') && days > 1) {
        redFlags.push({ name: l.Full_Name, stage: l.Status || 'Registered', days, email: l.Email, phone, action: 'VA needs to contact' });
      } else if (l.Status === 'First Contact Made' && days > 10) {
        redFlags.push({ name: l.Full_Name, stage: 'First Contact Made', days, email: l.Email, phone, action: 'Going cold — follow up or move to No Contact' });
      } else if (l.Status === 'First Contact Made' && days > 5) {
        yellowFlags.push({ name: l.Full_Name, stage: 'First Contact Made', days, email: l.Email, phone, action: 'Approaching deadline — follow up' });
      } else if (cat === 'no_show') {
        redFlags.push({ name: l.Full_Name, stage: 'No Show', days, email: l.Email, phone, action: 'Rebook demo' });
      } else if (cat === 'demo_done' && days > 7) {
        redFlags.push({ name: l.Full_Name, stage: l.Status || 'Demo Completed', days, email: l.Email, phone, action: 'Decision cooling — follow up' });
      } else if (cat === 'demo_done' && days > 3) {
        yellowFlags.push({ name: l.Full_Name, stage: l.Status || 'Demo Completed', days, email: l.Email, phone, action: 'Follow up soon' });
      }
    });

    deals.forEach(d => {
      const days = Math.floor((now - new Date(d.Modified_Time).getTime()) / 86400000);
      if (d.Stage === 'Awaiting Measurements' && days > 10) {
        redFlags.push({ name: d.Deal_Name, stage: d.Stage, days, email: d.Email, phone: d.Phone, action: 'Customer disengaging — chase measurements' });
      } else if (d.Stage === 'Awaiting Measurements' && days > 7) {
        yellowFlags.push({ name: d.Deal_Name, stage: d.Stage, days, email: d.Email, phone: d.Phone, action: 'Gentle reminder for measurements' });
      }
      if (d.Stage === 'In Manufacturing' && days > 105) {
        redFlags.push({ name: d.Deal_Name, stage: d.Stage, days, email: d.Email, phone: d.Phone, action: 'Over 15 weeks — proactive update needed' });
      }
      if (d.Stage === 'No Response from Customer') {
        redFlags.push({ name: d.Deal_Name, stage: d.Stage, days, email: d.Email, phone: d.Phone, action: 'Re-engage customer' });
      }
      if (d.Stage === 'Measurement Issues') {
        yellowFlags.push({ name: d.Deal_Name, stage: d.Stage, days, email: d.Email, phone: d.Phone, action: 'Resolve measurement issue' });
      }
    });

    // Sort flags by urgency (most days first)
    redFlags.sort((a, b) => b.days - a.days);
    yellowFlags.sort((a, b) => b.days - a.days);

    return NextResponse.json({
      configured: true,
      totalLeads: leads.length,
      totalDeals: deals.length,
      totalPipelineValue: Math.round(deals.reduce((s, d) => s + getDealValue(d), 0)),
      leadsByStatus,
      dealsByStage,
      redFlags: redFlags.slice(0, 30),
      yellowFlags: yellowFlags.slice(0, 20),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Pipeline failed';
    console.error('[Zoho Pipeline]', error);
    return NextResponse.json({ configured: true, error: msg }, { status: 500 });
  }
}
