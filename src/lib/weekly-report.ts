// Shared weekly report generation + email sending

import { fetchCalendarEvents, isSalesCall, extractLeadName, getExternalAttendeeEmail, extractPhone, extractCountry, detectBookingPlatform, extractMeetingNotes } from './google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, buildEmailMaps, getProductType } from './zoho-client';

function weekRange(dateStr?: string): { start: Date; end: Date; label: string } {
  const ref = dateStr ? new Date(dateStr) : new Date();
  const day = ref.getDay();
  const diffToMon = day === 0 ? 6 : day - 1;
  const start = new Date(ref);
  start.setDate(start.getDate() - diffToMon - 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

function pctChange(curr: number, prev: number) {
  return prev > 0 ? `${curr >= prev ? '+' : ''}${Math.round(((curr - prev) / prev) * 100)}%` : 'new';
}

export async function generateWeeklyReport(weekParam?: string) {
  const { start, end, label } = weekRange(weekParam);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 7);

  const [weekEvents, prevWeekEvents] = await Promise.all([
    fetchCalendarEvents(start.toISOString(), end.toISOString()),
    fetchCalendarEvents(prevStart.toISOString(), prevEnd.toISOString()),
  ]);
  const calls = weekEvents.filter(isSalesCall);
  const prevCalls = prevWeekEvents.filter(isSalesCall);

  const enriched = calls.map(e => {
    const notes = extractMeetingNotes(e);
    return { name: extractLeadName(e), email: getExternalAttendeeEmail(e), phone: extractPhone(e), country: extractCountry(e), platform: detectBookingPlatform(e), date: e.start, attendance: notes.attendanceConfirmed, prepNotes: notes.notes };
  });

  const byPlatform: Record<string, number> = {};
  enriched.forEach(c => { byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1; });
  const byCountry: Record<string, number> = {};
  enriched.forEach(c => { byCountry[c.country || 'Unknown'] = (byCountry[c.country || 'Unknown'] || 0) + 1; });

  let newLeadsCount = 0, newOrdersCount = 0, noShowsCount = 0, directCount = 0, convRate = 0, prevNewLeads = 0, prevOrders = 0;
  let noShowsList: string[] = [];
  let ordersList: string[] = [];
  let demosList: string[] = [];
  let directList: string[] = [];
  const bySource: Record<string, { leads: number; demos: number; orders: number }> = {};

  if (isZohoConfigured()) {
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

    const newLeads = leads.filter(l => { const d = new Date(l.Created_Time); return d >= start && d <= end; });
    const newOrders = deals.filter(d => { const dt = new Date(d.Created_Time); return dt >= start && dt <= end; });
    const noShows = leads.filter(l => l.Status === 'No Show' && new Date(l.Modified_Time) >= start && new Date(l.Modified_Time) <= end);
    newLeadsCount = newLeads.length;
    newOrdersCount = newOrders.length;
    noShowsCount = noShows.length;
    prevNewLeads = leads.filter(l => { const d = new Date(l.Created_Time); return d >= prevStart && d <= prevEnd; }).length;
    prevOrders = deals.filter(d => { const dt = new Date(d.Created_Time); return dt >= prevStart && dt <= prevEnd; }).length;

    // Source breakdown
    newLeads.forEach(l => { const s = l.Lead_Source || 'Unknown'; if (!bySource[s]) bySource[s] = { leads: 0, demos: 0, orders: 0 }; bySource[s].leads++; });
    enriched.forEach(c => { const email = c.email?.toLowerCase() || ''; const lead = leadsByEmail.get(email); const s = lead?.Lead_Source || 'Unknown'; if (!bySource[s]) bySource[s] = { leads: 0, demos: 0, orders: 0 }; bySource[s].demos++; });
    newOrders.forEach(d => { const email = d.Email?.toLowerCase() || ''; const lead = leadsByEmail.get(email); const s = lead?.Lead_Source || 'Unknown'; if (!bySource[s]) bySource[s] = { leads: 0, demos: 0, orders: 0 }; bySource[s].orders++; });

    // Demos with status
    demosList = enriched.map(c => {
      const email = c.email?.toLowerCase() || '';
      const deal = dealsByEmail.get(email);
      const lead = leadsByEmail.get(email);
      const status = deal ? `Ordered ($${Math.round(getDealValue(deal)).toLocaleString()})` : (!lead && !deal) ? 'Not in CRM' : 'Pending';
      return `${c.name} — ${c.country || '?'} — ${lead?.Lead_Source || '?'} — ${c.platform} — ${status}`;
    });

    noShowsList = noShows.map(l => `${l.Full_Name} — ${l.Country || '?'} — ${l.Lead_Source || '?'}`);
    ordersList = newOrders.map(d => `${d.Deal_Name} — ${d.Country || '?'} — ${getProductType(d)} — $${Math.round(getDealValue(d)).toLocaleString()}`);

    const directBookings = enriched.filter(c => { const email = c.email?.toLowerCase() || ''; return email && !leadsByEmail.has(email) && !dealsByEmail.has(email); });
    directCount = directBookings.length;
    directList = directBookings.map(b => `${b.name} — ${b.email} — ${b.phone || '?'} — ${b.platform} — ${new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);

    const ordered = enriched.filter(c => { const email = c.email?.toLowerCase() || ''; return dealsByEmail.has(email); }).length;
    convRate = enriched.length > 0 ? Math.round((ordered / enriched.length) * 100) : 0;
  }

  // Build email
  const lines: string[] = [];
  lines.push(`BRYANT DENTAL WEEKLY — ${label}`);
  lines.push('');
  lines.push('SNAPSHOT');
  lines.push(`Leads: ${newLeadsCount} (vs ${prevNewLeads} last week ${pctChange(newLeadsCount, prevNewLeads)}) | Demos: ${enriched.length} (no-show ${noShowsCount}) | Orders: ${newOrdersCount} (vs ${prevOrders} ${pctChange(newOrdersCount, prevOrders)}) | Conv: ${convRate}%`);

  const srcEntries = Object.entries(bySource).filter(([,v]) => v.leads > 0 || v.demos > 0).sort(([,a],[,b]) => (b.leads + b.demos) - (a.leads + a.demos));
  if (srcEntries.length > 0) {
    lines.push(''); lines.push('BY SOURCE');
    srcEntries.slice(0, 6).forEach(([s, d]) => { const r = d.demos > 0 ? Math.round((d.orders / d.demos) * 100) : 0; lines.push(`${s}: ${d.leads} leads, ${d.demos} demos, ${d.orders} orders (${r}%)`); });
  }
  if (Object.keys(byPlatform).length > 0) {
    lines.push(''); lines.push('BY PLATFORM');
    Object.entries(byPlatform).forEach(([p, c]) => lines.push(`${p}: ${c} booked`));
  }
  if (demosList.length > 0) { lines.push(''); lines.push(`COMPLETED DEMOS (${demosList.length})`); demosList.slice(0, 20).forEach(l => lines.push(l)); }
  if (noShowsList.length > 0) { lines.push(''); lines.push(`NO SHOWS (${noShowsCount})`); noShowsList.forEach(l => lines.push(l)); }
  if (ordersList.length > 0) { lines.push(''); lines.push(`NEW ORDERS (${newOrdersCount})`); ordersList.slice(0, 15).forEach(l => lines.push(l)); }
  if (directList.length > 0) { lines.push(''); lines.push(`NOT IN CRM (${directCount})`); directList.forEach(l => lines.push(l)); }
  const topCountries = Object.entries(byCountry).sort(([,a],[,b]) => b - a).slice(0, 5);
  if (topCountries.length > 0) { lines.push(''); lines.push(`TOP COUNTRIES: ${topCountries.map(([c, n]) => `${c} ${n}`).join(' | ')}`); }
  lines.push(`vs last week: leads ${pctChange(newLeadsCount, prevNewLeads)}, demos ${pctChange(enriched.length, prevCalls.length)}, orders ${pctChange(newOrdersCount, prevOrders)}`);

  const subject = `BD Weekly — ${label} | ${newLeadsCount} Leads | ${enriched.length} Demos | ${newOrdersCount} Orders`;
  return { week: label, subject, body: lines.join('\n'), data: { calls: enriched.length, newLeads: newLeadsCount, orders: newOrdersCount, noShows: noShowsCount, directBookings: directCount, convRate } };
}

export async function sendGmailEmail(to: string, cc: string, subject: string, body: string): Promise<boolean> {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) { console.error('[Gmail] Token error:', tokenData); return false; }

    const mime = [`To: ${to}`, `Cc: ${cc}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
    const encoded = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    const sendRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });
    const sendData = await sendRes.json();
    if (sendData.error) { console.error('[Gmail] Send error:', sendData.error); return false; }
    console.log('[Gmail] Sent, ID:', sendData.id);
    return true;
  } catch (err) { console.error('[Gmail]', err); return false; }
}
