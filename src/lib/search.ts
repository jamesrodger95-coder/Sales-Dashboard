// Search utilities for the AI chat assistant
// Uses shared data-engine for consistent numbers

import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry } from './google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, getLeadPhone, buildEmailMaps } from './zoho-client';
import { getAttentionNeeded, getManufacturingSummary, getPipelineCounts, getConversionStats } from './data-engine';

export interface SearchResult {
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  source: 'calendar' | 'zoho_lead' | 'zoho_deal';
  stage?: string | null;
  days?: number;
  value?: number;
  date?: string;
  extra?: string;
}

export async function searchByName(name: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const q = name.toLowerCase();
  const now = Date.now();

  try {
    const threeMonthsAgo = new Date(now - 90 * 86400000);
    const events = await fetchCalendarEvents(threeMonthsAgo.toISOString(), new Date().toISOString());
    events.filter(isSalesCall).forEach(e => {
      const eName = extractLeadName(e);
      if (eName.toLowerCase().includes(q)) {
        results.push({
          name: eName, email: getExternalAttendeeEmail(e), phone: extractPhone(e),
          country: extractCountry(e), source: 'calendar', date: e.start,
          extra: `Calendar: ${new Date(e.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        });
      }
    });
  } catch { /* calendar unavailable */ }

  if (isZohoConfigured()) {
    try {
      const leads = await fetchAllJamesLeads();
      leads.forEach(l => {
        if (l.Full_Name?.toLowerCase().includes(q)) {
          const days = Math.floor((now - new Date(l.Modified_Time).getTime()) / 86400000);
          results.push({ name: l.Full_Name, email: l.Email, phone: getLeadPhone(l), country: l.Country, source: 'zoho_lead', stage: l.Status || 'No Status', days, extra: `Lead: ${l.Status || 'No Status'} (${days}d)` });
        }
      });
      const deals = await fetchAllJamesDeals();
      deals.forEach(d => {
        if (d.Deal_Name?.toLowerCase().includes(q)) {
          results.push({ name: d.Deal_Name, email: d.Email, phone: d.Phone, country: d.Country, source: 'zoho_deal', stage: d.Stage, value: getDealValue(d), extra: `Order: ${d.Stage} ($${Math.round(getDealValue(d)).toLocaleString()})` });
        }
      });
    } catch { /* zoho unavailable */ }
  }
  return results;
}

export async function getTodaySchedule(): Promise<string> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86400000);
  const events = await fetchCalendarEvents(start.toISOString(), end.toISOString());
  const calls = events.filter(isSalesCall);
  if (calls.length === 0) return 'No calls scheduled today.';
  return calls.map(e => {
    const time = new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
    return `${time} — ${extractLeadName(e)} | ${extractPhone(e) || 'no phone'} | ${extractCountry(e) || '?'}`;
  }).join('\n');
}

export async function getTomorrowSchedule(): Promise<string> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const end = new Date(start.getTime() + 86400000);
  const events = await fetchCalendarEvents(start.toISOString(), end.toISOString());
  const calls = events.filter(isSalesCall);
  if (calls.length === 0) return 'No calls scheduled tomorrow.';
  return calls.map(e => {
    const time = new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
    return `${time} — ${extractLeadName(e)} | ${extractPhone(e) || 'no phone'} | ${extractCountry(e) || '?'}`;
  }).join('\n');
}

// Uses shared data engine — same numbers as dashboard
export async function getPipelineSummaryText(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const pipeline = getPipelineCounts(leads, deals);

  const lines = ['LEADS (recent, filtered):'];
  Object.entries(pipeline.leadStages).sort(([,a],[,b]) => b - a).forEach(([s, c]) => lines.push(`  ${s}: ${c}`));
  lines.push(`  Active leads: ${pipeline.activeLeads}`);
  lines.push('\nACTIVE ORDERS:');
  Object.entries(pipeline.dealStages).sort(([,a],[,b]) => b - a).forEach(([s, c]) => lines.push(`  ${s}: ${c}`));
  lines.push(`  Pipeline value: $${Math.round(pipeline.activePipelineValue).toLocaleString()}`);
  return lines.join('\n');
}

// Uses shared data engine — same numbers as dashboard
export async function getManufacturingStatusText(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const deals = await fetchAllJamesDeals();
  const mfg = getManufacturingSummary(deals);
  if (mfg.total === 0) return 'No orders currently in manufacturing.';

  const lines = [`${mfg.total} orders in manufacturing (${mfg.onTrack} on track, ${mfg.approaching} approaching, ${mfg.overdue} overdue):`];
  const overdue = mfg.orders.filter(o => o.status === 'overdue');
  const approaching = mfg.orders.filter(o => o.status === 'approaching');
  if (overdue.length) { lines.push(`\nOVERDUE (${overdue.length}):`); overdue.slice(0, 10).forEach(o => lines.push(`  ${o.name} — ${o.product} — Wk ${o.weeksElapsed}/${o.targetWeeks} — ${o.country || '?'}`)); }
  if (approaching.length) { lines.push(`\nAPPROACHING (${approaching.length}):`); approaching.slice(0, 10).forEach(o => lines.push(`  ${o.name} — ${o.product} — Wk ${o.weeksElapsed}/${o.targetWeeks} — ${o.country || '?'}`)); }
  lines.push(`\nON TRACK: ${mfg.onTrack}`);
  return lines.join('\n');
}

export async function getMonthStats(year: number, month: number): Promise<string> {
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const label = mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const events = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
  const calls = events.filter(isSalesCall);
  const lines = [`${label}: ${calls.length} sales calls`];

  if (isZohoConfigured()) {
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);
    const calEmails = calls.map(e => ({ email: getExternalAttendeeEmail(e) }));
    const conv = getConversionStats(calEmails, leadsByEmail, dealsByEmail);
    lines.push(`Ordered: ${conv.ordered}, Demo Done: ${conv.demoDone}`);
    lines.push(`Conversion rate: ${conv.convRate}% (${conv.ordered} from ${conv.showedUp} demos)`);
  }
  return lines.join('\n');
}

// Uses shared data engine — same items as dashboard
export async function getFollowUpsText(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const items = getAttentionNeeded(leads, deals);
  if (items.length === 0) return 'No urgent follow-ups right now.';
  return `${items.length} items needing attention:\n` + items.slice(0, 15).map(f =>
    `[${f.priority.toUpperCase()}] ${f.name} — ${f.stage} — ${f.days}d — ${f.action}`
  ).join('\n');
}
