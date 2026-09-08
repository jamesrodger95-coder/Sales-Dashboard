// ============================================================================
// Agent tools — the set of lookups Claude can call for itself during a chat.
//
// The older chat route pre-loaded a fixed digest of summaries on every turn and
// hoped the answer was somewhere in it. That works for "how's the month going?"
// and fails for anything specific ("who's sitting in Awaiting Measurements?"),
// because a summary can't contain every list. These tools invert that: Claude
// decides what it needs and fetches it.
//
// Every tool returns a compact human-readable string rather than raw JSON —
// it costs fewer tokens and Claude reads it just as well.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  fetchAllJamesLeads, fetchAllJamesDeals, getDealValue, getMfgStatus,
  categorizeLeadStatus, categorizeDealStage, getLeadPhone,
  LEAD_PRE_PURCHASE, LEAD_DEMO_DONE, LEAD_PURCHASED, LEAD_NO_SHOW,
  LEAD_GONE_COLD, LEAD_LOST,
  DEAL_AWAITING, DEAL_IN_PROGRESS, DEAL_READY, DEAL_SHIPPED,
  DEAL_POST_DELIVERY, DEAL_PROBLEM,
  type ZohoLead, type ZohoDeal,
} from '@/lib/zoho-client';
import {
  fetchCalendarEvents, isSalesCall, isCancelled, extractLeadName,
  extractCountry, detectBookingPlatform, resolveColourNames,
  type CalendarEvent,
} from '@/lib/google-calendar';
import {
  searchPersonDeep, searchDebriefs, getTodaySchedule, getTomorrowSchedule,
  getPipelineSummaryText, getManufacturingStatusText, getMonthStats,
  getFollowUpsText, getLeadSourceAnalysis, getNoShowPatterns,
} from '@/lib/search';
import { activeCards, wonThisMonth, lostThisMonth, countByColumn, totalValue, type BoardCard } from '@/lib/board';

const ALL_DEAL_STAGES = [
  ...DEAL_AWAITING, ...DEAL_IN_PROGRESS, ...DEAL_READY,
  ...DEAL_SHIPPED, ...DEAL_POST_DELIVERY, ...DEAL_PROBLEM,
];
const ALL_LEAD_STATUSES = [
  ...LEAD_PRE_PURCHASE, ...LEAD_DEMO_DONE, ...LEAD_PURCHASED,
  ...LEAD_NO_SHOW, ...LEAD_GONE_COLD, ...LEAD_LOST,
];

const DEAL_CATEGORIES: Record<string, string[]> = {
  awaiting: DEAL_AWAITING, in_progress: DEAL_IN_PROGRESS, ready: DEAL_READY,
  shipped: DEAL_SHIPPED, post_delivery: DEAL_POST_DELIVERY, problem: DEAL_PROBLEM,
};
const LEAD_CATEGORIES: Record<string, string[]> = {
  pre_purchase: LEAD_PRE_PURCHASE, demo_done: LEAD_DEMO_DONE,
  purchased: LEAD_PURCHASED, no_show: LEAD_NO_SHOW,
  gone_cold: LEAD_GONE_COLD, lost: LEAD_LOST,
};

const MAX_ROWS = 60;

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

// "2026-09" -> {year, month}. Also accepts "this"/"last" for convenience.
function parseMonth(input: string | undefined, now: Date): { year: number; month: number } | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  if (key === 'this' || key === 'this month') return { year: now.getFullYear(), month: now.getMonth() };
  if (key === 'last' || key === 'last month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  const m = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

function inMonth(dateStr: string, y: number, mo: number): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === y && d.getMonth() === mo;
}

// ============================================================================
// Tool schemas
// ============================================================================

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_deals',
    description:
      'List James\'s Zoho DEALS (orders placed) filtered by stage or stage category. ' +
      'Use this for any question about who is at a particular point in the order process — ' +
      'e.g. "who is awaiting measurements", "what is in manufacturing", "which orders are late". ' +
      'Returns customer name, stage, order value, country and days since last update.',
    input_schema: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ALL_DEAL_STAGES,
          description: 'Exact Zoho deal stage. Use this when the question names a specific stage.',
        },
        category: {
          type: 'string',
          enum: Object.keys(DEAL_CATEGORIES),
          description:
            'A group of stages. awaiting = ordered but not yet measured/paid; ' +
            'in_progress = being made; ready = ready to ship; shipped = dispatched; ' +
            'post_delivery = arrived/fitting; problem = refunded, late or returned.',
        },
        month: {
          type: 'string',
          description: 'Optional YYYY-MM (or "this"/"last") to limit to deals last updated in that month. Omit for all current deals regardless of age.',
        },
        limit: { type: 'number', description: `Max rows to return (default 40, hard cap ${MAX_ROWS}).` },
      },
      required: [],
    },
  },
  {
    name: 'list_leads',
    description:
      'List James\'s Zoho LEADS (pre-purchase prospects) filtered by status or status category. ' +
      'Use for "who has not booked yet", "who no-showed", "who went cold", "who did I demo to".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ALL_LEAD_STATUSES, description: 'Exact Zoho lead status.' },
        category: {
          type: 'string',
          enum: Object.keys(LEAD_CATEGORIES),
          description:
            'pre_purchase = contacted or demo booked; demo_done = demo completed; ' +
            'purchased = converted; no_show = missed the demo; gone_cold = stopped replying; lost = said no.',
        },
        month: { type: 'string', description: 'Optional YYYY-MM (or "this"/"last") to limit by last-updated month.' },
        limit: { type: 'number', description: `Max rows (default 40, hard cap ${MAX_ROWS}).` },
      },
      required: [],
    },
  },
  {
    name: 'query_calendar',
    description:
      'Count and optionally list Google Calendar events over a date range, with an optional colour filter. ' +
      'Use for questions like "how many green events in the last 30 days", "how many calls did I have last week", ' +
      'or any question about volume of meetings over a period. Always returns a colour breakdown so you can ' +
      'report what the colours actually are if the requested one is absent.',
    input_schema: {
      type: 'object',
      properties: {
        days_back: { type: 'number', description: 'Look back this many days from today. Use this OR start_date/end_date.' },
        start_date: { type: 'string', description: 'ISO date YYYY-MM-DD (inclusive).' },
        end_date: { type: 'string', description: 'ISO date YYYY-MM-DD (inclusive).' },
        colour: {
          type: 'string',
          description:
            'Optional colour filter. Accepts a plain word ("green", "red", "blue") or an exact Google palette ' +
            'name (sage, basil, tomato, flamingo, peacock, blueberry, lavender, grape, banana, tangerine, graphite). ' +
            '"green" matches both sage and basil.',
        },
        sales_calls_only: { type: 'boolean', description: 'If true, count only events that look like customer sales calls (default false = all events).' },
        include_list: { type: 'boolean', description: 'If true, also return the individual events (capped). Default false — counts only.' },
      },
      required: [],
    },
  },
  {
    name: 'search_person',
    description:
      'Deep search for one person by name across Zoho leads, Zoho deals, the calendar and call debriefs. ' +
      'Use whenever the question is about a specific named individual.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Person name or fragment.' } },
      required: ['name'],
    },
  },
  {
    name: 'get_summary',
    description:
      'Fetch one of the prebuilt dashboard summaries. Cheaper than listing raw records when the question is ' +
      'broad ("how is the month going", "what needs chasing", "where are my leads coming from").',
    input_schema: {
      type: 'object',
      properties: {
        report: {
          type: 'string',
          enum: [
            'month_stats', 'pipeline', 'manufacturing', 'follow_ups',
            'lead_sources', 'no_show_patterns', 'closing_board',
            'today_schedule', 'tomorrow_schedule',
          ],
          description: 'Which summary to fetch.',
        },
        month: { type: 'string', description: 'For month_stats only: YYYY-MM, or "this"/"last". Defaults to this month.' },
      },
      required: ['report'],
    },
  },
  {
    name: 'search_debriefs',
    description: 'Search James\'s post-call debrief notes for a name or keyword. Use for "what did I say about X", "what came up on that call".',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name or keyword.' } },
      required: ['query'],
    },
  },
];

// ============================================================================
// Formatters
// ============================================================================

function fmtDeal(d: ZohoDeal): string {
  const value = getDealValue(d);
  const age = daysSince(d.Modified_Time);
  const bits = [d.Deal_Name, d.Stage];
  if (value > 0) bits.push(`£${value.toLocaleString()}`);
  if (d.Country) bits.push(d.Country);
  if (age !== null) bits.push(`updated ${age}d ago`);
  if (categorizeDealStage(d.Stage) === 'in_progress') {
    const mfg = getMfgStatus(d);
    bits.push(`${mfg.product} wk${mfg.weeksElapsed}/${mfg.targetWeeks}${mfg.status === 'overdue' ? ' OVERDUE' : ''}`);
  }
  return '  ' + bits.join(' · ');
}

function fmtLead(l: ZohoLead): string {
  const age = daysSince(l.Modified_Time);
  const bits = [l.Full_Name, l.Status || 'no status'];
  if (l.Lead_Source) bits.push(l.Lead_Source);
  if (l.Country) bits.push(l.Country);
  const phone = getLeadPhone(l);
  if (phone) bits.push(phone);
  if (age !== null) bits.push(`updated ${age}d ago`);
  return '  ' + bits.join(' · ');
}

function fmtEvent(e: CalendarEvent): string {
  const when = new Date(e.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const bits = [when, extractLeadName(e) || e.summary, e.colour || 'default'];
  const country = extractCountry(e);
  if (country) bits.push(country);
  if (isCancelled(e)) bits.push('CANCELLED');
  return '  ' + bits.join(' · ');
}

function fmtBoardCard(c: BoardCard): string {
  const bits = [c.name, c.column];
  if (c.country) bits.push(c.country);
  if (c.magnification.length) bits.push(c.magnification.join('/'));
  if (typeof c.value === 'number' && c.value > 0) bits.push(`£${c.value.toLocaleString()}`);
  if (c.notes) bits.push(`"${c.notes.slice(0, 80)}"`);
  return '  ' + bits.join(' · ');
}

// ============================================================================
// Executor
// ============================================================================

type ToolInput = Record<string, unknown>;

export async function executeAgentTool(name: string, rawInput: unknown, now: Date): Promise<string> {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as ToolInput;

  switch (name) {
    // ------------------------------------------------------------------
    case 'list_deals': {
      const stage = typeof input.stage === 'string' ? input.stage : undefined;
      const category = typeof input.category === 'string' ? input.category : undefined;
      const limit = Math.min(typeof input.limit === 'number' ? input.limit : 40, MAX_ROWS);
      const period = parseMonth(typeof input.month === 'string' ? input.month : undefined, now);

      let deals = await fetchAllJamesDeals();
      if (stage) {
        deals = deals.filter(d => d.Stage === stage);
      } else if (category && DEAL_CATEGORIES[category]) {
        deals = deals.filter(d => DEAL_CATEGORIES[category].includes(d.Stage));
      }
      if (period) deals = deals.filter(d => inMonth(d.Modified_Time, period.year, period.month));

      if (deals.length === 0) {
        return `No deals match${stage ? ` stage "${stage}"` : category ? ` category "${category}"` : ''}${period ? ' in that month' : ''}.`;
      }

      // Newest activity first — that is what James cares about when chasing.
      deals.sort((a, b) => new Date(b.Modified_Time).getTime() - new Date(a.Modified_Time).getTime());
      const shown = deals.slice(0, limit);
      const value = deals.reduce((sum, d) => sum + getDealValue(d), 0);

      const byStage: Record<string, number> = {};
      for (const d of deals) byStage[d.Stage] = (byStage[d.Stage] || 0) + 1;

      return [
        `${deals.length} deal(s)${value > 0 ? `, total £${value.toLocaleString()}` : ''}.`,
        `By stage: ${Object.entries(byStage).map(([s, c]) => `${s} ${c}`).join(' | ')}`,
        shown.map(fmtDeal).join('\n'),
        deals.length > shown.length ? `  ...plus ${deals.length - shown.length} more not listed` : '',
      ].filter(Boolean).join('\n');
    }

    // ------------------------------------------------------------------
    case 'list_leads': {
      const status = typeof input.status === 'string' ? input.status : undefined;
      const category = typeof input.category === 'string' ? input.category : undefined;
      const limit = Math.min(typeof input.limit === 'number' ? input.limit : 40, MAX_ROWS);
      const period = parseMonth(typeof input.month === 'string' ? input.month : undefined, now);

      let leads = await fetchAllJamesLeads();
      if (status) {
        leads = leads.filter(l => l.Status === status);
      } else if (category && LEAD_CATEGORIES[category]) {
        leads = leads.filter(l => categorizeLeadStatus(l.Status) === category);
      }
      if (period) leads = leads.filter(l => inMonth(l.Modified_Time, period.year, period.month));

      if (leads.length === 0) {
        return `No leads match${status ? ` status "${status}"` : category ? ` category "${category}"` : ''}${period ? ' in that month' : ''}.`;
      }

      leads.sort((a, b) => new Date(b.Modified_Time).getTime() - new Date(a.Modified_Time).getTime());
      const shown = leads.slice(0, limit);

      const byStatus: Record<string, number> = {};
      for (const l of leads) { const k = l.Status || 'none'; byStatus[k] = (byStatus[k] || 0) + 1; }

      return [
        `${leads.length} lead(s).`,
        `By status: ${Object.entries(byStatus).map(([s, c]) => `${s} ${c}`).join(' | ')}`,
        shown.map(fmtLead).join('\n'),
        leads.length > shown.length ? `  ...plus ${leads.length - shown.length} more not listed` : '',
      ].filter(Boolean).join('\n');
    }

    // ------------------------------------------------------------------
    case 'query_calendar': {
      const daysBack = typeof input.days_back === 'number' ? input.days_back : undefined;
      const startRaw = typeof input.start_date === 'string' ? input.start_date : undefined;
      const endRaw = typeof input.end_date === 'string' ? input.end_date : undefined;
      const salesOnly = input.sales_calls_only === true;
      const includeList = input.include_list === true;
      const colourInput = typeof input.colour === 'string' ? input.colour : undefined;

      let start: Date, end: Date;
      if (startRaw) {
        start = new Date(`${startRaw}T00:00:00`);
        end = endRaw ? new Date(`${endRaw}T23:59:59`) : new Date(now);
      } else {
        const back = daysBack ?? 30;
        end = new Date(now);
        start = new Date(now.getTime() - back * 86_400_000);
      }
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 'Invalid date range — use days_back, or start_date/end_date as YYYY-MM-DD.';
      }

      let events = await fetchCalendarEvents(start.toISOString(), end.toISOString());
      if (salesOnly) events = events.filter(isSalesCall);

      const rangeLabel = `${start.toLocaleDateString('en-GB')} to ${end.toLocaleDateString('en-GB')}`;

      // Colour breakdown is always reported — if James asks for a colour that
      // isn't used, the honest answer is "you have none, here's what you do have".
      const breakdown: Record<string, number> = {};
      for (const e of events) { const c = e.colour || 'default'; breakdown[c] = (breakdown[c] || 0) + 1; }
      const breakdownLine = Object.entries(breakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c} ${n}`)
        .join(' | ') || 'none';

      let filtered = events;
      let colourNote = '';
      if (colourInput) {
        const names = resolveColourNames(colourInput);
        if (names.length === 0) {
          return `"${colourInput}" is not a Google Calendar colour. Valid: sage, basil, tomato, flamingo, peacock, blueberry, lavender, grape, banana, tangerine, graphite (or plain words green/red/blue/purple/yellow/orange/grey).\nColours actually in use ${rangeLabel}: ${breakdownLine}`;
        }
        filtered = events.filter(e => names.includes(e.colour || ''));
        colourNote = ` matching "${colourInput}" (${names.join(' or ')})`;
      }

      const cancelled = filtered.filter(isCancelled).length;
      const lines = [
        `${filtered.length} event(s)${colourNote}${salesOnly ? ' (sales calls only)' : ''} between ${rangeLabel}.`,
        `Total events in range (all colours): ${events.length}`,
        `Colour breakdown: ${breakdownLine}`,
      ];
      if (cancelled > 0) lines.push(`${cancelled} of the matched events are cancelled.`);
      if (includeList && filtered.length > 0) {
        const shown = filtered.slice(0, MAX_ROWS);
        lines.push(shown.map(fmtEvent).join('\n'));
        if (filtered.length > shown.length) lines.push(`  ...plus ${filtered.length - shown.length} more not listed`);
      }
      return lines.join('\n');
    }

    // ------------------------------------------------------------------
    case 'search_person': {
      const q = typeof input.name === 'string' ? input.name.trim() : '';
      if (!q) return 'No name supplied.';
      const [crm, debriefs] = await Promise.all([
        searchPersonDeep(q).catch((e: unknown) => `Person search failed: ${e instanceof Error ? e.message : 'unknown'}`),
        searchDebriefs(q).catch(() => ''),
      ]);
      return [crm, debriefs ? `\nDEBRIEFS:\n${debriefs}` : ''].filter(Boolean).join('\n');
    }

    // ------------------------------------------------------------------
    case 'search_debriefs': {
      const q = typeof input.query === 'string' ? input.query.trim() : '';
      if (!q) return 'No query supplied.';
      return await searchDebriefs(q);
    }

    // ------------------------------------------------------------------
    case 'get_summary': {
      const report = typeof input.report === 'string' ? input.report : '';
      const period = parseMonth(typeof input.month === 'string' ? input.month : undefined, now)
        ?? { year: now.getFullYear(), month: now.getMonth() };

      switch (report) {
        case 'month_stats':       return await getMonthStats(period.year, period.month);
        case 'pipeline':          return await getPipelineSummaryText();
        case 'manufacturing':     return await getManufacturingStatusText();
        case 'follow_ups':        return await getFollowUpsText();
        case 'lead_sources':      return await getLeadSourceAnalysis();
        case 'no_show_patterns':  return await getNoShowPatterns();
        case 'today_schedule':    return await getTodaySchedule();
        case 'tomorrow_schedule': return await getTomorrowSchedule();
        case 'closing_board': {
          const [active, won, lost] = await Promise.all([activeCards(), wonThisMonth(), lostThisMonth()]);
          const counts = countByColumn(active);
          return [
            `Active: ${active.length} (Interested ${counts.interested} · Quoted ${counts.quoted} · Deciding ${counts.deciding} · Closing ${counts.closing})`,
            `Won this month: ${won.length}${totalValue(won) > 0 ? ` (£${totalValue(won).toLocaleString()})` : ''}`,
            `Lost this month: ${lost.length}`,
            active.length ? '\nACTIVE:\n' + active.map(fmtBoardCard).join('\n') : '',
            won.length ? '\nWON:\n' + won.map(fmtBoardCard).join('\n') : '',
          ].filter(Boolean).join('\n');
        }
        default: return `Unknown report "${report}".`;
      }
    }

    default:
      return `Unknown tool "${name}".`;
  }
}

// Booking-platform helper kept exported so the route can mention it in context
// without pulling the whole calendar module in.
export function summarisePlatforms(events: CalendarEvent[]): string {
  const counts: Record<string, number> = {};
  for (const e of events) { const p = detectBookingPlatform(e); counts[p] = (counts[p] || 0) + 1; }
  return Object.entries(counts).map(([p, n]) => `${p} ${n}`).join(' | ');
}
