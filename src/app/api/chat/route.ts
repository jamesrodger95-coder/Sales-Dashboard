export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import {
  searchPersonDeep, getTodaySchedule, getTomorrowSchedule,
  getPipelineSummaryText, getManufacturingStatusText, getMonthStats,
  getFollowUpsText, getLeadSourceAnalysis, getBookingPlatformAnalysis,
  getDirectBookingsText, getMonthComparison, getNoShowPatterns,
  searchDebriefs, getDebriefFollowUpsText, getDebriefStats,
} from '@/lib/search';
import { activeCards, wonThisMonth, lostThisMonth, countByColumn, totalValue, BoardCard } from '@/lib/board';

// ============================================================================
// Closing Board summary — formatted for chat context
// ============================================================================
async function getBoardSummaryText(): Promise<string> {
  const [active, won, lost] = await Promise.all([activeCards(), wonThisMonth(), lostThisMonth()]);
  const counts = countByColumn(active);
  const wonValue = totalValue(won);
  const lines = [
    `Active: ${active.length} (Interested ${counts.interested} · Quoted ${counts.quoted} · Deciding ${counts.deciding} · Closing ${counts.closing})`,
    `Won this month: ${won.length}${wonValue > 0 ? ` (£${wonValue.toLocaleString()})` : ''}`,
    `Lost this month: ${lost.length}`,
  ];
  const fmt = (c: BoardCard) => `  ${c.name}${c.country ? ` · ${c.country}` : ''}${c.magnification.length ? ` · ${c.magnification.join('/')}` : ''}${typeof c.value === 'number' && c.value > 0 ? ` · £${c.value.toLocaleString()}` : ''}${c.notes ? ` — "${c.notes.slice(0, 80)}"` : ''}`;
  if (active.length > 0) {
    lines.push('\nACTIVE CARDS:');
    for (const col of ['interested', 'quoted', 'deciding', 'closing'] as const) {
      const inCol = active.filter(c => c.column === col);
      if (inCol.length === 0) continue;
      lines.push(`  [${col.toUpperCase()}]`);
      inCol.forEach(c => lines.push(fmt(c)));
    }
  }
  if (won.length > 0) {
    lines.push('\nWON THIS MONTH:');
    won.forEach(c => lines.push(fmt(c) + (c.wonAt ? ` · ${new Date(c.wonAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '')));
  }
  return lines.join('\n');
}

// Strip non-name words from the message so we can search Zoho/calendar/debriefs
// for the actual person being referenced. Lenient — false positives are fine
// because Claude reads the full context and ignores irrelevant matches.
function extractNameQuery(message: string): string {
  const stopWords = new Set(['find', 'search', 'show', 'me', 'who', 'is', 'the', 'of', 'has', 'did', 'what', 'when', 'where', 'how', 'my', 'all', 'any', 'a', 'an', 'in', 'for', 'to', 'from', 'with', 'about', 'ordered', 'status', 'stage', 'today', 'this', 'month', 'week', 'tell', 'look', 'up', 'check', 'on', 'discuss', 'discussed', 'talk', 'talked', 'said', 'logged', 'note', 'notes', 'debrief', 'and', 'or', 'but', 'are', 'were', 'was', 'have', 'had', 'do', 'does', 'will', 'would', 'should', 'could', 'can', 'i', 'you', 'we', 'they', 'their', 'his', 'her', 'him', 'her', 'them', 'us', 'our', 'your', 'mine', 'yours']);
  const words = message.split(/\s+/).filter((w: string) => !stopWords.has(w.toLowerCase().replace(/[^\w]/g, '')) && w.replace(/[^\w]/g, '').length > 2);
  return words.join(' ');
}

// Wrap any data fetcher so a single failure doesn't poison the whole context.
// On error we leave a visible marker in the prompt instead of swallowing it —
// Claude will see "DATA UNAVAILABLE" and tell James specifically what's missing.
async function safeFetch(label: string, fn: () => Promise<string>): Promise<{ label: string; text: string }> {
  try {
    const text = await fn();
    return { label, text: text || '(no data)' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[Chat] ${label} fetch failed:`, msg);
    return { label, text: `DATA UNAVAILABLE: ${msg}` };
  }
}

// ============================================================================
// Always-on context — fetched on every chat turn in parallel
// ============================================================================
async function buildFullContext(message: string, now: Date): Promise<string> {
  const nameQuery = extractNameQuery(message);

  // Always-fire fetchers. Every chat turn gets the full picture; routing
  // is now about ENRICHING context, not gating it.
  const coreFetchers: Array<[string, () => Promise<string>]> = [
    ["TODAY'S SCHEDULE",       () => getTodaySchedule()],
    ["TOMORROW'S SCHEDULE",    () => getTomorrowSchedule()],
    ['THIS MONTH STATS',       () => getMonthStats(now.getFullYear(), now.getMonth())],
    ['PIPELINE & MANUFACTURING', () => getPipelineSummaryText()],
    ['URGENT FOLLOW-UPS',      () => getFollowUpsText()],
    ['LEAD SOURCES',           () => getLeadSourceAnalysis()],
    ['DEBRIEF FOLLOW-UPS',     () => getDebriefFollowUpsText()],
    ['DEBRIEF STATS',          () => getDebriefStats()],
    ['CLOSING BOARD',          () => getBoardSummaryText()],
  ];

  const q = message.toLowerCase();
  const enrich: Array<[string, () => Promise<string>]> = [];

  if (q.includes('manufactur') || q.includes('production') || q.includes('delayed') || q.includes('overdue')) {
    enrich.push(['MANUFACTURING DETAIL', () => getManufacturingStatusText()]);
  }
  if (q.includes('calendly') || q.includes('cal.com') || q.includes('platform') || q.includes('booking source')) {
    enrich.push(['BOOKING PLATFORMS', () => getBookingPlatformAnalysis(now.getFullYear(), now.getMonth())]);
  }
  if (q.includes('direct booking') || q.includes('not in crm') || q.includes('no crm') || q.includes('missing from')) {
    enrich.push(['DIRECT BOOKINGS', () => getDirectBookingsText(now.getFullYear(), now.getMonth())]);
  }
  if (q.includes('no show') || q.includes('no-show') || q.includes('missed') || q.includes('pattern')) {
    enrich.push(['NO-SHOW PATTERNS', () => getNoShowPatterns()]);
  }
  if (q.includes('last month') || q.includes('previous month') || q.includes('compare') || q.includes(' vs ') || q.includes('versus')) {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    enrich.push(['LAST MONTH STATS', () => getMonthStats(lm.getFullYear(), lm.getMonth())]);
    enrich.push(['MONTH-OVER-MONTH', () => getMonthComparison(now.getFullYear(), now.getMonth(), lm.getFullYear(), lm.getMonth())]);
  }

  // Person search — always run if we can extract a meaningful name query.
  // Cheap to run, gives Claude direct hits when James asks "find X" or
  // mentions a name mid-sentence.
  if (nameQuery.length > 2) {
    enrich.push([`PERSON SEARCH: "${nameQuery}"`, () => searchPersonDeep(nameQuery)]);
    enrich.push([`DEBRIEFS: "${nameQuery}"`,      () => searchDebriefs(nameQuery)]);
  }

  const all = [...coreFetchers, ...enrich];
  const results = await Promise.all(all.map(([label, fn]) => safeFetch(label, fn)));

  return results
    .filter(r => r.text && r.text !== '(no data)')
    .map(r => `[${r.label}]\n${r.text}`)
    .join('\n\n');
}

// ============================================================================
// System prompts
// ============================================================================
const BASE_RULES = `You are Jarvis, James Rodger's AI sales assistant at Bryant Dental. You are an expert in dental loupes, sales, and CRM data analysis.

You have FULL access to James's data — it is provided below as [DATA] sections. Use it. Calculate. Spot patterns. Compare. Draw conclusions.

PRODUCT KNOWLEDGE:
- Refractive Pro with MagniTech: removable scope loupes, 31-36g titanium, world's lightest
- Magnifications: 2.9x (130mm FOV), 3.8x (100mm FOV), 5.7x (60mm FOV), 7.8x (45mm FOV)
- MagniFlex: 3-in-1 — three interchangeable magnifications via neodymium magnets
- Manufacturing: Refractive 12 weeks, MagniFlex 20 weeks
- Headlights: Ignis 4 Pro (wireless counterbalancing), Ignis 4 Lite, Halo (wired, 60hr battery)
- 90-day trial, lifetime warranty, AI custom fit, UK manufactured
- Competitors: Orascoptic (93g EyeZoom), Zeiss, Designs for Vision, ExamVision

RULES:
- Be short and snappy. Max 3-4 sentences for simple questions. Max 6-8 lines for complex ones.
- Lead with the answer, not the context.
- Use specific numbers, names, and dates from the data.
- For questions about a person, search every [DATA] section for their name and synthesize.
- For "compare" / "vs" / "trend" questions, calculate from the data and draw a conclusion.
- You can do math, percentages, ratios, comparisons.
- End with a short follow-up offer when useful: "Want details?" / "Want the full list?"

NEVER say any of these phrases:
- "I couldn't analyse that"
- "I don't have access to that data"
- "I'm unable to"
- "I don't have real-time access"
- "As an AI, I..."
- "I apologise but..."

If something specific is missing from the [DATA], say exactly what's missing — e.g. "No leads from Japan in this month's data" — not a generic "I couldn't analyse that." If the data is there but doesn't answer the question, say "No matches for X in this month's records — want me to look back further?"

You are Claude-level intelligent. Think deeply, give the best possible answer.`;

const TEXT_SYSTEM = `${BASE_RULES}

FORMATTING (text chat):
- Compact data: "Website: 12 | Ads: 8 | Instagram: 6"
- Phone numbers as [+44...](tel:+44...) so James can tap them
- Minimal markdown. Short lines, not paragraphs.
- If a list has more than 5 items, give top 3-5 and say "plus X more".`;

const VOICE_SYSTEM = `${BASE_RULES}

FORMATTING (voice — spoken aloud):
- NO markdown (no **, ##, -, *, |, brackets). NO line breaks. One flowing paragraph.
- Every answer must be speakable in ONE BREATH — under 100 words for simple questions, under 200 for briefings.
- Say numbers naturally: "thirty-four", "seventeen percent".
- Address James directly: "You have...", "Your first call..."
- For phone numbers, say "I'll display the number" — don't read digits out loud.
- If a list has more than 5 items, give top 3 and say "plus two more".`;

// ============================================================================
// Route
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], voice = false } = body;
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ reply: 'Ask me anything about your sales data.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[Chat] ANTHROPIC_API_KEY missing');
      return NextResponse.json(
        { reply: 'Anthropic API key is not configured on the server. Set ANTHROPIC_API_KEY in the environment.' },
        { status: 500 },
      );
    }

    const now = new Date();
    const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Always-on full context. Per-fetcher errors leave "DATA UNAVAILABLE"
    // markers in place rather than crashing the whole turn.
    const context = await buildFullContext(message, now);

    const userContent = `[DATE: ${dateLine}]

[DATA]
${context}

[QUESTION]
${message}`;

    const messages = [
      ...history.slice(-8).map((h: { role: string; content: string }) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: userContent },
    ];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: voice ? 400 : 1000,
        system: voice ? VOICE_SYSTEM : TEXT_SYSTEM,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error('[Chat] Claude API error', claudeRes.status, errBody);
      return NextResponse.json(
        { reply: `Claude API error ${claudeRes.status}: ${errBody.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const data = await claudeRes.json();
    if (data?.error) {
      console.error('[Chat] Claude returned error object', data.error);
      return NextResponse.json(
        { reply: `Claude returned an error: ${data.error.message || JSON.stringify(data.error).slice(0, 300)}` },
        { status: 502 },
      );
    }

    const reply = data?.content?.[0]?.text;
    if (!reply) {
      console.error('[Chat] No reply text in Claude response', JSON.stringify(data).slice(0, 500));
      return NextResponse.json(
        { reply: 'Claude returned an empty response. Try rephrasing the question.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Chat] Unhandled error:', error);
    return NextResponse.json(
      { reply: `Chat route crashed: ${msg}` },
      { status: 500 },
    );
  }
}
