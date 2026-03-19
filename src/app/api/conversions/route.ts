export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry } from '@/lib/google-calendar';
import { fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured, buildEmailMaps, matchEmailToCrm, CrmMatchStatus } from '@/lib/zoho-client';

export async function GET() {
  try {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const events = await fetchCalendarEvents(sixtyDaysAgo.toISOString(), now.toISOString());
    const salesCalls = events.filter(isSalesCall);

    if (!isZohoConfigured()) {
      return NextResponse.json({
        zohoConnected: false, totalCalls: salesCalls.length,
        records: salesCalls.map(e => ({
          name: extractLeadName(e), email: getExternalAttendeeEmail(e), date: e.start, status: 'pending' as CrmMatchStatus,
        })),
      });
    }

    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

    // Cross-reference each call
    const counts: Record<CrmMatchStatus, number> = { ordered: 0, in_pipeline: 0, demo_done: 0, no_show: 0, gone_cold: 0, direct_booking: 0, pending: 0 };

    const records = salesCalls.map(e => {
      const email = getExternalAttendeeEmail(e);
      const daysSince = Math.floor((now.getTime() - new Date(e.start).getTime()) / 86400000);
      const match = matchEmailToCrm(email, leadsByEmail, dealsByEmail, daysSince);
      counts[match.status]++;

      return {
        name: extractLeadName(e),
        email,
        phone: extractPhone(e),
        date: e.start,
        country: extractCountry(e),
        status: match.status,
        crmStage: match.stage,
        orderValue: match.value,
        daysSince,
      };
    });

    const conversionRate = salesCalls.length > 0 ? Math.round((counts.ordered / salesCalls.length) * 100) : 0;

    // Direct bookings (in calendar but NOT in Zoho at all)
    const directBookings = records.filter(r => r.status === 'direct_booking');

    return NextResponse.json({
      zohoConnected: true,
      totalCalls: salesCalls.length,
      ...counts,
      conversionRate,
      records,
      directBookings,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Conversion tracking failed';
    console.error('[Conversions]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
