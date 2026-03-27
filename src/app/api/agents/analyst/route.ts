export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractMeetingNotes } from '@/lib/google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getLeadPhone, buildEmailMaps, isInMonth, getMfgStatus } from '@/lib/zoho-client';

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

        // Orders this month
        const ordersThisMonth = deals.filter(d => isInMonth(d.Created_Time, now.getFullYear(), now.getMonth())).length;

        // Conversion
        let ordered = 0, demoDone = 0, directCount = 0;
        monthCalls.forEach(e => {
          const email = getExternalAttendeeEmail(e).toLowerCase();
          if (!email) return;
          if (dealsByEmail.has(email)) { ordered++; return; }
          const lead = leadsByEmail.get(email);
          if (!lead) { directCount++; return; }
          if (lead.Status === 'Virtual Demo Completed' || lead.Status === 'Demo Completed') demoDone++;
        });
        const showedUp = ordered + demoDone;
        const convRate = showedUp > 0 ? Math.round((ordered / showedUp) * 100) : 0;
        conversionSummary = `Conversion: ${convRate}% (${ordered} ordered from ${showedUp} demos). Direct bookings (no CRM): ${directCount} of ${monthCalls.length} (${Math.round(directCount / Math.max(monthCalls.length, 1) * 100)}%)`;

        // Follow-up items (top 15 most urgent)
        leads.forEach(l => {
          const days = Math.floor((nowMs - new Date(l.Modified_Time).getTime()) / 86400000);
          const phone = getLeadPhone(l);
          if ((!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted') && days > 1 && days <= 14) {
            followUpItems.push({ severity: 'red', name: l.Full_Name, stage: 'Registered', days, contact: phone, action: `Contact ${l.Full_Name} — registered ${days} days ago, ${l.Country || 'unknown country'}` });
          } else if (l.Status === 'No Show' && days <= 14) {
            followUpItems.push({ severity: 'red', name: l.Full_Name, stage: 'No Show', days, contact: phone, action: `Rebook ${l.Full_Name} — no-showed ${days} days ago` });
          } else if ((l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && days > 7 && days <= 30) {
            followUpItems.push({ severity: 'amber', name: l.Full_Name, stage: 'VDC', days, contact: phone, action: `Follow up ${l.Full_Name} — demo ${days} days ago, no order yet` });
          }
        });

        // Manufacturing
        const inMfg = deals.filter(d => d.Stage === 'In Manufacturing');
        const mfgByStatus: Record<string, number> = { on_track: 0, approaching: 0, overdue: 0 };
        const overdueNames: string[] = [];
        const approachingNames: string[] = [];
        inMfg.forEach(d => {
          const m = getMfgStatus(d);
          mfgByStatus[m.status]++;
          if (m.status === 'overdue') {
            overdueNames.push(`${d.Deal_Name} (${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks})`);
            followUpItems.push({ severity: 'red', name: d.Deal_Name, stage: `${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks}`, days: m.weeksElapsed * 7, contact: d.Phone, action: `Update ${d.Deal_Name} — ${m.product} overdue by ${m.weeksElapsed - m.targetWeeks} weeks` });
          } else if (m.status === 'approaching') {
            approachingNames.push(`${d.Deal_Name} (${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks})`);
          }
        });
        mfgSummary = `Manufacturing: ${inMfg.length} orders (${mfgByStatus.on_track} on track, ${mfgByStatus.approaching} approaching, ${mfgByStatus.overdue} overdue).${overdueNames.length > 0 ? ' Overdue: ' + overdueNames.slice(0, 5).join(', ') : ''}`;

        // Pipeline summary text
        pipelineSummary = [
          `Lead stages (last 30d): ${Object.entries(stages).map(([s, c]) => `${s}: ${c}`).join(', ')}`,
          `Active orders: ${Object.entries(activeDealCounts).map(([s, c]) => `${s}: ${c}`).join(', ')}`,
          `Orders this month: ${ordersThisMonth}`,
          conversionSummary,
          mfgSummary,
        ].join('\n');

        // Sort follow-ups
        followUpItems.sort((a) => a.severity === 'red' ? -1 : 1);
        followUpItems = followUpItems.slice(0, 15);
      } catch (err) {
        console.error('[Analyst] Zoho error (non-fatal):', err);
        pipelineSummary = 'Zoho data unavailable';
      }
    }

    // Build a COMPACT prompt for Claude (not raw JSON dumps)
    const briefingPrompt = `Generate a daily sales briefing for James Rodger at Bryant Dental.

DATE: ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

TODAY'S CALLS:
${todayCalls.length === 0 ? 'No calls scheduled today.' : formatCalls(todayCalls).map(c => `- ${c.time} ${c.name} | ${c.phone || 'no phone'} | ${c.country || '?'} | Notes: ${c.notes || 'none'} | Attendance: ${c.attendance === false ? 'NO' : c.attendance === true ? 'Yes' : '?'}`).join('\n')}

TOMORROW'S CALLS:
${tomorrowCalls.length === 0 ? 'No calls tomorrow.' : formatCalls(tomorrowCalls).map(c => `- ${c.time} ${c.name} | ${c.phone || 'no phone'} | ${c.country || '?'}`).join('\n')}

THIS MONTH: ${monthCalls.length} calls (last month: estimate based on typical volume)

PIPELINE:
${pipelineSummary}

FOLLOW-UP ITEMS (${followUpItems.length}):
${followUpItems.map(f => `[${f.severity.toUpperCase()}] ${f.name} — ${f.stage} — ${f.days}d — ${f.action}`).join('\n')}

Return a JSON report with: summary, todaysCalls, tomorrowsCalls, pipeline (object with key stats), attentionItems (array), insights (array with type: positive/concern/neutral), teamTasks (object with leadContact/measurementSpecialist/productionUpdater arrays of task strings — WHO and WHY only, no scripts).`;

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
