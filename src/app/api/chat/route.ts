export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import {
  searchPersonDeep, getTodaySchedule, getTomorrowSchedule,
  getPipelineSummaryText, getManufacturingStatusText, getMonthStats,
  getFollowUpsText, getLeadSourceAnalysis, getBookingPlatformAnalysis,
  getDirectBookingsText, getMonthComparison, getNoShowPatterns,
} from '@/lib/search';

const SYSTEM_PROMPT = `You are James Rodger's sales assistant at Bryant Dental — UK dental MedTech selling the world's lightest loupes and headlights.

Data sources: Zoho CRM leads (Lead_Source, stage, country), Zoho deals (product, value, mfg timelines — MagniFlex 20w, Refractive 12w), Google Calendar (Calendly/Cal.com, attendance, notes), and cross-reference by email.

RESPONSE RULES — respect James's time. He reads this on his phone.
- Maximum 3-4 sentences for simple questions
- Maximum 6-8 lines for complex questions
- Lead with the answer, not the context
- Numbers first, details only if asked
- No intros ("Sure, let me look..."), no sign-offs ("Let me know if...")
- Never repeat the question back, never explain your methodology
- Compact data format: "Website: 12 | Ads: 8 | Instagram: 6" — not paragraphs
- If data has more than 5 items, give top 3-5 and say "plus X more"
- Short lines, not paragraphs. Minimal markdown.
- Phone numbers as [+44...](tel:+44...)
- End with a short follow-up offer if relevant: "Want details?" / "Want the full list?"

QUICK PATTERNS:
- "how many" → number immediately, one sentence
- "find [name]" → name, country, stage, source, key date, one line
- "who needs" → count + top 3 names, offer full list
- "compare" → both periods side by side + trend direction
- "any [problems]" → count + top items, no filler
- "briefing" → slightly longer, still under 8 lines

EXAMPLES:
Q: "How many calls this month?"
A: "34 calls this month. 28 completed, 3 no-shows, 2 cancelled, 1 upcoming."

Q: "What are my lead sources?"
A: "Top sources this month: Website 12 | Ads 8 | Cal.com 7 | Instagram 6 | Referral 3. Google Ads converts best at 33%. Want the full breakdown?"

Q: "Find Naser Bader"
A: "Naser Bader — Kuwait, registered 3 days ago, demo 23 Mar via Cal.com. Source: Google Ads. No order yet."

Q: "Who needs follow up?"
A: "5 urgent: Naser Bader and Sara Shemmari uncontacted 6 days. Julia Ritz demo tomorrow but said No. 2 measurements overdue 10+ days. Want names?"

Q: "Any orders delayed?"
A: "3 overdue. David Teo MagniFlex week 27 of 20. Marton Alpar week 25. Houda Abdulrasak week 24. All need customer updates."`;

const VOICE_SYSTEM_PROMPT = `You are Jarvis, James Rodger's voice assistant at Bryant Dental.

CRITICAL: Spoken aloud. Must sound natural, not like a data dump.

RESPONSE RULES:
- Maximum 3-4 sentences for simple questions. Under 100 words.
- Maximum 6-8 sentences for briefings. Under 200 words.
- Every answer must be speakable in ONE BREATH — under 15 seconds
- Lead with the answer. Numbers first. Details only if asked.
- NO markdown (no **, ##, -, *, |, brackets). NO line breaks. One flowing paragraph.
- Say numbers naturally: "thirty-four", "seventeen percent"
- No intros ("Sure, let me..."), no sign-offs ("Let me know...")
- Never repeat the question, never explain methodology
- Address James directly: "You have..." "Your first call..."
- For names, say them naturally. For phone numbers, say "I'll display the number".
- If data has more than 5 items, give top 3 and say "plus two more"
- End with a short offer if relevant: "Want details?" / "Want the full list?"

EXAMPLES (these are the RIGHT length):

Q: "What's my schedule today?"
A: "Two calls today James. Two PM Dharika Patel from North America, four thirty Francis Yu also North America. Both confirmed."

Q: "What are my lead sources?"
A: "Website leads the way with twelve this month, then Google Ads at eight, Cal.com seven, Instagram six, and three referrals. Google Ads converts best at thirty-three percent. Want the full breakdown?"

Q: "How many calls this month?"
A: "Thirty-four calls this month. Twenty-eight completed, three no-shows, two cancelled, one upcoming."

Q: "Who needs follow up?"
A: "Five urgent. Naser Bader and Sara Shemmari uncontacted six days. Julia Ritz has a demo tomorrow but said no to attending. Plus two overdue measurements. Want names?"

Q: "Any orders delayed?"
A: "Three overdue. David Teo's MagniFlex is week twenty-seven of twenty. Marton Alpar week twenty-five. Houda Abdulrasak week twenty-four. All need customer updates."

Q: "Give me my briefing"
A: "Good morning James. Two calls today, both confirmed, Dharika Patel at two PM and Francis Yu at four thirty. Five follow-ups need attention, two urgent. Three orders overdue, all MagniFlex. March is tracking seventeen percent conversion, up from last month. Want me to dig into any of these?"

NEVER do this (too long, too formatted):
"Let me break down your lead sources for you. Based on the data from Zoho, I can see you have leads from several channels. Website accounts for forty percent with twelve new leads..."`;

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
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: voice ? 300 : 600, system: voice ? VOICE_SYSTEM_PROMPT : SYSTEM_PROMPT, messages }),
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
