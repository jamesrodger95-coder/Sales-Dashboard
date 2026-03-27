export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractMeetingNotes } from '@/lib/google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, getLeadPhone, buildEmailMaps, categorizeLeadStatus, isInMonth, getMfgStatus, getProductType } from '@/lib/zoho-client';
import { askClaude } from '@/lib/claude-client';

// In-memory cache for daily report
let cachedReport: { date: string; data: Record<string, unknown>; generatedAt: string } | null = null;

const ANALYST_PROMPT = `You are James Rodger's AI Data Analyst at Bryant Dental — a UK dental MedTech company selling the world's lightest ergonomic loupes and headlights to clinicians worldwide. James leads a 3-person sales team (Lead Contact Person, Measurement Specialist, Production Updater).

PRODUCTS: Refractive Pro loupes (2.9x, 3.8x, 5.7x, 7.8x) — 12 week manufacturing. MagniFlex (3-in-1 magnification) — 20 week manufacturing. Ignis 4 headlight (Standard/Pro). Halo wired headlight.

KEY SELLING POINTS: Only refractives save your neck (not just back). World's lightest at 31-36g titanium. AI-powered custom fit. 90-day money-back trial. Lifetime warranty. UK manufactured. Free worldwide shipping.

MANUFACTURING TIMELINES: MagniFlex = 20 weeks. All Refractive models = 12 weeks. Flag overdue orders. Warn at 2 weeks before deadline.

TEAM TASKS FORMAT: Tasks are WHO and WHY only. NO scripts, NO WhatsApp templates, NO email templates. The team knows how to communicate. Example: "Contact Naser Bader — registered 6 days ago, Kuwait, no response yet". NOT "Send this message: Hi Dr. Chen..."

You analyse ALL sales data (Google Calendar calls, Zoho CRM leads/deals, cross-references, manufacturing pipeline) and produce a sharp daily intelligence briefing. Be specific with names, numbers, and actions. No fluff.

Your report MUST be valid JSON with this structure:
{
  "todaysCalls": [{"time":"14:00","name":"Dr Smith","phone":"+44...","country":"UK","notes":"Interested in 5.7x","attendance":"Yes","crmStatus":"Direct Booking"}],
  "tomorrowsCalls": [{"time":"10:00","name":"Dr Jones","phone":"+1...","country":"US","notes":null,"attendance":null,"crmStatus":"In Pipeline"}],
  "pipeline": {"newLeads":18,"newLeadsVsLastMonth":"-18%","demosBooked":34,"demosCompleted":28,"noShows":4,"noShowRate":"12%","orders":6,"conversionRate":"21%","pipelineValue":"$711,000"},
  "attentionItems": [{"severity":"red","name":"Naser Bader","stage":"Registered","days":6,"contact":"+965...","action":"VA needs to message on WhatsApp immediately"}],
  "insights": [{"type":"positive","text":"Kuwait is fastest-growing: 4 leads this month vs 1 in Feb"},{"type":"concern","text":"Direct bookings account for 47% of calls — CRM missing half your leads"},{"type":"neutral","text":"Leads who provide prep notes convert at 28% vs 11%"}],
  "teamTasks": {"leadContact":["Message Naser Bader on WhatsApp — 6 days uncontacted"],"measurementSpecialist":["Follow up with 3 customers over 10 days in Awaiting Measurements"],"productionUpdater":["Send delay notification to 2 customers over 16 weeks in Manufacturing"]},
  "weeklyScorecard": null,
  "summary": "6 items need attention today. Conversion rate trending up to 21%. 2 uncontacted Kuwait leads need immediate WhatsApp outreach."
}

Rules:
- Every insight must cite specific numbers from the data
- Attention items sorted by urgency (red first, then amber)
- Team tasks must name specific leads with phone/email
- Compare this month to last month where possible
- Flag any direct bookings (calendar only, no CRM) as funnel leaks
- If it's Friday, include weeklyScorecard
- Keep summary to 2-3 sentences max
- Return ONLY valid JSON, no markdown fences`;

export async function GET() {
  // Return cached report if from today
  const today = new Date().toISOString().split('T')[0];
  if (cachedReport?.date === today) {
    return NextResponse.json({ ...cachedReport.data, cached: true, generatedAt: cachedReport.generatedAt });
  }
  return NextResponse.json({ generated: false, message: 'No report generated today. Use POST to generate.' });
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
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    console.log('[Analyst] Generating daily briefing...');

    // Fetch calendar data
    const [monthEvents, lastMonthEvents] = await Promise.all([
      fetchCalendarEvents(monthStart.toISOString(), monthEnd.toISOString()),
      fetchCalendarEvents(lastMonthStart.toISOString(), lastMonthEnd.toISOString()),
    ]);

    const monthCalls = monthEvents.filter(isSalesCall);
    const lastMonthCalls = lastMonthEvents.filter(isSalesCall);

    // Today and tomorrow
    const todayCalls = monthCalls.filter(e => { const d = new Date(e.start); return d >= todayStart && d < todayEnd; });
    const tomorrowCalls = monthCalls.filter(e => { const d = new Date(e.start); return d >= todayEnd && d < tomorrowEnd; });

    // Build call summaries
    const callSummary = (events: typeof monthCalls) => events.map(e => {
      const notes = extractMeetingNotes(e);
      return {
        name: extractLeadName(e), email: getExternalAttendeeEmail(e),
        phone: extractPhone(e), country: extractCountry(e),
        date: e.start, notes: notes.notes, attendance: notes.attendanceConfirmed,
      };
    });

    // Zoho data
    let zohoData = null;
    if (isZohoConfigured()) {
      try {
        const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
        const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);
        const nowMs = Date.now();

        // Cross-reference this month's calls
        const crossRef = monthCalls.map(e => {
          const email = getExternalAttendeeEmail(e).toLowerCase();
          const deal = email ? dealsByEmail.get(email) : undefined;
          const lead = email ? leadsByEmail.get(email) : undefined;
          let status = 'direct_booking';
          if (deal) status = 'ordered';
          else if (lead) {
            const cat = categorizeLeadStatus(lead.Status);
            status = cat === 'demo_done' ? 'demo_done' : cat === 'no_show' ? 'no_show' : cat === 'gone_cold' ? 'gone_cold' : 'in_pipeline';
          }
          return { name: extractLeadName(e), email, status, stage: deal?.Stage || lead?.Status };
        });

        // Lead stage counts (recent only)
        const recentLeads = leads.filter(l => (nowMs - new Date(l.Modified_Time).getTime()) < 30 * 86400000);
        const leadStages: Record<string, number> = {};
        recentLeads.forEach(l => { const s = l.Status || 'No Status'; leadStages[s] = (leadStages[s] || 0) + 1; });

        // Deal stage counts (active)
        const activeStages = ['Awaiting Measurements', 'Measurements Final Checks', 'Measurement Issues', 'In Manufacturing', 'Order Assembled', 'Order Ready to Send', 'Address Confirmed'];
        const dealStages: Record<string, { count: number; overdue: string[] }> = {};
        deals.filter(d => activeStages.includes(d.Stage)).forEach(d => {
          const days = Math.floor((nowMs - new Date(d.Modified_Time).getTime()) / 86400000);
          if (!dealStages[d.Stage]) dealStages[d.Stage] = { count: 0, overdue: [] };
          dealStages[d.Stage].count++;
          if ((d.Stage === 'Awaiting Measurements' && days > 10) || (d.Stage === 'In Manufacturing' && days > 105)) {
            dealStages[d.Stage].overdue.push(`${d.Deal_Name} (${days}d)`);
          }
        });

        // Follow-up flags
        const flags: { severity: string; name: string; stage: string; days: number; contact: string | null; email: string | null; action: string }[] = [];
        leads.forEach(l => {
          const days = Math.floor((nowMs - new Date(l.Modified_Time).getTime()) / 86400000);
          const phone = getLeadPhone(l);
          if ((!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted') && days > 1 && days <= 14) {
            flags.push({ severity: 'red', name: l.Full_Name, stage: 'Registered', days, contact: phone, email: l.Email, action: 'VA needs to contact on WhatsApp' });
          } else if (l.Status === 'First Contact Made' && days > 10 && days <= 30) {
            flags.push({ severity: 'red', name: l.Full_Name, stage: 'FCM', days, contact: phone, email: l.Email, action: 'Going cold — escalate' });
          } else if (l.Status === 'No Show' && days <= 14) {
            flags.push({ severity: 'red', name: l.Full_Name, stage: 'No Show', days, contact: phone, email: l.Email, action: 'Rebook demo' });
          } else if ((l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && days > 7 && days <= 30) {
            flags.push({ severity: 'amber', name: l.Full_Name, stage: 'VDC', days, contact: phone, email: l.Email, action: 'Decision cooling — follow up' });
          }
        });

        // Orders this month
        const ordersThisMonth = deals.filter(d => isInMonth(d.Created_Time, now.getFullYear(), now.getMonth())).length;

        // Conversion
        const ordered = crossRef.filter(r => r.status === 'ordered').length;
        const demoDone = crossRef.filter(r => r.status === 'demo_done').length;
        const showedUp = ordered + demoDone;
        const convRate = showedUp > 0 ? Math.round((ordered / showedUp) * 100) : 0;

        const directBookings = crossRef.filter(r => r.status === 'direct_booking');

        // Manufacturing timeline analysis
        const inMfg = deals.filter(d => d.Stage === 'In Manufacturing');
        const mfgDetails = inMfg.map(d => {
          const m = getMfgStatus(d);
          return { name: d.Deal_Name, product: m.product, weeksElapsed: m.weeksElapsed, targetWeeks: m.targetWeeks, status: m.status, country: d.Country };
        });
        const mfgOnTrack = mfgDetails.filter(m => m.status === 'on_track').length;
        const mfgApproaching = mfgDetails.filter(m => m.status === 'approaching').length;
        const mfgOverdue = mfgDetails.filter(m => m.status === 'overdue').length;

        // Add manufacturing flags
        mfgDetails.filter(m => m.status === 'overdue').forEach(m => {
          flags.push({ severity: 'red', name: m.name, stage: `${m.product} — Week ${m.weeksElapsed} of ${m.targetWeeks}`, days: m.weeksElapsed * 7, contact: null, email: null, action: `Manufacturing overdue by ${m.weeksElapsed - m.targetWeeks} weeks — escalate with production` });
        });
        mfgDetails.filter(m => m.status === 'approaching').forEach(m => {
          flags.push({ severity: 'amber', name: m.name, stage: `${m.product} — Week ${m.weeksElapsed} of ${m.targetWeeks}`, days: m.weeksElapsed * 7, contact: null, email: null, action: 'Approaching manufacturing deadline — prepare customer update' });
        });

        // Product mix
        const productMix: Record<string, number> = {};
        deals.filter(d => isInMonth(d.Created_Time, now.getFullYear(), now.getMonth())).forEach(d => {
          const p = getProductType(d);
          productMix[p] = (productMix[p] || 0) + 1;
        });

        zohoData = {
          leadStages, dealStages, flags: flags.sort((a) => a.severity === 'red' ? -1 : 1),
          ordersThisMonth, convRate, directBookings: directBookings.length,
          crossRef: crossRef.slice(0, 50),
          activePipelineValue: deals.filter(d => activeStages.includes(d.Stage)).reduce((s, d) => s + getDealValue(d), 0),
          manufacturing: { total: inMfg.length, onTrack: mfgOnTrack, approaching: mfgApproaching, overdue: mfgOverdue, details: mfgDetails.slice(0, 20) },
          productMix,
        };
      } catch (zohoErr) {
        console.error('[Analyst] Zoho error:', zohoErr);
      }
    }

    // Compile data for Claude
    const dataForAnalysis = {
      date: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      isFriday: now.getDay() === 5,
      todayCalls: callSummary(todayCalls),
      tomorrowCalls: callSummary(tomorrowCalls),
      thisMonthCalls: monthCalls.length,
      lastMonthCalls: lastMonthCalls.length,
      monthCallsByCountry: (() => {
        const m: Record<string, number> = {};
        monthCalls.forEach(e => { const c = extractCountry(e) || 'Unknown'; m[c] = (m[c] || 0) + 1; });
        return m;
      })(),
      zoho: zohoData,
    };

    console.log('[Analyst] Sending to Claude for analysis...');
    const result = await askClaude(ANALYST_PROMPT, JSON.stringify(dataForAnalysis, null, 2));

    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      // If Claude returns invalid JSON, wrap it
      parsed = { summary: result, todaysCalls: [], insights: [], attentionItems: [], teamTasks: {}, pipeline: {} };
    }

    const report = {
      generated: true,
      date: today,
      generatedAt: now.toISOString(),
      ...parsed,
    };

    // Cache it
    cachedReport = { date: today, data: report, generatedAt: now.toISOString() };
    console.log('[Analyst] Report generated successfully');

    return NextResponse.json(report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Analysis failed';
    console.error('[Analyst]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
