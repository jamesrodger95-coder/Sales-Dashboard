export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry } from '@/lib/google-calendar';
import { fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured, getDealValue, categorizeStage } from '@/lib/zoho-client';

export async function GET() {
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);

    // Fetch calendar calls
    const events = await fetchCalendarEvents(threeMonthsAgo.toISOString(), now.toISOString());
    const salesCalls = events.filter(isSalesCall);

    if (!isZohoConfigured()) {
      return NextResponse.json({
        zohoConnected: false,
        totalCalls: salesCalls.length,
        records: salesCalls.map(e => ({
          name: extractLeadName(e), email: getExternalAttendeeEmail(e),
          date: e.start, status: 'unknown',
        })),
      });
    }

    // Fetch Zoho data
    const [leads, deals] = await Promise.all([
      fetchAllJamesLeads(),
      fetchAllJamesDeals(),
    ]);

    // Build email lookup maps
    const leadByEmail = new Map<string, { status: string; name: string }>();
    leads.forEach(l => {
      if (l.Email) leadByEmail.set(l.Email.toLowerCase(), { status: l.Lead_Status || 'Unknown', name: l.Full_Name });
    });

    const dealByEmail = new Map<string, { stage: string; name: string; value: number; category: string }>();
    deals.forEach(d => {
      if (d.Email) dealByEmail.set(d.Email.toLowerCase(), {
        stage: d.Stage, name: d.Deal_Name, value: getDealValue(d), category: categorizeStage(d.Stage),
      });
    });

    // Cross-reference
    let converted = 0, inPipeline = 0, pending = 0, lost = 0;
    const records = salesCalls.map(e => {
      const email = getExternalAttendeeEmail(e).toLowerCase();
      const daysSince = Math.floor((now.getTime() - new Date(e.start).getTime()) / 86400000);

      let status: string;
      let crmStage: string | null = null;
      let orderValue: number | null = null;

      const deal = email ? dealByEmail.get(email) : undefined;
      const lead = email ? leadByEmail.get(email) : undefined;

      if (deal && ['shipped', 'post_delivery'].includes(deal.category)) {
        status = 'converted';
        crmStage = deal.stage;
        orderValue = deal.value;
        converted++;
      } else if (deal) {
        status = 'in_pipeline';
        crmStage = deal.stage;
        orderValue = deal.value;
        inPipeline++;
      } else if (lead) {
        status = 'in_pipeline';
        crmStage = `Lead: ${lead.status}`;
        inPipeline++;
      } else if (daysSince <= 30) {
        status = 'pending';
        pending++;
      } else {
        status = 'lost';
        lost++;
      }

      return {
        name: extractLeadName(e),
        email: getExternalAttendeeEmail(e),
        phone: extractPhone(e),
        date: e.start,
        country: extractCountry(e),
        status,
        crmStage,
        orderValue,
        daysSince,
      };
    });

    const conversionRate = salesCalls.length > 0 ? Math.round((converted / salesCalls.length) * 100) : 0;

    return NextResponse.json({
      zohoConnected: true,
      totalCalls: salesCalls.length,
      converted, inPipeline, pending, lost,
      conversionRate,
      records,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Conversion tracking failed';
    console.error('[Conversions]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
