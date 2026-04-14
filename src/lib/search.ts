// Deep search utilities for the AI chat assistant
// Uses shared data-engine for consistent numbers

import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, extractMeetingNotes, detectBookingPlatform, hasPrepNotes } from './google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, getLeadPhone, buildEmailMaps, isInMonth } from './zoho-client';
import { getAttentionNeeded, getManufacturingSummary, getPipelineCounts, getConversionStats } from './data-engine';

// ============================================================
// DEEP PERSON SEARCH — CRM + Calendar + Deals combined
// ============================================================

export async function searchPersonDeep(query: string): Promise<string> {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return 'Search query too short.';
  const now = Date.now();
  const sections: string[] = [];

  // Search Zoho Leads
  if (isZohoConfigured()) {
    const leads = await fetchAllJamesLeads();
    const matches = leads.filter(l => l.Full_Name?.toLowerCase().includes(q) || l.Email?.toLowerCase().includes(q));
    if (matches.length > 0) {
      sections.push('CRM LEADS:');
      matches.slice(0, 5).forEach(l => {
        const days = Math.floor((now - new Date(l.Modified_Time).getTime()) / 86400000);
        sections.push(`  ${l.Full_Name} | Stage: ${l.Status || 'No Status'} (${days}d) | Source: ${l.Lead_Source || 'Unknown'} | ${l.Country || '?'}, ${l.City || '?'} | Email: ${l.Email || '?'} | Phone: ${getLeadPhone(l) || '?'} | Created: ${new Date(l.Created_Time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);
      });
    }

    // Search Zoho Deals
    const deals = await fetchAllJamesDeals();
    const dealMatches = deals.filter(d => d.Deal_Name?.toLowerCase().includes(q) || d.Email?.toLowerCase().includes(q));
    if (dealMatches.length > 0) {
      sections.push('ORDERS:');
      dealMatches.slice(0, 5).forEach(d => {
        sections.push(`  ${d.Deal_Name} | Stage: ${d.Stage} | Product: ${d.Refractive_Magnification || '?'} | Light: ${d.Lighting_Selection || '?'} | Value: $${Math.round(getDealValue(d)).toLocaleString()} | Country: ${d.Country || '?'} | Created: ${new Date(d.Created_Time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);
      });
    }
  }

  // Search Calendar (last 3 months)
  try {
    const threeMonthsAgo = new Date(now - 90 * 86400000);
    const events = await fetchCalendarEvents(threeMonthsAgo.toISOString(), new Date().toISOString());
    const calMatches = events.filter(isSalesCall).filter(e => {
      const name = extractLeadName(e).toLowerCase();
      const email = getExternalAttendeeEmail(e).toLowerCase();
      return name.includes(q) || email.includes(q);
    });
    if (calMatches.length > 0) {
      sections.push('CALENDAR HISTORY:');
      calMatches.slice(0, 5).forEach(e => {
        const notes = extractMeetingNotes(e);
        const platform = detectBookingPlatform(e);
        sections.push(`  ${new Date(e.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${extractLeadName(e)} | ${extractPhone(e) || 'no phone'} | ${extractCountry(e) || '?'} | Platform: ${platform} | Attendance: ${notes.attendanceConfirmed === true ? 'Yes' : notes.attendanceConfirmed === false ? 'NO' : '?'}${notes.notes ? ' | Notes: "' + notes.notes.substring(0, 80) + '"' : ''}`);
      });
    }
  } catch { /* calendar unavailable */ }

  return sections.length > 0 ? sections.join('\n') : `No results found for "${query}" in CRM, orders, or calendar.`;
}

// ============================================================
// SCHEDULE
// ============================================================

export async function getTodaySchedule(): Promise<string> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86400000);
  const events = await fetchCalendarEvents(start.toISOString(), end.toISOString());
  const calls = events.filter(isSalesCall);
  if (calls.length === 0) return 'No calls scheduled today.';
  return calls.map(e => {
    const time = new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
    const notes = extractMeetingNotes(e);
    const platform = detectBookingPlatform(e);
    return `${time} — ${extractLeadName(e)} | ${extractPhone(e) || 'no phone'} | ${extractCountry(e) || '?'} | ${platform} | Attendance: ${notes.attendanceConfirmed === true ? 'Yes' : notes.attendanceConfirmed === false ? 'NO' : '?'}${notes.notes ? ' | Notes: "' + notes.notes.substring(0, 60) + '"' : ''}`;
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
    return `${time} — ${extractLeadName(e)} | ${extractPhone(e) || 'no phone'} | ${extractCountry(e) || '?'} | ${detectBookingPlatform(e)}`;
  }).join('\n');
}

// ============================================================
// PIPELINE & MANUFACTURING — uses shared data engine
// ============================================================

export async function getPipelineSummaryText(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const pipeline = getPipelineCounts(leads, deals);
  const mfg = getManufacturingSummary(deals);
  const lines = [
    'LEADS (recent, filtered):',
    ...Object.entries(pipeline.leadStages).sort(([,a],[,b]) => b - a).map(([s, c]) => `  ${s}: ${c}`),
    `  Active leads: ${pipeline.activeLeads}`,
    '\nACTIVE ORDERS:',
    ...Object.entries(pipeline.dealStages).sort(([,a],[,b]) => b - a).map(([s, c]) => `  ${s}: ${c}`),
    `  Pipeline value: $${Math.round(pipeline.activePipelineValue).toLocaleString()}`,
    `\nMANUFACTURING: ${mfg.total} orders (${mfg.onTrack} on track, ${mfg.approaching} approaching, ${mfg.overdue} overdue)`,
  ];
  return lines.join('\n');
}

export async function getManufacturingStatusText(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const deals = await fetchAllJamesDeals();
  const mfg = getManufacturingSummary(deals);
  if (mfg.total === 0) return 'No orders currently in manufacturing.';
  const lines = [`${mfg.total} orders in manufacturing (${mfg.onTrack} on track, ${mfg.approaching} approaching, ${mfg.overdue} overdue):`];
  const overdue = mfg.orders.filter(o => o.status === 'overdue');
  const approaching = mfg.orders.filter(o => o.status === 'approaching');
  if (overdue.length) { lines.push(`\nOVERDUE (${overdue.length}):`); overdue.slice(0, 10).forEach(o => lines.push(`  ${o.name} — ${o.product} — Wk ${o.weeksElapsed}/${o.targetWeeks} — ${o.country || '?'} — $${Math.round(o.value).toLocaleString()}`)); }
  if (approaching.length) { lines.push(`\nAPPROACHING (${approaching.length}):`); approaching.slice(0, 10).forEach(o => lines.push(`  ${o.name} — ${o.product} — Wk ${o.weeksElapsed}/${o.targetWeeks}`)); }
  lines.push(`\nON TRACK: ${mfg.onTrack}`);
  return lines.join('\n');
}

// ============================================================
// FOLLOW-UPS — uses shared data engine
// ============================================================

export async function getFollowUpsText(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const items = getAttentionNeeded(leads, deals);
  if (items.length === 0) return 'No urgent follow-ups right now.';
  return `${items.length} items needing attention:\n` + items.slice(0, 20).map(f =>
    `[${f.priority.toUpperCase()}] ${f.name} — ${f.stage} — ${f.days}d — ${f.action}${f.phone ? ' | ' + f.phone : ''}`
  ).join('\n');
}

// ============================================================
// LEAD SOURCE ANALYSIS
// ============================================================

export async function getLeadSourceAnalysis(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
  const { dealsByEmail } = buildEmailMaps(leads, deals);

  const sources: Record<string, { leads: number; ordered: number }> = {};
  leads.forEach(l => {
    const src = l.Lead_Source || 'Unknown';
    if (!sources[src]) sources[src] = { leads: 0, ordered: 0 };
    sources[src].leads++;
    if (l.Email && dealsByEmail.has(l.Email.toLowerCase())) sources[src].ordered++;
  });

  const lines = ['LEAD SOURCE ANALYSIS:'];
  Object.entries(sources).sort(([,a],[,b]) => b.leads - a.leads).forEach(([src, d]) => {
    const rate = d.leads > 0 ? Math.round((d.ordered / d.leads) * 100) : 0;
    lines.push(`  ${src}: ${d.leads} leads, ${d.ordered} orders (${rate}% conversion)`);
  });
  return lines.join('\n');
}

// ============================================================
// BOOKING PLATFORM ANALYSIS
// ============================================================

export async function getBookingPlatformAnalysis(year: number, month: number): Promise<string> {
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const events = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
  const calls = events.filter(isSalesCall);

  const platforms: Record<string, { count: number; withNotes: number; attendanceYes: number; attendanceNo: number }> = {};
  calls.forEach(e => {
    const p = detectBookingPlatform(e);
    if (!platforms[p]) platforms[p] = { count: 0, withNotes: 0, attendanceYes: 0, attendanceNo: 0 };
    platforms[p].count++;
    if (hasPrepNotes(e)) platforms[p].withNotes++;
    const n = extractMeetingNotes(e);
    if (n.attendanceConfirmed === true) platforms[p].attendanceYes++;
    if (n.attendanceConfirmed === false) platforms[p].attendanceNo++;
  });

  const lines = [`BOOKING PLATFORMS (${mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}):`];
  Object.entries(platforms).sort(([,a],[,b]) => b.count - a.count).forEach(([p, d]) => {
    lines.push(`  ${p}: ${d.count} bookings | ${d.withNotes} with prep notes | Attendance: ${d.attendanceYes} Yes, ${d.attendanceNo} No`);
  });
  return lines.join('\n');
}

// ============================================================
// DIRECT BOOKINGS (calendar only, no CRM)
// ============================================================

export async function getDirectBookingsText(year: number, month: number): Promise<string> {
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const events = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
  const calls = events.filter(isSalesCall);

  if (!isZohoConfigured()) return 'Zoho CRM not connected — cannot determine direct bookings.';
  const leads = await fetchAllJamesLeads();
  const deals = await fetchAllJamesDeals();
  const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

  const direct = calls.filter(e => {
    const email = getExternalAttendeeEmail(e).toLowerCase();
    return email && !leadsByEmail.has(email) && !dealsByEmail.has(email);
  });

  if (direct.length === 0) return 'All bookings this month have matching CRM records.';
  const lines = [`${direct.length} DIRECT BOOKINGS (no CRM record):`];
  direct.forEach(e => {
    lines.push(`  ${extractLeadName(e)} | ${getExternalAttendeeEmail(e)} | ${extractPhone(e) || 'no phone'} | ${new Date(e.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} | ${detectBookingPlatform(e)}`);
  });
  return lines.join('\n');
}

// ============================================================
// MONTH COMPARISON
// ============================================================

export async function getMonthComparison(year1: number, month1: number, year2: number, month2: number): Promise<string> {
  const label1 = new Date(year1, month1, 1).toLocaleDateString('en-GB', { month: 'long' });
  const label2 = new Date(year2, month2, 1).toLocaleDateString('en-GB', { month: 'long' });

  const [events1, events2] = await Promise.all([
    fetchCalendarEvents(new Date(year1, month1, 1).toISOString(), new Date(year1, month1 + 1, 0, 23, 59, 59).toISOString()),
    fetchCalendarEvents(new Date(year2, month2, 1).toISOString(), new Date(year2, month2 + 1, 0, 23, 59, 59).toISOString()),
  ]);
  const calls1 = events1.filter(isSalesCall).length;
  const calls2 = events2.filter(isSalesCall).length;

  const lines = [`${label1} vs ${label2}:`, `  Calls: ${calls1} vs ${calls2}`];

  if (isZohoConfigured()) {
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const newLeads1 = leads.filter(l => isInMonth(l.Created_Time, year1, month1)).length;
    const newLeads2 = leads.filter(l => isInMonth(l.Created_Time, year2, month2)).length;
    const orders1 = deals.filter(d => isInMonth(d.Created_Time, year1, month1)).length;
    const orders2 = deals.filter(d => isInMonth(d.Created_Time, year2, month2)).length;
    lines.push(`  New leads: ${newLeads1} vs ${newLeads2}`);
    lines.push(`  Orders: ${orders1} vs ${orders2}`);
  }

  return lines.join('\n');
}

// ============================================================
// MONTH STATS
// ============================================================

export async function getMonthStats(year: number, month: number): Promise<string> {
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const label = mStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const events = await fetchCalendarEvents(mStart.toISOString(), mEnd.toISOString());
  const calls = events.filter(isSalesCall);

  // Platform breakdown
  const platforms: Record<string, number> = {};
  calls.forEach(e => { const p = detectBookingPlatform(e); platforms[p] = (platforms[p] || 0) + 1; });

  const lines = [`${label}: ${calls.length} sales calls`, `  Platforms: ${Object.entries(platforms).map(([p,c]) => `${p}: ${c}`).join(', ')}`];

  if (isZohoConfigured()) {
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);
    const calEmails = calls.map(e => ({ email: getExternalAttendeeEmail(e) }));
    const conv = getConversionStats(calEmails, leadsByEmail, dealsByEmail);
    const newLeads = leads.filter(l => isInMonth(l.Created_Time, year, month)).length;
    const noShows = leads.filter(l => l.Status === 'No Show' && isInMonth(l.Modified_Time, year, month)).length;
    lines.push(`  New leads: ${newLeads}`);
    lines.push(`  Conversion: ${conv.convRate}% (${conv.ordered} from ${conv.showedUp} demos)`);
    lines.push(`  No-shows: ${noShows}`);
  }
  return lines.join('\n');
}

// ============================================================
// NO-SHOW PATTERNS
// ============================================================

export async function getNoShowPatterns(): Promise<string> {
  if (!isZohoConfigured()) return 'Zoho CRM not connected.';
  const leads = await fetchAllJamesLeads();
  const noShows = leads.filter(l => l.Status === 'No Show');
  if (noShows.length === 0) return 'No no-shows found.';

  const byCountry: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  noShows.forEach(l => {
    byCountry[l.Country || 'Unknown'] = (byCountry[l.Country || 'Unknown'] || 0) + 1;
    bySource[l.Lead_Source || 'Unknown'] = (bySource[l.Lead_Source || 'Unknown'] || 0) + 1;
  });

  const lines = [`${noShows.length} total no-shows:`, '\nBy Country:'];
  Object.entries(byCountry).sort(([,a],[,b]) => b - a).slice(0, 8).forEach(([c, n]) => lines.push(`  ${c}: ${n}`));
  lines.push('\nBy Lead Source:');
  Object.entries(bySource).sort(([,a],[,b]) => b - a).slice(0, 8).forEach(([s, n]) => lines.push(`  ${s}: ${n}`));
  return lines.join('\n');
}
