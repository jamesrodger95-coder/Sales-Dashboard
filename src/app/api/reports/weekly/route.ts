export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, detectBookingPlatform, extractMeetingNotes } from '@/lib/google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, buildEmailMaps, getProductType } from '@/lib/zoho-client';

function weekRange(dateStr?: string): { start: Date; end: Date; label: string } {
  const ref = dateStr ? new Date(dateStr) : new Date();
  // Go to previous Monday
  const day = ref.getDay();
  const diffToMon = day === 0 ? 6 : day - 1;
  const start = new Date(ref);
  start.setDate(start.getDate() - diffToMon - 7); // Previous week Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get('week');
    const { start, end, label } = weekRange(weekParam || undefined);

    // Previous week for comparison
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 7);

    // Calendar
    const [weekEvents, prevWeekEvents] = await Promise.all([
      fetchCalendarEvents(start.toISOString(), end.toISOString()),
      fetchCalendarEvents(prevStart.toISOString(), prevEnd.toISOString()),
    ]);
    const calls = weekEvents.filter(isSalesCall);
    const prevCalls = prevWeekEvents.filter(isSalesCall);

    // Enrich calls
    const enriched = calls.map(e => {
      const notes = extractMeetingNotes(e);
      return {
        name: extractLeadName(e), email: getExternalAttendeeEmail(e), phone: extractPhone(e),
        country: extractCountry(e), platform: detectBookingPlatform(e), date: e.start,
        attendance: notes.attendanceConfirmed, prepNotes: notes.notes,
      };
    });

    // Platform breakdown
    const byPlatform: Record<string, { booked: number; attended: number }> = {};
    enriched.forEach(c => {
      if (!byPlatform[c.platform]) byPlatform[c.platform] = { booked: 0, attended: 0 };
      byPlatform[c.platform].booked++;
    });

    // Country breakdown
    const byCountry: Record<string, number> = {};
    enriched.forEach(c => { const co = c.country || 'Unknown'; byCountry[co] = (byCountry[co] || 0) + 1; });

    // Zoho data
    let leads: Awaited<ReturnType<typeof fetchAllJamesLeads>> = [];
    let deals: Awaited<ReturnType<typeof fetchAllJamesDeals>> = [];
    let newLeads: typeof leads = [];
    let newOrders: typeof deals = [];
    let noShows: typeof leads = [];
    let directBookings: typeof enriched = [];
    let completedDemos: { name: string; country: string | null; source: string | null; platform: string; status: string; value: number | null }[] = [];
    const bySource: Record<string, { leads: number; demos: number; orders: number }> = {};
    let convRate = 0;

    if (isZohoConfigured()) {
      [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
      const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

      // New leads this week
      newLeads = leads.filter(l => {
        const d = new Date(l.Created_Time);
        return d >= start && d <= end;
      });

      // New orders this week
      newOrders = deals.filter(d => {
        const dt = new Date(d.Created_Time);
        return dt >= start && dt <= end;
      });

      // No-shows this week
      noShows = leads.filter(l => {
        const d = new Date(l.Modified_Time);
        return l.Status === 'No Show' && d >= start && d <= end;
      });

      // Cross-reference calls
      directBookings = enriched.filter(c => {
        const email = c.email?.toLowerCase();
        return email && !leadsByEmail.has(email) && !dealsByEmail.has(email);
      });

      // Completed demos with status
      completedDemos = enriched.map(c => {
        const email = c.email?.toLowerCase() || '';
        const deal = dealsByEmail.get(email);
        const lead = leadsByEmail.get(email);
        let status = 'Pending';
        let value: number | null = null;
        if (deal) { status = 'Ordered'; value = getDealValue(deal); }
        else if (!lead && !deal) status = 'Not in CRM';
        else if (lead?.Status === 'No Show') status = 'No Show';
        return {
          name: c.name, country: c.country, source: lead?.Lead_Source || null,
          platform: c.platform, status, value,
        };
      });

      // Source breakdown
      newLeads.forEach(l => {
        const src = l.Lead_Source || 'Unknown';
        if (!bySource[src]) bySource[src] = { leads: 0, demos: 0, orders: 0 };
        bySource[src].leads++;
      });
      enriched.forEach(c => {
        const email = c.email?.toLowerCase() || '';
        const lead = leadsByEmail.get(email);
        const src = lead?.Lead_Source || 'Unknown';
        if (!bySource[src]) bySource[src] = { leads: 0, demos: 0, orders: 0 };
        bySource[src].demos++;
      });
      newOrders.forEach(d => {
        const email = d.Email?.toLowerCase() || '';
        const lead = leadsByEmail.get(email);
        const src = lead?.Lead_Source || 'Unknown';
        if (!bySource[src]) bySource[src] = { leads: 0, demos: 0, orders: 0 };
        bySource[src].orders++;
      });

      // Conversion
      const ordered = enriched.filter(c => {
        const email = c.email?.toLowerCase() || '';
        return dealsByEmail.has(email);
      }).length;
      convRate = enriched.length > 0 ? Math.round((ordered / enriched.length) * 100) : 0;
    }

    // Comparison
    const prevNewLeads = leads.filter(l => { const d = new Date(l.Created_Time); return d >= prevStart && d <= prevEnd; }).length;
    const prevOrders = deals.filter(d => { const dt = new Date(d.Created_Time); return dt >= prevStart && dt <= prevEnd; }).length;

    const pctChange = (curr: number, prev: number) => prev > 0 ? `${curr >= prev ? '+' : ''}${Math.round(((curr - prev) / prev) * 100)}%` : 'new';

    // Format email body
    const lines: string[] = [];
    lines.push(`BRYANT DENTAL WEEKLY — ${label}`);
    lines.push('');
    lines.push(`SNAPSHOT`);
    lines.push(`Leads: ${newLeads.length} (vs ${prevNewLeads} last week ${pctChange(newLeads.length, prevNewLeads)}) | Demos: ${enriched.length} (no-show ${noShows.length}) | Orders: ${newOrders.length} (vs ${prevOrders} ${pctChange(newOrders.length, prevOrders)}) | Conv: ${convRate}%`);

    // Source breakdown
    const srcEntries = Object.entries(bySource).filter(([,v]) => v.leads > 0 || v.demos > 0).sort(([,a],[,b]) => (b.leads + b.demos) - (a.leads + a.demos));
    if (srcEntries.length > 0) {
      lines.push('');
      lines.push('BY SOURCE');
      srcEntries.slice(0, 6).forEach(([src, d]) => {
        const rate = d.demos > 0 ? Math.round((d.orders / d.demos) * 100) : 0;
        lines.push(`${src}: ${d.leads} leads, ${d.demos} demos, ${d.orders} orders (${rate}%)`);
      });
    }

    // Platform
    if (Object.keys(byPlatform).length > 0) {
      lines.push('');
      lines.push('BY PLATFORM');
      Object.entries(byPlatform).forEach(([p, d]) => {
        lines.push(`${p}: ${d.booked} booked`);
      });
    }

    // Completed demos
    // completedDemos already computed above
    if (completedDemos.length > 0) {
      lines.push('');
      lines.push(`COMPLETED DEMOS (${completedDemos.length})`);
      completedDemos.slice(0, 20).forEach(d => {
        lines.push(`${d.name} — ${d.country || '?'} — ${d.source || '?'} — ${d.platform} — ${d.status}${d.value ? ' ($' + Math.round(d.value).toLocaleString() + ')' : ''}`);
      });
    }

    // No-shows
    if (noShows.length > 0) {
      lines.push('');
      lines.push(`NO SHOWS (${noShows.length})`);
      noShows.forEach(l => {
        lines.push(`${l.Full_Name} — ${l.Country || '?'} — ${l.Lead_Source || '?'}`);
      });
    }

    // New orders
    if (newOrders.length > 0) {
      lines.push('');
      lines.push(`NEW ORDERS (${newOrders.length})`);
      newOrders.slice(0, 15).forEach(d => {
        lines.push(`${d.Deal_Name} — ${d.Country || '?'} — ${getProductType(d)} — $${Math.round(getDealValue(d)).toLocaleString()}`);
      });
    }

    // Direct bookings
    if (directBookings.length > 0) {
      lines.push('');
      lines.push(`NOT IN CRM (${directBookings.length})`);
      directBookings.forEach(b => {
        lines.push(`${b.name} — ${b.email} — ${b.phone || '?'} — ${b.platform} — ${new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
      });
    }

    // Country line
    const topCountries = Object.entries(byCountry).sort(([,a],[,b]) => b - a).slice(0, 5);
    if (topCountries.length > 0) {
      lines.push('');
      lines.push(`TOP COUNTRIES: ${topCountries.map(([c, n]) => `${c} ${n}`).join(' | ')}`);
    }

    // Comparison line
    lines.push(`vs last week: leads ${pctChange(newLeads.length, prevNewLeads)}, demos ${pctChange(enriched.length, prevCalls.length)}, orders ${pctChange(newOrders.length, prevOrders)}`);

    const emailBody = lines.join('\n');
    const subject = `BD Weekly — ${label} | ${newLeads.length} Leads | ${enriched.length} Demos | ${newOrders.length} Orders`;

    return NextResponse.json({
      week: label,
      subject,
      body: emailBody,
      data: {
        calls: enriched.length, newLeads: newLeads.length, orders: newOrders.length,
        noShows: noShows.length, directBookings: directBookings.length, convRate,
        prevCalls: prevCalls.length, prevLeads: prevNewLeads, prevOrders,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Report failed';
    console.error('[Weekly Report]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
