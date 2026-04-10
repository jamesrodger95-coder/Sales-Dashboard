export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, detectBookingPlatform } from '@/lib/google-calendar';
import { fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured, getDealValue, getLeadPhone, ZohoLead, ZohoDeal } from '@/lib/zoho-client';

type Status = 'ordered' | 'demo_done' | 'no_show' | 'gone_cold' | 'in_pipeline' | 'direct_booking' | 'pending';

const classify = (email: string, leads: Map<string, ZohoLead>, deals: Map<string, ZohoDeal>): { status: Status; stage: string | null; value: number | null; dealName: string | null } => {
  const e = email.toLowerCase();
  if (!e) return { status: 'pending', stage: null, value: null, dealName: null };

  const deal = deals.get(e);
  if (deal) return { status: 'ordered', stage: deal.Stage, value: getDealValue(deal), dealName: deal.Deal_Name };

  const lead = leads.get(e);
  if (lead) {
    const s = lead.Status;
    if (s === 'Purchased') return { status: 'ordered', stage: 'Purchased', value: null, dealName: null };
    if (s === 'Virtual Demo Completed' || s === 'Demo Completed') return { status: 'demo_done', stage: s, value: null, dealName: null };
    if (s === 'No Show') return { status: 'no_show', stage: s, value: null, dealName: null };
    if (s === 'No Contact From Customer' || s === 'No Contact' || s === 'No Contact -') return { status: 'gone_cold', stage: s, value: null, dealName: null };
    return { status: 'in_pipeline', stage: s || 'Registered', value: null, dealName: null };
  }

  return { status: 'direct_booking', stage: null, value: null, dealName: null };
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getMonth()));
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const monthLabel = mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    // STEP 1: Calendar bookings for the selected month only
    const events = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
    const calls = events.filter(isSalesCall);

    if (!isZohoConfigured()) {
      return NextResponse.json({ zohoConnected: false, month: monthLabel, totalCalls: calls.length, records: calls.map(e => ({
        name: extractLeadName(e), email: getExternalAttendeeEmail(e), phone: extractPhone(e),
        date: e.start, country: extractCountry(e), status: 'pending' as Status, stage: null, value: null, dealName: null,
        platform: detectBookingPlatform(e), leadSource: null,
      })) });
    }

    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const leadMap = new Map<string, ZohoLead>();
    leads.forEach(l => { if (l.Email) leadMap.set(l.Email.toLowerCase(), l); });
    const dealMap = new Map<string, ZohoDeal>();
    deals.forEach(d => { if (d.Email) dealMap.set(d.Email.toLowerCase(), d); });

    // STEP 2: Classify every call
    const c: Record<Status, number> = { ordered: 0, demo_done: 0, no_show: 0, gone_cold: 0, in_pipeline: 0, direct_booking: 0, pending: 0 };

    const records = calls.map(e => {
      const email = getExternalAttendeeEmail(e);
      const m = classify(email, leadMap, dealMap);
      c[m.status]++;
      const lead = email ? leadMap.get(email.toLowerCase()) : undefined;
      // Phone fallback chain: calendar → Zoho Mobile → Zoho Phone
      const phone = extractPhone(e) || (lead ? getLeadPhone(lead) : null);
      return {
        name: extractLeadName(e), email, phone,
        date: e.start, country: extractCountry(e),
        status: m.status, stage: m.stage, value: m.value, dealName: m.dealName,
        platform: detectBookingPlatform(e),
        leadSource: lead?.Lead_Source || null,
      };
    });

    // STEP 3: Derived metrics
    const totalCalls = calls.length;
    const showedUp = c.ordered + c.demo_done; // people who actually did the demo
    const convRate = showedUp > 0 ? Math.round((c.ordered / showedUp) * 100) : 0;
    const showRate = totalCalls > 0 ? Math.round((showedUp / totalCalls) * 100) : 0;
    const noShowRate = totalCalls > 0 ? Math.round((c.no_show / totalCalls) * 100) : 0;

    // STEP 4: Sanity check
    const sum = Object.values(c).reduce((a, b) => a + b, 0);

    // Country breakdown
    const byCountry: Record<string, { calls: number; ordered: number }> = {};
    records.forEach(r => {
      const co = r.country || 'Unknown';
      if (!byCountry[co]) byCountry[co] = { calls: 0, ordered: 0 };
      byCountry[co].calls++;
      if (r.status === 'ordered') byCountry[co].ordered++;
    });

    return NextResponse.json({
      zohoConnected: true,
      month: monthLabel, year, monthIndex: month,
      totalCalls,
      ...c,
      showedUp,
      convRate,
      convRateDetail: `${c.ordered} ordered from ${showedUp} demos`,
      showRate,
      noShowRate,
      records,
      byCountry,
      sanity: { total: totalCalls, sum, ok: sum === totalCalls },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    console.error('[Conversions]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
