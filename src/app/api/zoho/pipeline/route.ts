export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllJamesDeals, fetchAllJamesLeads, isZohoConfigured,
  getDealValue, getLeadPhone, buildEmailMaps, getMfgStatus,
  isInMonth, searchLeadByEmail, searchDealByEmail,
  DEAL_IN_PROGRESS, DEAL_AWAITING, DEAL_READY,
} from '@/lib/zoho-client';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail } from '@/lib/google-calendar';
import { getCompletedDemos } from '@/lib/data-engine';

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export async function GET(request: NextRequest) {
  if (!isZohoConfigured()) return NextResponse.json({ configured: false });

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getMonth()));
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const monthLabel = mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

    // Calendar data for cross-referencing
    const calEvents = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
    const salesCalls = calEvents.filter(isSalesCall);

    const nowMs = Date.now();
    const D30 = 30 * 86400000;
    const D60 = 60 * 86400000;

    // === ACTIVE PIPELINE: filtered by recency ===
    const activePipeline: Record<string, { count: number; leads: { name: string; email: string | null; phone: string | null; country: string | null; days: number }[] }> = {};

    const addToStage = (stage: string, name: string, email: string | null, phone: string | null, country: string | null, days: number) => {
      if (!activePipeline[stage]) activePipeline[stage] = { count: 0, leads: [] };
      activePipeline[stage].count++;
      if (activePipeline[stage].leads.length < 25) {
        activePipeline[stage].leads.push({ name, email, phone, country, days });
      }
    };

    // Pre-purchase leads with recency filters
    leads.forEach(l => {
      const created = new Date(l.Created_Time).getTime();
      const modified = new Date(l.Modified_Time).getTime();
      const age = nowMs - created;
      const stageAge = nowMs - modified;
      const phone = getLeadPhone(l);

      if (!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted' || l.Status === '-None-') {
        if (age <= D30) addToStage('Registered', l.Full_Name, l.Email, phone, l.Country, daysSince(l.Created_Time));
      } else if (l.Status === 'First Contact Made') {
        if (stageAge <= D30) addToStage('First Contact Made', l.Full_Name, l.Email, phone, l.Country, daysSince(l.Modified_Time));
      } else if (l.Status === 'Virtual Demo Booked') {
        addToStage('Virtual Demo Booked', l.Full_Name, l.Email, phone, l.Country, daysSince(l.Modified_Time));
      } else if (l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') {
        if (stageAge <= D60) addToStage('Virtual Demo Completed', l.Full_Name, l.Email, phone, l.Country, daysSince(l.Modified_Time));
      } else if (l.Status === 'No Show') {
        if (stageAge <= D30) addToStage('No Show', l.Full_Name, l.Email, phone, l.Country, daysSince(l.Modified_Time));
      } else if (l.Status === 'No Contact From Customer' || l.Status === 'No Contact' || l.Status === 'No Contact -') {
        if (stageAge <= D30) addToStage('No Contact', l.Full_Name, l.Email, phone, l.Country, daysSince(l.Modified_Time));
      }
    });

    // Post-purchase deals (active orders always shown, dispatched/arrived filtered)
    const activeOrderStages = [...DEAL_AWAITING, ...DEAL_IN_PROGRESS, ...DEAL_READY];
    deals.forEach(d => {
      const days = daysSince(d.Modified_Time);

      // Only show active orders (not yet shipped) in pipeline
      if (activeOrderStages.includes(d.Stage)) {
        addToStage(d.Stage, d.Deal_Name, d.Email, d.Phone, d.Country, days);
      }
      // Shipped/delivered excluded from pipeline — shown in Reports R9 instead
      // Skip old shipped/post-delivery
    });

    // Active pipeline value (only active orders, not all-time)
    const activeDealStages = [...DEAL_AWAITING, ...DEAL_IN_PROGRESS, ...DEAL_READY];
    const activePipelineValue = deals
      .filter(d => activeDealStages.includes(d.Stage))
      .reduce((s, d) => s + getDealValue(d), 0);

    // === THIS MONTH KPIs ===
    const newLeadsThisMonth = leads.filter(l => isInMonth(l.Created_Time, year, month)).length;
    const completed = getCompletedDemos(calEvents, leads, dealsByEmail, year, month, now);
    const demosCompletedThisMonth = completed.count;
    const noShowsThisMonth = leads.filter(l => l.Status === 'No Show' && isInMonth(l.Modified_Time, year, month)).length;
    const ordersThisMonth = deals.filter(d => isInMonth(d.Created_Time, year, month)).length;

    console.log(`[Pipeline] ${monthLabel} demos completed = ${completed.count}`, {
      calendarTotalInMonth: completed.debug.calendarTotalInMonth,
      pastSalesCalls: completed.debug.pastSalesCalls,
      noShows: completed.debug.noShows,
      cancellations: completed.debug.cancellations,
      fromCalendar: completed.debug.fromCalendar,
      fromZohoVDCOnly: completed.debug.fromZohoVDCOnly,
    });

    // === DIRECT BOOKINGS (calendar only, no Zoho record) ===
    // First pass: pick candidates using the bulk 5-min cache.
    const directCandidates = salesCalls
      .map(e => {
        const emailRaw = getExternalAttendeeEmail(e);
        const email = emailRaw.toLowerCase();
        const inZoho = email && (leadsByEmail.has(email) || dealsByEmail.has(email));
        if (inZoho) return null;
        return {
          name: extractLeadName(e),
          email: emailRaw,
          date: e.start,
          isPast: new Date(e.start) < now,
        };
      })
      .filter((x): x is { name: string; email: string; date: string; isPast: boolean } => x !== null);

    // Live re-check pass: a calendar booking can appear here just because the
    // VA added the lead to Zoho AFTER the bulk cache was warmed. Search Zoho
    // per-email and drop anything that now resolves to a real record.
    const directBookings: typeof directCandidates = [];
    if (directCandidates.length > 0) {
      console.log(`[Pipeline] Live re-checking ${directCandidates.length} direct booking candidate(s)...`);
      const checks = await Promise.all(directCandidates.map(async c => {
        if (!c.email) return c; // no email = can't re-check, keep as direct
        const [lead, deal] = await Promise.all([
          searchLeadByEmail(c.email),
          searchDealByEmail(c.email),
        ]);
        if (lead || deal) {
          console.log(`[Pipeline] ${c.email}: now in Zoho (${lead?.Status || deal?.Stage}) — removing from Direct list`);
          return null;
        }
        return c;
      }));
      for (const r of checks) if (r) directBookings.push(r);
    }

    // === FOLLOW-UP ACTIONS (only recent, max 14 days for red, 30 days for yellow) ===
    const redFlags: { name: string; stage: string; days: number; action: string; email: string | null; phone: string | null }[] = [];
    const yellowFlags: { name: string; stage: string; days: number; action: string; email: string | null; phone: string | null }[] = [];

    leads.forEach(l => {
      const days = daysSince(l.Modified_Time);
      const phone = getLeadPhone(l);

      // Only recent leads for follow-ups
      if ((!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted' || l.Status === '-None-') && days > 1 && days <= 14) {
        redFlags.push({ name: l.Full_Name, stage: 'Registered', days, action: 'VA needs to contact', email: l.Email, phone });
      } else if (l.Status === 'First Contact Made' && days > 10 && days <= 30) {
        redFlags.push({ name: l.Full_Name, stage: 'FCM', days, action: 'Going cold', email: l.Email, phone });
      } else if (l.Status === 'First Contact Made' && days > 5 && days <= 10) {
        yellowFlags.push({ name: l.Full_Name, stage: 'FCM', days, action: 'Approaching deadline', email: l.Email, phone });
      } else if (l.Status === 'No Show' && days <= 7) {
        redFlags.push({ name: l.Full_Name, stage: 'No Show', days, action: 'Rebook demo', email: l.Email, phone });
      } else if ((l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && days > 7 && days <= 30) {
        redFlags.push({ name: l.Full_Name, stage: 'VDC', days, action: 'Decision cooling', email: l.Email, phone });
      } else if ((l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && days > 3 && days <= 7) {
        yellowFlags.push({ name: l.Full_Name, stage: 'VDC', days, action: 'Follow up soon', email: l.Email, phone });
      }
    });

    deals.forEach(d => {
      const days = daysSince(d.Modified_Time);
      if (d.Stage === 'Awaiting Measurements' && days > 10) {
        redFlags.push({ name: d.Deal_Name, stage: 'Awaiting Meas.', days, action: 'Remind about measurements — ' + days + ' days since payment', email: d.Email, phone: d.Phone });
      } else if (d.Stage === 'Awaiting Measurements' && days > 7) {
        yellowFlags.push({ name: d.Deal_Name, stage: 'Awaiting Meas.', days, action: 'Gentle reminder for measurements', email: d.Email, phone: d.Phone });
      }
      if (d.Stage === 'In Manufacturing') {
        const m = getMfgStatus(d);
        if (m.status === 'overdue') {
          redFlags.push({ name: d.Deal_Name, stage: `${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks}`, days: m.weeksElapsed * 7, action: `Overdue by ${m.weeksElapsed - m.targetWeeks} weeks — update customer`, email: d.Email, phone: d.Phone });
        } else if (m.status === 'approaching') {
          yellowFlags.push({ name: d.Deal_Name, stage: `${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks}`, days: m.weeksElapsed * 7, action: 'Approaching deadline — prepare update', email: d.Email, phone: d.Phone });
        }
      }
      if (d.Stage === 'Measurement Issues') {
        yellowFlags.push({ name: d.Deal_Name, stage: 'Meas. Issues', days, action: 'Check measurement issue', email: d.Email, phone: d.Phone });
      }
    });

    // Sort by days (fewest first — most recent = most actionable)
    redFlags.sort((a, b) => a.days - b.days);
    yellowFlags.sort((a, b) => a.days - b.days);

    // Manufacturing breakdown
    const inMfg = deals.filter(d => d.Stage === 'In Manufacturing');
    const mfgSummary = inMfg.map(d => {
      const m = getMfgStatus(d);
      return { name: d.Deal_Name, product: m.product, weeksElapsed: m.weeksElapsed, targetWeeks: m.targetWeeks, status: m.status, country: d.Country, value: getDealValue(d) };
    });

    // No-show list for the same month (drives the No Shows drilldown)
    const noShowItems = leads
      .filter(l => l.Status === 'No Show' && isInMonth(l.Modified_Time, year, month))
      .map(l => {
        const key = (l.Email || '').toLowerCase();
        const rebooked = key ? (leadsByEmail.get(key)?.Status === 'Virtual Demo Booked') : false;
        return {
          name: l.Full_Name,
          email: l.Email,
          phone: getLeadPhone(l),
          date: l.Modified_Time,
          country: l.Country,
          rebooked,
        };
      });

    return NextResponse.json({
      configured: true,
      month: monthLabel,
      kpis: {
        newLeads: newLeadsThisMonth,
        demosBooked: salesCalls.length,
        demosCompleted: demosCompletedThisMonth,
        noShows: noShowsThisMonth,
        ordersThisMonth,
        activePipelineValue: Math.round(activePipelineValue),
      },
      completedDemos: {
        count: completed.count,
        items: completed.items,
        debug: completed.debug,
      },
      noShowItems,
      activePipeline,
      directBookings,
      directBookingCount: directBookings.length,
      manufacturing: {
        total: inMfg.length,
        onTrack: mfgSummary.filter(m => m.status === 'on_track').length,
        approaching: mfgSummary.filter(m => m.status === 'approaching').length,
        overdue: mfgSummary.filter(m => m.status === 'overdue').length,
        details: mfgSummary,
      },
      redFlags: redFlags.slice(0, 15),
      yellowFlags: yellowFlags.slice(0, 10),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Pipeline failed';
    console.error('[Zoho Pipeline]', error);
    return NextResponse.json({ configured: true, error: msg }, { status: 500 });
  }
}
