export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, getExternalAttendeeEmail, extractMeetingNotes, detectBookingPlatform, hasPrepNotes, extractCountry, extractLeadName } from '@/lib/google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, ZohoLead, ZohoDeal } from '@/lib/zoho-client';

interface PlatformStats {
  total: number;
  showed: number;
  noShow: number;
  ordered: number;
  showRate: number;
  noShowRate: number;
  conversionRate: number;
}

interface SourceStats {
  source: string;
  leads: number;
  ordered: number;
  conversionRate: number;
  totalValue: number;
  avgValue: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getMonth()));
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0, 23, 59, 59);

    // Calendar events for the selected month
    const events = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
    const calls = events.filter(isSalesCall);

    if (!isZohoConfigured()) {
      // Calendar-only platform analysis
      const platformBreakdown: Record<string, PlatformStats> = { Calendly: emptyStats(), 'Cal.com': emptyStats(), Other: emptyStats() };
      calls.forEach(e => {
        const p = detectBookingPlatform(e);
        platformBreakdown[p].total++;
      });
      return NextResponse.json({ zohoConnected: false, month: mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), platformBreakdown });
    }

    // Fetch Zoho data
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const leadByEmail = new Map<string, ZohoLead>();
    leads.forEach(l => { if (l.Email) leadByEmail.set(l.Email.toLowerCase(), l); });
    const dealByEmail = new Map<string, ZohoDeal>();
    deals.forEach(d => { if (d.Email) dealByEmail.set(d.Email.toLowerCase(), d); });

    // === BOOKING PLATFORM ANALYSIS ===
    const platformBreakdown: Record<string, PlatformStats> = {
      Calendly: emptyStats(),
      'Cal.com': emptyStats(),
      Other: emptyStats(),
    };

    // Records with full source data
    const records: {
      name: string; email: string; date: string; platform: string; leadSource: string | null;
      attendance: string | null; hasNotes: boolean; country: string | null;
      crmStatus: string; orderValue: number | null;
    }[] = [];

    // Attendance commitment & notes patterns
    const commitmentStats = { yes: 0, no: 0, unknown: 0, yesNoShows: 0, noNoShows: 0, yesOrdered: 0, noOrdered: 0 };
    const notesStats = { withNotes: 0, withoutNotes: 0, notesOrdered: 0, noNotesOrdered: 0 };

    calls.forEach(e => {
      const platform = detectBookingPlatform(e);
      const email = getExternalAttendeeEmail(e).toLowerCase();
      const notes = extractMeetingNotes(e);
      const lead = email ? leadByEmail.get(email) : undefined;
      const deal = email ? dealByEmail.get(email) : undefined;

      // Determine status
      let crmStatus = 'direct_booking';
      if (deal) crmStatus = 'ordered';
      else if (lead) {
        if (lead.Status === 'Virtual Demo Completed' || lead.Status === 'Demo Completed') crmStatus = 'demo_done';
        else if (lead.Status === 'No Show') crmStatus = 'no_show';
        else if (lead.Status === 'No Contact From Customer' || lead.Status === 'No Contact') crmStatus = 'gone_cold';
        else crmStatus = 'in_pipeline';
      }

      // Update platform stats
      const stats = platformBreakdown[platform];
      stats.total++;
      if (crmStatus === 'ordered') { stats.ordered++; stats.showed++; }
      else if (crmStatus === 'demo_done') stats.showed++;
      else if (crmStatus === 'no_show') stats.noShow++;

      // Commitment tracking
      const hasNotesFlag = hasPrepNotes(e);
      if (hasNotesFlag) notesStats.withNotes++;
      else notesStats.withoutNotes++;
      if (crmStatus === 'ordered') {
        if (hasNotesFlag) notesStats.notesOrdered++;
        else notesStats.noNotesOrdered++;
      }

      if (notes.attendanceConfirmed === true) {
        commitmentStats.yes++;
        if (crmStatus === 'no_show') commitmentStats.yesNoShows++;
        if (crmStatus === 'ordered') commitmentStats.yesOrdered++;
      } else if (notes.attendanceConfirmed === false) {
        commitmentStats.no++;
        if (crmStatus === 'no_show') commitmentStats.noNoShows++;
        if (crmStatus === 'ordered') commitmentStats.noOrdered++;
      } else {
        commitmentStats.unknown++;
      }

      records.push({
        name: extractLeadName(e),
        email,
        date: e.start,
        platform,
        leadSource: lead?.Lead_Source || null,
        attendance: notes.attendanceConfirmed === true ? 'Yes' : notes.attendanceConfirmed === false ? 'No' : null,
        hasNotes: hasNotesFlag,
        country: extractCountry(e),
        crmStatus,
        orderValue: deal ? getDealValue(deal) : null,
      });
    });

    // Calculate rates
    Object.values(platformBreakdown).forEach(s => {
      s.showRate = s.total > 0 ? Math.round((s.showed / s.total) * 100) : 0;
      s.noShowRate = s.total > 0 ? Math.round((s.noShow / s.total) * 100) : 0;
      s.conversionRate = s.showed > 0 ? Math.round((s.ordered / s.showed) * 100) : 0;
    });

    // === LEAD SOURCE ANALYSIS (from Zoho) ===
    // Build map: source → leads who have this source
    const sourceMap = new Map<string, { leads: ZohoLead[]; deals: ZohoDeal[] }>();
    leads.forEach(l => {
      const s = l.Lead_Source || 'Unknown';
      if (!sourceMap.has(s)) sourceMap.set(s, { leads: [], deals: [] });
      sourceMap.get(s)!.leads.push(l);
    });
    // For each lead with a deal, also add to source's deals
    leads.forEach(l => {
      if (!l.Email) return;
      const deal = dealByEmail.get(l.Email.toLowerCase());
      if (deal) {
        const s = l.Lead_Source || 'Unknown';
        sourceMap.get(s)?.deals.push(deal);
      }
    });

    const sourceBreakdown: SourceStats[] = Array.from(sourceMap.entries()).map(([source, d]) => {
      const totalValue = d.deals.reduce((sum, deal) => sum + getDealValue(deal), 0);
      return {
        source,
        leads: d.leads.length,
        ordered: d.deals.length,
        conversionRate: d.leads.length > 0 ? Math.round((d.deals.length / d.leads.length) * 100) : 0,
        totalValue: Math.round(totalValue),
        avgValue: d.deals.length > 0 ? Math.round(totalValue / d.deals.length) : 0,
      };
    }).filter(s => s.leads > 1).sort((a, b) => b.conversionRate - a.conversionRate || b.leads - a.leads);

    // === NO-SHOW PATTERNS ===
    const noShowsByPlatform: Record<string, number> = { Calendly: 0, 'Cal.com': 0, Other: 0 };
    const noShowsByCountry: Record<string, number> = {};
    const noShowsByDay: Record<string, number> = {};
    const noShowsByCommitment = { yes: commitmentStats.yesNoShows, no: commitmentStats.noNoShows };

    records.filter(r => r.crmStatus === 'no_show').forEach(r => {
      noShowsByPlatform[r.platform]++;
      const country = r.country || 'Unknown';
      noShowsByCountry[country] = (noShowsByCountry[country] || 0) + 1;
      const day = new Date(r.date).toLocaleDateString('en-GB', { weekday: 'long' });
      noShowsByDay[day] = (noShowsByDay[day] || 0) + 1;
    });

    return NextResponse.json({
      zohoConnected: true,
      month: mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      totalCalls: calls.length,
      platformBreakdown,
      sourceBreakdown: sourceBreakdown.slice(0, 20),
      commitmentStats,
      notesStats,
      noShowPatterns: {
        byPlatform: noShowsByPlatform,
        byCountry: Object.entries(noShowsByCountry).sort(([, a], [, b]) => b - a).slice(0, 5),
        byDay: noShowsByDay,
        byCommitment: noShowsByCommitment,
      },
      records,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    console.error('[Sources]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function emptyStats(): PlatformStats {
  return { total: 0, showed: 0, noShow: 0, ordered: 0, showRate: 0, noShowRate: 0, conversionRate: 0 };
}
