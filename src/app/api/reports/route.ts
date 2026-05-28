export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured,
  getDealValue, getLeadPhone, buildEmailMaps,
  isInMonth,
  DEAL_SHIPPED, DEAL_POST_DELIVERY, DEAL_READY,
} from '@/lib/zoho-client';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail } from '@/lib/google-calendar';
import { getCompletedDemos } from '@/lib/data-engine';

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59),
  };
}

export async function GET(request: NextRequest) {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getMonth())); // 0-indexed
    const { start: mStart, end: mEnd } = monthRange(year, month);
    const monthLabel = mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    console.log(`[Reports] Generating for ${monthLabel}`);

    // Fetch all data (cached)
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);

    // Calendar data for the month
    const calEvents = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
    const salesCalls = calEvents.filter(isSalesCall);

    // Email maps for cross-referencing
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

    // Helper: leads entering a status this month (by Modified_Time)
    const leadsInStatusThisMonth = (status: string) =>
      leads.filter(l => l.Status === status && isInMonth(l.Modified_Time, year, month));

    // Helper: leads currently at a status (regardless of when)
    const leadsCurrentlyAt = (statuses: string[]) =>
      leads.filter(l => l.Status && statuses.includes(l.Status));

    // Helper: deals entering a stage this month
    const dealsInStageThisMonth = (stages: string[]) =>
      deals.filter(d => stages.includes(d.Stage) && isInMonth(d.Modified_Time, year, month));

    // Helper: deals currently at stages
    const dealsCurrentlyAt = (stages: string[]) =>
      deals.filter(d => stages.includes(d.Stage));

    // === REPORT 1: New E-Com Leads (created this month — ALL leads created in window) ===
    // Rule: count by Created_Time only. Current Status is irrelevant — a lead that came in
    // in May and progressed to FCM still "arrived in May".
    const newLeadsThisMonth = leads.filter(l => isInMonth(l.Created_Time, year, month));
    // Subset still waiting for first contact (over 24h)
    const staleSubset = newLeadsThisMonth.filter(l =>
      (!l.Status || l.Status === 'Registered' || l.Status === '-None-' || l.Status === 'Not Contacted')
      && daysSince(l.Created_Time) > 1
    );

    // Breakdown by current status — answers "where did these {count} new leads end up?"
    const byStatus: Record<string, number> = {};
    newLeadsThisMonth.forEach(l => {
      const s = l.Status && l.Status !== '-None-' ? l.Status : 'Registered';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    const report1 = {
      title: 'New Leads',
      type: 'monthly' as const,
      count: newLeadsThisMonth.length,
      staleCount: staleSubset.length,
      byStatus,
      data: newLeadsThisMonth
        .slice()
        .sort((a, b) => (b.Created_Time || '').localeCompare(a.Created_Time || ''))
        .map(l => ({
          name: l.Full_Name, email: l.Email, phone: getLeadPhone(l),
          country: l.Country, created: l.Created_Time, daysSince: daysSince(l.Created_Time),
          status: l.Status && l.Status !== '-None-' ? l.Status : 'Registered',
          stale: daysSince(l.Created_Time) > 1 && (!l.Status || l.Status === 'Registered' || l.Status === '-None-' || l.Status === 'Not Contacted'),
        })),
    };

    // === REPORT 2: Virtual Demos Booked (CRM + Calendar combined) ===
    const crmVDB = leadsInStatusThisMonth('Virtual Demo Booked');
    const calBookings = salesCalls.map(e => ({
      name: extractLeadName(e), email: getExternalAttendeeEmail(e), date: e.start,
    }));
    // Deduplicate by email
    const crmEmails = new Set(crmVDB.map(l => l.Email?.toLowerCase()).filter(Boolean));
    const directBookings = calBookings.filter(b => b.email && !crmEmails.has(b.email.toLowerCase()) && !leadsByEmail.has(b.email.toLowerCase()));

    const report2 = {
      title: 'Demos Booked',
      type: 'monthly' as const,
      crmCount: crmVDB.length,
      directCount: directBookings.length,
      totalCount: crmVDB.length + directBookings.length,
      calendarTotal: salesCalls.length,
      crmData: crmVDB.map(l => ({
        name: l.Full_Name, email: l.Email, phone: getLeadPhone(l),
        country: l.Country, date: l.Modified_Time, source: 'CRM' as const,
      })),
      directData: directBookings.map(b => ({
        name: b.name, email: b.email, phone: null as string | null,
        country: null as string | null, date: b.date, source: 'Direct' as const,
      })),
    };

    // === REPORT 3: No Contact Leads ===
    const noContactThisMonth = leadsInStatusThisMonth('No Contact From Customer');
    const allNoContact = leadsCurrentlyAt(['No Contact From Customer', 'No Contact', 'No Contact -']);

    const report3 = {
      title: 'No Contact Leads',
      type: 'monthly' as const,
      thisMonthCount: noContactThisMonth.length,
      totalCurrentCount: allNoContact.length,
      data: noContactThisMonth.map(l => ({
        name: l.Full_Name, email: l.Email, phone: getLeadPhone(l),
        country: l.Country, created: l.Created_Time, wentCold: l.Modified_Time,
        daysSinceActivity: daysSince(l.Modified_Time),
        recentlyCold: daysSince(l.Modified_Time) <= 7,
      })),
    };

    // === REPORT 4: Demos Completed ===
    // Calendar past (sales calls, not cancelled, not no-show) + Zoho VDC moves this month, dedup by email.
    const completed = getCompletedDemos(calEvents, leads, dealsByEmail, year, month, now);
    const allVDC = leadsCurrentlyAt(['Virtual Demo Completed', 'Demo Completed']); // legacy snapshot for reference

    console.log(`[Reports] ${monthLabel} demos completed = ${completed.count}`, completed.debug);

    const report4 = {
      title: 'Demos Completed',
      type: 'monthly' as const,
      thisMonthCount: completed.count,
      totalPending: allVDC.length,
      debug: completed.debug,
      data: completed.items.map(it => {
        const days = Math.floor((Date.now() - new Date(it.date).getTime()) / 86400000);
        return {
          name: it.name, email: it.email, phone: it.phone,
          country: it.country, demoDate: it.date, daysSinceDemo: days,
          hasOrder: it.hasOrder,
          orderStage: it.status,
          orderValue: null,
          source: it.source,
          urgency: it.hasOrder ? 'ordered' : days > 14 ? 'at_risk' : days > 7 ? 'follow_up' : 'ok',
        };
      }),
    };

    // Conversion rate over THIS MONTH's completed demos
    const vdcWithOrder = report4.data.filter(d => d.hasOrder).length;
    const demoToOrderRate = completed.count > 0 ? Math.round((vdcWithOrder / completed.count) * 100) : 0;

    // === REPORT 5: No Shows (moved to No Show this month) ===
    const noShowsThisMonth = leadsInStatusThisMonth('No Show');
    const allNoShows = leadsCurrentlyAt(['No Show']);

    const report5 = {
      title: 'No Shows',
      type: 'monthly' as const,
      thisMonthCount: noShowsThisMonth.length,
      totalCount: allNoShows.length,
      noShowRate: salesCalls.length > 0 ? Math.round((noShowsThisMonth.length / salesCalls.length) * 100) : 0,
      data: noShowsThisMonth.map(l => {
        const email = l.Email?.toLowerCase() || '';
        // Check if rebooked (has a VDB or calendar event after the no-show)
        const hasRebook = email ? (leadsByEmail.get(email)?.Status === 'Virtual Demo Booked') : false;
        return {
          name: l.Full_Name, email: l.Email, phone: getLeadPhone(l),
          country: l.Country, noShowDate: l.Modified_Time, daysSince: daysSince(l.Modified_Time),
          rebooked: hasRebook,
        };
      }),
    };

    // === REPORT 6: Awaiting Measurements ===
    const awaitingMeasurements = dealsCurrentlyAt(['Awaiting Measurements']);
    const report6 = {
      title: 'Awaiting Measurements',
      type: 'snapshot' as const,
      currentCount: awaitingMeasurements.length,
      enteredThisMonth: dealsInStageThisMonth(['Awaiting Measurements']).length,
      data: awaitingMeasurements.map(d => {
        const days = daysSince(d.Modified_Time);
        return {
          name: d.Deal_Name, email: d.Email, phone: d.Phone,
          country: d.Country, orderDate: d.Created_Time, daysWaiting: days,
          amount: getDealValue(d),
          urgency: days > 10 ? 'red' : days > 7 ? 'amber' : 'green',
        };
      }),
    };

    // === REPORT 7: Measurement Final Checks ===
    const finalChecks = dealsCurrentlyAt(['Measurements Final Checks']);
    const report7 = {
      title: 'Final Checks',
      type: 'snapshot' as const,
      currentCount: finalChecks.length,
      data: finalChecks.map(d => {
        const days = daysSince(d.Modified_Time);
        return {
          name: d.Deal_Name, email: d.Email, orderDate: d.Created_Time,
          daysInCheck: days, amount: getDealValue(d),
          urgency: days > 5 ? 'red' : days > 3 ? 'amber' : 'green',
        };
      }),
    };

    // === REPORT 8: Orders In Process ===
    const inManufacturing = dealsCurrentlyAt(['In Manufacturing']);
    const assembled = dealsCurrentlyAt(['Order Assembled']);
    const readyToSend = dealsCurrentlyAt(['Order Ready to Send']);
    const addressConfirmed = dealsCurrentlyAt(['Address Confirmed']);
    const measurementIssues = dealsCurrentlyAt(['Measurement Issues']);

    const allInProcess = [...inManufacturing, ...assembled, ...readyToSend, ...addressConfirmed];
    const report8 = {
      title: 'Orders In Process',
      type: 'snapshot' as const,
      totalCount: allInProcess.length,
      breakdown: {
        manufacturing: inManufacturing.length,
        assembled: assembled.length,
        readyToSend: readyToSend.length,
        addressConfirmed: addressConfirmed.length,
        measurementIssues: measurementIssues.length,
      },
      data: allInProcess.map(d => {
        const days = daysSince(d.Modified_Time);
        return {
          name: d.Deal_Name, country: d.Country, orderDate: d.Created_Time,
          stage: d.Stage, daysInStage: days, amount: getDealValue(d),
          delayed: d.Stage === 'In Manufacturing' && days > 105,
        };
      }),
    };

    // === REPORT 9: Orders Dispatched ===
    const dispatchedThisMonth = dealsInStageThisMonth([...DEAL_SHIPPED, ...DEAL_POST_DELIVERY, ...DEAL_READY]);
    const arrivedThisMonth = dealsInStageThisMonth(['Order Arrived']);
    const dispatchedValue = dispatchedThisMonth.reduce((s, d) => s + getDealValue(d), 0);

    const report9 = {
      title: 'Orders Dispatched',
      type: 'monthly' as const,
      dispatchedCount: dispatchedThisMonth.length,
      arrivedCount: arrivedThisMonth.length,
      revenueDispatched: Math.round(dispatchedValue),
      data: dispatchedThisMonth.map(d => ({
        name: d.Deal_Name, country: d.Country, stage: d.Stage,
        date: d.Modified_Time, amount: getDealValue(d),
      })),
    };

    // === 6-month trends ===
    const trends: Record<string, number[]> = {
      newLeads: [], demosBooked: [], noContact: [], demosCompleted: [],
      noShows: [], ordersCreated: [], dispatched: [],
    };
    for (let i = 5; i >= 0; i--) {
      const tYear = i === 0 ? year : new Date(year, month - i).getFullYear();
      const tMonth = i === 0 ? month : new Date(year, month - i).getMonth();
      trends.newLeads.push(leads.filter(l => isInMonth(l.Created_Time, tYear, tMonth)).length);
      trends.demosBooked.push(leads.filter(l => l.Status === 'Virtual Demo Booked' && isInMonth(l.Modified_Time, tYear, tMonth)).length);
      trends.noContact.push(leads.filter(l => l.Status === 'No Contact From Customer' && isInMonth(l.Modified_Time, tYear, tMonth)).length);
      trends.demosCompleted.push(leads.filter(l => (l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && isInMonth(l.Modified_Time, tYear, tMonth)).length);
      trends.noShows.push(leads.filter(l => l.Status === 'No Show' && isInMonth(l.Modified_Time, tYear, tMonth)).length);
      trends.ordersCreated.push(deals.filter(d => isInMonth(d.Created_Time, tYear, tMonth)).length);
      trends.dispatched.push(deals.filter(d => [...DEAL_SHIPPED, ...DEAL_POST_DELIVERY].includes(d.Stage) && isInMonth(d.Modified_Time, tYear, tMonth)).length);
    }

    // Month labels for trends
    const trendLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      trendLabels.push(d.toLocaleDateString('en-GB', { month: 'short' }));
    }

    return NextResponse.json({
      configured: true,
      month: monthLabel,
      year, monthIndex: month,
      reports: { report1, report2, report3, report4, report5, report6, report7, report8, report9 },
      demoToOrderRate,
      trends,
      trendLabels,
      totalLeads: leads.length,
      totalDeals: deals.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Reports failed';
    console.error('[Reports]', error);
    return NextResponse.json({ configured: true, error: msg }, { status: 500 });
  }
}
