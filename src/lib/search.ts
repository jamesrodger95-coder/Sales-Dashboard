// Search utilities for the AI chat assistant
// Searches across Google Calendar and Zoho CRM

import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry } from './google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, getLeadPhone, getMfgStatus } from './zoho-client';

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

  // Search calendar (last 3 months)
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

  // Search Zoho leads
  if (isZohoConfigured()) {
    try {
      const leads = await fetchAllJamesLeads();
      leads.forEach(l => {
        if (l.Full_Name?.toLowerCase().includes(q)) {
          const days = Math.floor((now - new Date(l.Modified_Time).getTime()) / 86400000);
          results.push({
            name: l.Full_Name, email: l.Email, phone: getLeadPhone(l),
            country: l.Country, source: 'zoho_lead', stage: l.Status || 'No Status', days,
            extra: `Lead: ${l.Status || 'No Status'} (${days}d)`,
          });
        }
      });

      // Search Zoho deals
      const deals = await fetchAllJamesDeals();
      deals.forEach(d => {
        if (d.Deal_Name?.toLowerCase().includes(q)) {
          results.push({
            name: d.Deal_Name, email: d.Email, phone: d.Phone,
            country: d.Country, source: 'zoho_deal', stage: d.Stage, value: getDealValue(d),
            extra: `Order: ${d.Stage} ($${Math.round(getDealValue(d)).toLocaleString()})`,
          });
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

export async function getPipelineSummary(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const now = Date.now();
  const D30 = 30 * 86400000;

  // Recent leads by stage
  const stages: Record<string, number> = {};
  leads.filter(l => (now - new Date(l.Modified_Time).getTime()) < D30).forEach(l => {
    const s = l.Status || 'No Status';
    stages[s] = (stages[s] || 0) + 1;
  });

  // Active deals
  const active = ['Awaiting Measurements', 'Measurements Final Checks', 'Measurement Issues', 'In Manufacturing', 'Order Assembled', 'Order Ready to Send', 'Address Confirmed'];
  const dealCounts: Record<string, number> = {};
  deals.filter(d => active.includes(d.Stage)).forEach(d => { dealCounts[d.Stage] = (dealCounts[d.Stage] || 0) + 1; });

  const lines = ['LEADS (last 30 days):'];
  Object.entries(stages).sort(([,a],[,b]) => b - a).forEach(([s, c]) => lines.push(`  ${s}: ${c}`));
  lines.push('\nACTIVE ORDERS:');
  Object.entries(dealCounts).sort(([,a],[,b]) => b - a).forEach(([s, c]) => lines.push(`  ${s}: ${c}`));
  return lines.join('\n');
}

export async function getManufacturingStatus(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const deals = await fetchAllJamesDeals();
  const inMfg = deals.filter(d => d.Stage === 'In Manufacturing');
  if (inMfg.length === 0) return 'No orders currently in manufacturing.';

  const lines = [`${inMfg.length} orders in manufacturing:`];
  const overdue: string[] = [], approaching: string[] = [], onTrack: string[] = [];
  inMfg.forEach(d => {
    const m = getMfgStatus(d);
    const line = `${d.Deal_Name} — ${m.product} — Wk ${m.weeksElapsed}/${m.targetWeeks} — ${d.Country || '?'}`;
    if (m.status === 'overdue') overdue.push(line);
    else if (m.status === 'approaching') approaching.push(line);
    else onTrack.push(line);
  });

  if (overdue.length) { lines.push(`\nOVERDUE (${overdue.length}):`); overdue.slice(0, 10).forEach(l => lines.push(`  ${l}`)); }
  if (approaching.length) { lines.push(`\nAPPROACHING (${approaching.length}):`); approaching.slice(0, 10).forEach(l => lines.push(`  ${l}`)); }
  lines.push(`\nON TRACK: ${onTrack.length}`);
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
    const { buildEmailMaps } = await import('./zoho-client');
    const { dealsByEmail } = buildEmailMaps(leads, deals);

    let ordered = 0, demoDone = 0;
    calls.forEach(e => {
      const email = getExternalAttendeeEmail(e).toLowerCase();
      if (dealsByEmail.has(email)) ordered++;
      const lead = leads.find(l => l.Email?.toLowerCase() === email);
      if (lead?.Status === 'Virtual Demo Completed' || lead?.Status === 'Demo Completed') demoDone++;
    });
    const showedUp = ordered + demoDone;
    const convRate = showedUp > 0 ? Math.round((ordered / showedUp) * 100) : 0;
    lines.push(`Ordered: ${ordered}, Demo Done: ${demoDone}`);
    lines.push(`Conversion rate: ${convRate}% (${ordered} from ${showedUp} demos)`);
  }

  return lines.join('\n');
}

export async function getFollowUps(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const now = Date.now();
  const items: string[] = [];

  leads.forEach(l => {
    const days = Math.floor((now - new Date(l.Modified_Time).getTime()) / 86400000);
    if ((!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted') && days > 1 && days <= 14) {
      items.push(`[RED] ${l.Full_Name} — Registered ${days}d ago, ${l.Country || '?'} — contact ASAP`);
    } else if (l.Status === 'No Show' && days <= 14) {
      items.push(`[RED] ${l.Full_Name} — No Show ${days}d ago — rebook demo`);
    } else if ((l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && days > 7 && days <= 30) {
      items.push(`[AMBER] ${l.Full_Name} — Demo done ${days}d ago — follow up`);
    }
  });

  deals.forEach(d => {
    const days = Math.floor((now - new Date(d.Modified_Time).getTime()) / 86400000);
    if (d.Stage === 'Awaiting Measurements' && days > 10) {
      items.push(`[RED] ${d.Deal_Name} — Awaiting measurements ${days}d — chase`);
    }
    if (d.Stage === 'In Manufacturing') {
      const m = getMfgStatus(d);
      if (m.status === 'overdue') items.push(`[RED] ${d.Deal_Name} — ${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks} — overdue`);
    }
  });

  return items.length > 0 ? items.slice(0, 15).join('\n') : 'No urgent follow-ups right now.';
}
