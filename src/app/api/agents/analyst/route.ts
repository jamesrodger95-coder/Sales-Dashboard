export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractMeetingNotes, detectBookingPlatform, hasPrepNotes } from '@/lib/google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, buildEmailMaps, isInMonth } from '@/lib/zoho-client';
import { getAttentionNeeded, getManufacturingSummary, getConversionStats } from '@/lib/data-engine';

// In-memory cache
let cachedReport: { date: string; data: Record<string, unknown>; generatedAt: string } | null = null;

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  if (cachedReport?.date === today) {
    return NextResponse.json({ ...cachedReport.data, cached: true, generatedAt: cachedReport.generatedAt });
  }
  return NextResponse.json({ generated: false, message: 'No briefing today. Click Generate.' });
}

export async function POST() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const tomorrowEnd = new Date(todayEnd.getTime() + 86400000);
    const nowMs = Date.now();

    console.log('[Analyst] Starting briefing generation...');

    // Single calendar fetch — this month only (avoids token race condition)
    const monthEvents = await fetchCalendarEvents(monthStart.toISOString(), monthEnd.toISOString());
    const monthCalls = monthEvents.filter(isSalesCall);
    const todayCalls = monthCalls.filter(e => { const d = new Date(e.start); return d >= todayStart && d < todayEnd; });
    const tomorrowCalls = monthCalls.filter(e => { const d = new Date(e.start); return d >= todayEnd && d < tomorrowEnd; });

    console.log(`[Analyst] Calendar: ${monthCalls.length} calls, ${todayCalls.length} today, ${tomorrowCalls.length} tomorrow`);

    // Build today/tomorrow call details
    const formatCalls = (events: typeof monthCalls) => events.map(e => {
      const notes = extractMeetingNotes(e);
      return {
        time: new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
        name: extractLeadName(e), phone: extractPhone(e), country: extractCountry(e),
        notes: notes.notes || null, attendance: notes.attendanceConfirmed,
      };
    });

    // Build summary data (not raw dumps)
    let pipelineSummary = 'Zoho CRM not connected';
    let followUpItems: { severity: string; name: string; stage: string; days: number; contact: string | null; action: string }[] = [];
    let mfgSummary = '';
    let conversionSummary = '';
    let zohoConnected = false;

    if (isZohoConfigured()) {
      try {
        const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
        const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);
        zohoConnected = true;

        console.log(`[Analyst] Zoho: ${leads.length} leads, ${deals.length} deals`);

        // Lead stage counts (recent 30 days only)
        const recentLeads = leads.filter(l => (nowMs - new Date(l.Modified_Time).getTime()) < 30 * 86400000);
        const stages: Record<string, number> = {};
        recentLeads.forEach(l => { const s = l.Status || 'No Status'; stages[s] = (stages[s] || 0) + 1; });

        // Active deals
        const activeStages = ['Awaiting Measurements', 'Measurements Final Checks', 'Measurement Issues', 'In Manufacturing', 'Order Assembled'];
        const activeDealCounts: Record<string, number> = {};
        deals.filter(d => activeStages.includes(d.Stage)).forEach(d => { activeDealCounts[d.Stage] = (activeDealCounts[d.Stage] || 0) + 1; });

        // Shared data engine — same logic as dashboard, pipeline, chatbot
        const ordersThisMonth = deals.filter(d => isInMonth(d.Created_Time, now.getFullYear(), now.getMonth())).length;
        const calEmails = monthCalls.map(e => ({ email: getExternalAttendeeEmail(e) }));
        const conv = getConversionStats(calEmails, leadsByEmail, dealsByEmail);
        const directCount = monthCalls.filter(e => {
          const email = getExternalAttendeeEmail(e).toLowerCase();
          return email && !leadsByEmail.has(email) && !dealsByEmail.has(email);
        }).length;
        conversionSummary = `Conversion: ${conv.convRate}% (${conv.ordered} ordered from ${conv.showedUp} demos). Direct bookings (no CRM): ${directCount} of ${monthCalls.length} (${Math.round(directCount / Math.max(monthCalls.length, 1) * 100)}%)`;

        // Follow-up items from shared data engine
        const attention = getAttentionNeeded(leads, deals);
        followUpItems = attention.slice(0, 15).map(a => ({
          severity: a.priority, name: a.name, stage: a.stage, days: a.days,
          contact: a.phone || null, action: a.action,
        }));

        // Manufacturing from shared data engine
        const mfg = getManufacturingSummary(deals);
        const overdueNames = mfg.orders.filter(o => o.status === 'overdue').slice(0, 5).map(o => `${o.name} (${o.product} Wk ${o.weeksElapsed}/${o.targetWeeks})`);
        mfgSummary = `Manufacturing: ${mfg.total} orders (${mfg.onTrack} on track, ${mfg.approaching} approaching, ${mfg.overdue} overdue).${overdueNames.length > 0 ? ' Overdue: ' + overdueNames.join(', ') : ''}`;

        pipelineSummary = [
          `Lead stages (last 30d): ${Object.entries(stages).map(([s, c]) => `${s}: ${c}`).join(', ')}`,
          `Active orders: ${Object.entries(activeDealCounts).map(([s, c]) => `${s}: ${c}`).join(', ')}`,
          `Orders this month: ${ordersThisMonth}`,
          conversionSummary,
          mfgSummary,
        ].join('\n');
      } catch (err) {
        console.error('[Analyst] Zoho error (non-fatal):', err);
        pipelineSummary = 'Zoho data unavailable';
      }
    }

    // Source breakdown for this month's calls
    let sourceSummary = '';
    {
      const platforms: Record<string, number> = { Calendly: 0, 'Cal.com': 0, Other: 0 };
      let withNotes = 0, attendanceYes = 0, attendanceNo = 0;
      monthCalls.forEach(e => {
        platforms[detectBookingPlatform(e)]++;
        if (hasPrepNotes(e)) withNotes++;
        const n = extractMeetingNotes(e);
        if (n.attendanceConfirmed === true) attendanceYes++;
        if (n.attendanceConfirmed === false) attendanceNo++;
      });
      sourceSummary = `Booking platforms: Calendly ${platforms.Calendly}, Cal.com ${platforms['Cal.com']}, Other ${platforms.Other}. With prep notes: ${withNotes}/${monthCalls.length}. Attendance commitment: ${attendanceYes} Yes, ${attendanceNo} No.`;
    }

    // Build a COMPACT prompt for Claude (not raw JSON dumps)
    const briefingPrompt = `Generate a daily sales briefing for James Rodger at Bryant Dental.

DATE: ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

TODAY'S CALLS:
${todayCalls.length === 0 ? 'No calls scheduled today.' : formatCalls(todayCalls).map(c => `- ${c.time} ${c.name} | ${c.phone || 'no phone'} | ${c.country || '?'} | Notes: ${c.notes || 'none'} | Attendance: ${c.attendance === false ? 'NO' : c.attendance === true ? 'Yes' : '?'}`).join('\n')}

TOMORROW'S CALLS:
${tomorrowCalls.length === 0 ? 'No calls tomorrow.' : formatCalls(tomorrowCalls).map(c => `- ${c.time} ${c.name} | ${c.phone || 'no phone'} | ${c.country || '?'}`).join('\n')}

THIS MONTH: ${monthCalls.length} calls

PIPELINE:
${pipelineSummary}

LEAD SOURCES:
${sourceSummary}

FOLLOW-UP ITEMS (${followUpItems.length}):
${followUpItems.map(f => `[${f.severity.toUpperCase()}] ${f.name} — ${f.stage} — ${f.days}d — ${f.action}`).join('\n')}

Return a JSON report with: summary, todaysCalls, tomorrowsCalls, pipeline (object with key stats), attentionItems (array), insights (array with type: positive/concern/neutral — include at least one source insight about booking platforms, prep notes, or attendance commitment), teamTasks (object with leadContact/measurementSpecialist/productionUpdater arrays of task strings — WHO and WHY only, no scripts).`;

    console.log('[Analyst] Calling Claude API...');
    console.log('[Analyst] Prompt length:', briefingPrompt.length, 'chars');

    // Call Claude directly with fetch to avoid any SDK issues
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: briefingPrompt }],
      }),
    });

    const claudeData = await claudeRes.json();

    if (claudeData.error) {
      console.error('[Analyst] Claude API error:', claudeData.error);
      // Fallback: return raw data summary without AI analysis
      const fallbackReport = {
        generated: true, date: today, generatedAt: now.toISOString(),
        summary: `${followUpItems.length} items need attention. ${monthCalls.length} calls this month. ${pipelineSummary.split('\n')[0]}`,
        todaysCalls: formatCalls(todayCalls),
        tomorrowsCalls: formatCalls(tomorrowCalls),
        attentionItems: followUpItems,
        insights: [{ type: 'neutral', text: 'AI analysis unavailable — showing raw data summary' }],
        teamTasks: {},
        pipeline: { calls: monthCalls.length, zohoConnected },
        fallback: true,
      };
      cachedReport = { date: today, data: fallbackReport, generatedAt: now.toISOString() };
      return NextResponse.json(fallbackReport);
    }

    const resultText = claudeData.content?.[0]?.text || '';
    console.log('[Analyst] Claude response length:', resultText.length);

    let parsed;
    try {
      // Try to extract JSON from the response (Claude sometimes wraps in markdown)
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(resultText);
    } catch {
      parsed = {
        summary: resultText.substring(0, 300),
        todaysCalls: formatCalls(todayCalls),
        tomorrowsCalls: formatCalls(tomorrowCalls),
        attentionItems: followUpItems,
        insights: [],
        teamTasks: {},
        pipeline: {},
      };
    }

    const report = { generated: true, date: today, generatedAt: now.toISOString(), ...parsed };
    cachedReport = { date: today, data: report, generatedAt: now.toISOString() };
    console.log('[Analyst] Briefing generated successfully');

    return NextResponse.json(report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Analysis failed';
    console.error('[Analyst] Fatal error:', error);
    return NextResponse.json({ error: msg, generated: false }, { status: 500 });
  }
}
