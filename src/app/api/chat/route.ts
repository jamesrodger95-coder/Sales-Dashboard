export const dynamic = 'force-dynamic';
// The text path may make several Claude round-trips (tool call -> data -> answer),
// so it needs more headroom than the old single-shot route. Voice still answers
// in one hop and is unaffected.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  searchPersonDeep, getTodaySchedule, getTomorrowSchedule,
  getPipelineSummaryText, getManufacturingStatusText, getMonthStats,
  getFollowUpsText, getLeadSourceAnalysis, getBookingPlatformAnalysis,
  getDirectBookingsText, getMonthComparison, getNoShowPatterns,
  searchDebriefs, getDebriefFollowUpsText, getDebriefStats,
} from '@/lib/search';
import { activeCards, wonThisMonth, lostThisMonth, countByColumn, totalValue, BoardCard } from '@/lib/board';
import { AGENT_TOOLS, executeAgentTool } from '@/lib/agent-tools';

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
// Always-on context — VOICE ONLY.
//
// Voice has to answer in one breath and one round-trip, so it still gets the
// full digest up front. Text chat no longer uses this: it calls tools instead,
// which means a simple "hi" costs zero data fetches rather than nine.
// ============================================================================
async function buildFullContext(message: string, now: Date): Promise<string> {
  const nameQuery = extractNameQuery(message);

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
- You can do math, percentages, ratios, comparisons.
- End with a short follow-up offer when useful: "Want details?" / "Want the full list?"

NEVER say any of these phrases:
- "I couldn't analyse that"
- "I don't have access to that data"
- "I'm unable to"
- "I don't have real-time access"
- "As an AI, I..."
- "I apologise but..."

If the data genuinely doesn't contain the answer, say exactly what's missing — e.g. "No leads from Japan this month" — never a generic "I couldn't analyse that."

You are Claude-level intelligent. Think deeply, give the best possible answer.`;

const TEXT_SYSTEM = `${BASE_RULES}

YOU HAVE TOOLS. Use them — do not guess, and do not claim you lack access.
- Questions about who is at a stage ("awaiting measurement", "in manufacturing", "gone cold") -> list_deals / list_leads.
- Questions about meeting volume or calendar colours ("how many green events in the last 30 days") -> query_calendar.
- Questions about one named person -> search_person.
- Broad "how is the month going" questions -> get_summary.
Call several tools at once when the question needs more than one. If a first
lookup comes back empty, try a broader filter before concluding there's nothing.

IMPORTANT on calendar colours: Google has no single "green" — sage is the pale
green and basil the dark one, and query_calendar counts both when asked for
green. Events with no colour set report as "default". If James asks about a
colour he has none of, say so and tell him which colours he IS using.

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

// Model for the text agent. Voice stays on its existing model — it is tuned for
// one-shot latency, and a tool loop would make it feel sluggish.
const TEXT_MODEL = 'claude-opus-5';
const VOICE_MODEL = 'claude-sonnet-4-6';

// How many times Claude may call tools before we force it to answer. Five is
// enough for "look it up, then cross-check" without risking the 60s ceiling.
const MAX_TOOL_ROUNDS = 5;

interface HistoryTurn { role: string; content: string }

// ============================================================================
// Text path — agentic loop
// ============================================================================
async function runTextAgent(
  client: Anthropic,
  message: string,
  history: HistoryTurn[],
  dateLine: string,
  now: Date,
): Promise<{ reply: string; toolsUsed: string[] }> {
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8).map(h => ({
      role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: h.content,
    })),
    { role: 'user', content: `[DATE: ${dateLine}]\n\n${message}` },
  ];

  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;

    const response = await client.messages.create({
      model: TEXT_MODEL,
      max_tokens: 4000,
      system: TEXT_SYSTEM,
      // Medium effort keeps a phone-sized chat responsive; the tools do the
      // heavy lifting, so the model rarely needs to reason for long.
      output_config: { effort: 'medium' },
      // On the final round drop the tools entirely so Claude must answer from
      // what it already has rather than asking for another lookup it can't get.
      ...(lastRound ? {} : { tools: AGENT_TOOLS }),
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      return { reply: text, toolsUsed };
    }

    const toolCalls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    messages.push({ role: 'assistant', content: response.content });

    // Run every requested tool in parallel, then return all results in a single
    // user message — splitting them teaches the model to stop batching calls.
    const results = await Promise.all(
      toolCalls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
        toolsUsed.push(call.name);
        try {
          const out = await executeAgentTool(call.name, call.input, now);
          return { type: 'tool_result', tool_use_id: call.id, content: out || '(no results)' };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown error';
          console.error(`[Chat] tool ${call.name} failed:`, msg);
          return {
            type: 'tool_result',
            tool_use_id: call.id,
            content: `Tool failed: ${msg}`,
            is_error: true,
          };
        }
      }),
    );

    messages.push({ role: 'user', content: results });
  }

  return { reply: '', toolsUsed };
}

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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const now = new Date();
    const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // ---- Text: agentic, tool-driven ----------------------------------------
    if (!voice) {
      const { reply, toolsUsed } = await runTextAgent(client, message, history as HistoryTurn[], dateLine, now);
      if (toolsUsed.length) console.log(`[Chat] tools used: ${toolsUsed.join(', ')}`);
      if (!reply) {
        return NextResponse.json(
          { reply: 'I ran out of lookups before I could answer that. Try narrowing the question.' },
          { status: 502 },
        );
      }
      return NextResponse.json({ reply, toolsUsed });
    }

    // ---- Voice: unchanged single-shot digest --------------------------------
    const context = await buildFullContext(message, now);
    const userContent = `[DATE: ${dateLine}]\n\n[DATA]\n${context}\n\n[QUESTION]\n${message}`;

    const messages: Anthropic.MessageParam[] = [
      ...(history as HistoryTurn[]).slice(-8).map(h => ({
        role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: h.content,
      })),
      { role: 'user', content: userContent },
    ];

    const response = await client.messages.create({
      model: VOICE_MODEL,
      max_tokens: 400,
      system: VOICE_SYSTEM,
      messages,
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!reply) {
      console.error('[Chat] No reply text in Claude response');
      return NextResponse.json(
        { reply: 'Claude returned an empty response. Try rephrasing the question.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ reply: 'Rate limited by the Claude API — give it a moment and ask again.' }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ reply: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.' }, { status: 401 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[Chat] Claude API error', error.status, error.message);
      return NextResponse.json({ reply: `Claude API error ${error.status}: ${error.message}` }, { status: 502 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Chat] Unhandled error:', error);
    return NextResponse.json({ reply: `Chat route crashed: ${msg}` }, { status: 500 });
  }
}
