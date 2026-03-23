export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry } from '@/lib/google-calendar';
import { fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured, getDealValue, ZohoLead, ZohoDeal, isInMonth } from '@/lib/zoho-client';

// The 7 mutually exclusive categories every booking falls into
type BookingStatus = 'ordered' | 'demo_done' | 'no_show' | 'gone_cold' | 'in_pipeline' | 'direct_booking' | 'pending';

function classifyBooking(
  email: string,
  leadsByEmail: Map<string, ZohoLead>,
  dealsByEmail: Map<string, ZohoDeal>,
  daysSinceCall: number
): { status: BookingStatus; stage: string | null; value: number | null; dealName: string | null; dealCreated: string | null } {
  const e = email.toLowerCase();

  // a) Check Deals first — if email matches a Deal, they ORDERED
  const deal = dealsByEmail.get(e);
  if (deal) {
    return { status: 'ordered', stage: deal.Stage, value: getDealValue(deal), dealName: deal.Deal_Name, dealCreated: deal.Created_Time };
  }

  // b-f) Check Leads
  const lead = leadsByEmail.get(e);
  if (lead) {
    const s = lead.Status;
    if (s === 'Virtual Demo Completed' || s === 'Demo Completed') return { status: 'demo_done', stage: s, value: null, dealName: null, dealCreated: null };
    if (s === 'No Show') return { status: 'no_show', stage: s, value: null, dealName: null, dealCreated: null };
    if (s === 'No Contact From Customer' || s === 'No Contact' || s === 'No Contact -') return { status: 'gone_cold', stage: s, value: null, dealName: null, dealCreated: null };
    if (s === 'Purchased') return { status: 'ordered', stage: 'Purchased', value: null, dealName: null, dealCreated: null };
    // Any other lead status = in pipeline
    return { status: 'in_pipeline', stage: s || 'Registered', value: null, dealName: null, dealCreated: null };
  }

  // g) Not in Zoho at all
  if (daysSinceCall <= 14) return { status: 'pending', stage: null, value: null, dealName: null, dealCreated: null };
  return { status: 'direct_booking', stage: null, value: null, dealName: null, dealCreated: null };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getMonth()));
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const monthLabel = mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    // Step 1: Get all calendar bookings for the selected month
    const calEvents = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
    const salesCalls = calEvents.filter(isSalesCall);

    if (!isZohoConfigured()) {
      return NextResponse.json({
        zohoConnected: false, month: monthLabel, totalBookings: salesCalls.length,
        records: salesCalls.map(e => ({
          name: extractLeadName(e), email: getExternalAttendeeEmail(e), phone: extractPhone(e),
          date: e.start, country: extractCountry(e), status: 'pending' as BookingStatus,
          stage: null, value: null, daysSince: Math.floor((now.getTime() - new Date(e.start).getTime()) / 86400000),
        })),
      });
    }

    // Fetch Zoho data (cached)
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);

    // Build email lookup maps
    const leadsByEmail = new Map<string, ZohoLead>();
    leads.forEach(l => { if (l.Email) leadsByEmail.set(l.Email.toLowerCase(), l); });
    const dealsByEmail = new Map<string, ZohoDeal>();
    deals.forEach(d => { if (d.Email) dealsByEmail.set(d.Email.toLowerCase(), d); });

    // Step 2: Classify every booking
    const counts: Record<BookingStatus, number> = { ordered: 0, demo_done: 0, no_show: 0, gone_cold: 0, in_pipeline: 0, direct_booking: 0, pending: 0 };

    const records = salesCalls.map(e => {
      const email = getExternalAttendeeEmail(e);
      const daysSince = Math.floor((now.getTime() - new Date(e.start).getTime()) / 86400000);
      const match = classifyBooking(email, leadsByEmail, dealsByEmail, daysSince);
      counts[match.status]++;

      return {
        name: extractLeadName(e),
        email,
        phone: extractPhone(e),
        date: e.start,
        country: extractCountry(e),
        status: match.status,
        stage: match.stage,
        value: match.value,
        dealName: match.dealName,
        dealCreated: match.dealCreated,
        daysSince,
      };
    });

    // Step 3: Sanity check — numbers must add up
    const sumOfCounts = Object.values(counts).reduce((a, b) => a + b, 0);
    const sanityOk = sumOfCounts === salesCalls.length;

    // Conversion rate: demos completed (60-day window) that have a Deal
    const sixtyDayStart = new Date(now.getTime() - 60 * 86400000);
    const sixtyDayEvents = await fetchCalendarEvents(sixtyDayStart.toISOString(), now.toISOString());
    const sixtyDaySales = sixtyDayEvents.filter(isSalesCall);
    let demosWithOrders = 0;
    let totalDemosForRate = 0;
    sixtyDaySales.forEach(e => {
      const email = getExternalAttendeeEmail(e).toLowerCase();
      if (!email) return;
      const deal = dealsByEmail.get(email);
      const lead = leadsByEmail.get(email);
      // Count as "demo completed" if lead is at VDC/Demo Completed OR has a deal
      if (deal || lead?.Status === 'Virtual Demo Completed' || lead?.Status === 'Demo Completed') {
        totalDemosForRate++;
        if (deal) demosWithOrders++;
      }
    });
    const conversionRate = totalDemosForRate > 0 ? Math.round((demosWithOrders / totalDemosForRate) * 100) : 0;

    // Orders this month (deals created this month)
    const ordersThisMonth = deals.filter(d => isInMonth(d.Created_Time, year, month)).length;

    return NextResponse.json({
      zohoConnected: true,
      month: monthLabel,
      totalBookings: salesCalls.length,
      ...counts,
      conversionRate,
      conversionDetail: `${demosWithOrders} orders from ${totalDemosForRate} demos (60-day window)`,
      ordersThisMonth,
      records,
      sanityCheck: { total: salesCalls.length, sumOfCategories: sumOfCounts, ok: sanityOk },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Conversion tracking failed';
    console.error('[Conversions]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
