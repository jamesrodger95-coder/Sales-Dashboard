export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import {
  searchPersonDeep, getTodaySchedule, getTomorrowSchedule,
  getPipelineSummaryText, getManufacturingStatusText, getMonthStats,
  getFollowUpsText, getLeadSourceAnalysis, getBookingPlatformAnalysis,
  getDirectBookingsText, getMonthComparison, getNoShowPatterns,
} from '@/lib/search';

const SYSTEM_PROMPT = `You are James Rodger's sales intelligence assistant for Bryant Dental — a UK dental MedTech company selling the world's lightest ergonomic loupes and headlights.

You have deep access to:

1. ZOHO CRM (Leads): full profiles with Lead_Source (where they came from: Website, Google Ads, Referral, EuroLeads, etc.), Status (pipeline stage), country, city, contact info, dates.

2. ZOHO CRM (Deals/Orders): stage, product type (Refractive 2.9/3.8/5.7/7.8x or MagniFlex), lighting selection, order value, manufacturing timelines (MagniFlex=20wk, Refractive=12wk).

3. GOOGLE CALENDAR: all calls with booking platform detection (Calendly vs Cal.com), attendance commitment (Yes/No), prep notes from leads, country, phone.

4. CROSS-REFERENCE: calendar emails matched to Zoho leads and deals to determine conversion status.

When answering:
- Be specific: real names, numbers, dates, percentages
- Always mention Lead_Source when discussing any lead
- Always mention booking platform (Calendly/Cal.com) when discussing bookings
- For person lookups: combine CRM + Calendar + Order data into one profile
- Format cleanly with sections and bullet points
- Phone numbers as clickable links: [+44...](tel:+44...)
- If data seems incomplete, say what you couldn't find
- Be concise — James checks this on his phone`;

const VOICE_SYSTEM_PROMPT = `You are Jarvis, James Rodger's voice AI assistant for Bryant Dental sales.

You have access to Google Calendar, Zoho CRM leads and deals, and cross-reference data.

CRITICAL: You are being SPOKEN aloud. Format for speech:
- NO markdown, NO bullet points, NO asterisks, NO hashtags, NO dashes as separators
- NO tables or structured lists
- Use natural conversational sentences
- Say "You have three calls today" not "CALLS: 3"
- Say "twenty-three percent" naturally
- Lead with the most important info first
- Keep total response under 4 sentences for quick queries, under 8 sentences for briefings
- Address James directly: "You have..." "Your first call is..."
- For names, say them naturally (no email addresses)
- For phone numbers, don't read them out — just say "I'll display the number"
- If asked for a briefing, start with "Good morning James" or "Here's your briefing"

Example good response: "You have three calls today James. First up is Doctor Patel at 2 PM from North America. You also have five follow-ups needing attention, two are urgent — one overdue MagniFlex order and a lead who registered six days ago without contact."

Example BAD response (do not do this): "**TODAY'S CALLS:** - Dr Patel: 14:00 - Dr Chen: 15:00"`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], voice = false } = body;
    if (!message) return NextResponse.json({ reply: 'Ask me anything about your sales data.' });

    const q = message.toLowerCase();
    const now = new Date();
    let context = '';

    try {
      // Person search — detect names or "find/search/status/who is" queries
      const isPersonQuery = /find|search|who is|status of|tell me about|look up|check on/i.test(q);
      const stopWords = new Set(['find', 'search', 'show', 'me', 'who', 'is', 'the', 'of', 'has', 'did', 'what', 'when', 'where', 'how', 'my', 'all', 'any', 'a', 'an', 'in', 'for', 'to', 'from', 'with', 'about', 'ordered', 'status', 'stage', 'today', 'this', 'month', 'week', 'tell', 'look', 'up', 'check', 'on']);
      const nameWords = message.split(/\s+/).filter((w: string) => !stopWords.has(w.toLowerCase()) && w.length > 2);
      const nameQuery = nameWords.join(' ');

      // Route to the right data fetcher(s)
      const fetches: Promise<string>[] = [];
      const labels: string[] = [];

      if (q.includes('today') || q.includes('schedule today') || q.includes('calls today')) {
        fetches.push(getTodaySchedule()); labels.push("TODAY'S SCHEDULE");
      }
      if (q.includes('tomorrow')) {
        fetches.push(getTomorrowSchedule()); labels.push("TOMORROW'S SCHEDULE");
      }
      if (q.includes('pipeline') || q.includes('stages') || (q.includes('lead') && !isPersonQuery)) {
        fetches.push(getPipelineSummaryText()); labels.push('PIPELINE');
      }
      if (q.includes('manufactur') || q.includes('production') || q.includes('delayed') || q.includes('overdue') || q.includes('magniflex')) {
        fetches.push(getManufacturingStatusText()); labels.push('MANUFACTURING');
      }
      if (q.includes('follow') || q.includes('chase') || q.includes('urgent') || q.includes('action') || q.includes('va ') || q.includes('team') || q.includes('should')) {
        fetches.push(getFollowUpsText()); labels.push('FOLLOW-UPS');
      }
      if (q.includes('source') || q.includes('where do') || q.includes('channel') || q.includes('lead source') || q.includes('come from')) {
        fetches.push(getLeadSourceAnalysis()); labels.push('LEAD SOURCES');
      }
      if (q.includes('calendly') || q.includes('cal.com') || q.includes('platform') || q.includes('booking source')) {
        fetches.push(getBookingPlatformAnalysis(now.getFullYear(), now.getMonth())); labels.push('BOOKING PLATFORMS');
      }
      if (q.includes('direct booking') || q.includes('not in crm') || q.includes('no crm') || q.includes('missing from')) {
        fetches.push(getDirectBookingsText(now.getFullYear(), now.getMonth())); labels.push('DIRECT BOOKINGS');
      }
      if (q.includes('no show') || q.includes('no-show') || q.includes('missed') || q.includes('pattern')) {
        fetches.push(getNoShowPatterns()); labels.push('NO-SHOW PATTERNS');
      }
      if (q.includes('this month') || q.includes('stats') || (q.includes('rate') && !q.includes('source'))) {
        fetches.push(getMonthStats(now.getFullYear(), now.getMonth())); labels.push('THIS MONTH');
      }
      if (q.includes('last month') || q.includes('previous month')) {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        fetches.push(getMonthStats(lm.getFullYear(), lm.getMonth())); labels.push('LAST MONTH');
      }
      if (q.includes('compare') || q.includes(' vs ') || q.includes('versus')) {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        fetches.push(getMonthComparison(now.getFullYear(), now.getMonth(), lm.getFullYear(), lm.getMonth())); labels.push('MONTH COMPARISON');
      }

      // Person search — if nothing else matched or explicitly requested
      if ((fetches.length === 0 || isPersonQuery) && nameQuery.length > 2) {
        fetches.push(searchPersonDeep(nameQuery)); labels.push(`SEARCH: "${nameQuery}"`);
      }

      // Fetch all data in parallel
      const results = await Promise.allSettled(fetches);
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          context += `${labels[i]}:\n${r.value}\n\n`;
        }
      });
    } catch (err) {
      context += `Data fetch error: ${err instanceof Error ? err.message : 'unknown'}\n`;
    }

    // Build Claude messages
    const messages = [
      ...history.slice(-8).map((h: { role: string; content: string }) => ({ role: h.role, content: h.content })),
      {
        role: 'user' as const,
        content: context
          ? `[DATA — ${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}]\n${context}[QUESTION]\n${message}`
          : message,
      },
    ];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: voice ? 500 : 1200, system: voice ? VOICE_SYSTEM_PROMPT : SYSTEM_PROMPT, messages }),
    });

    const data = await claudeRes.json();
    if (data.error) {
      if (context) return NextResponse.json({ reply: `I couldn't analyse that, but here's the raw data:\n\n${context.substring(0, 600)}` });
      return NextResponse.json({ reply: 'Sorry, having trouble right now. Try again.' });
    }

    return NextResponse.json({ reply: data.content?.[0]?.text || 'No response.' });
  } catch (error: unknown) {
    console.error('[Chat]', error);
    return NextResponse.json({ reply: 'Something went wrong. Try again.' });
  }
}
