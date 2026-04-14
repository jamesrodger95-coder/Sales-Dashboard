// Weekly report generation + email sending
// ALL ASCII, NO NAMES, NUMBERS ONLY

import { fetchCalendarEvents, isSalesCall, isCancelled, getExternalAttendeeEmail, detectBookingPlatform } from './google-calendar';
import { fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured, getDealValue, buildEmailMaps, getProductType } from './zoho-client';

// Clean source names for the email
function cleanSource(raw: string | null): string {
  if (!raw || raw === '-None-') return 'Unknown';
  const map: Record<string, string> = {
    'CAL': 'Cal.com', 'website_pop-up': 'Website Pop-up', 'websitepopup': 'Website Pop-up',
    'InstagramBio': 'Instagram', 'GeorgeInsta': 'Instagram', 'PH lead form': 'PH Lead Form',
    'pdnps': 'Other', 'MTSilver_Email1': 'Email Campaign', 'EuroLeads': 'Euro Leads',
    'Employee Referral': 'Referral', 'External Referral': 'Referral',
  };
  return map[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function weekRange(dateStr?: string) {
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
  return { start, end, label: `${fmt(start)} - ${fmt(end)}` }; // Plain hyphen, not em dash
}

function pct(curr: number, prev: number) {
  return prev > 0 ? `${curr >= prev ? '+' : ''}${Math.round(((curr - prev) / prev) * 100)}%` : 'n/a';
}

export async function generateWeeklyReport(weekParam?: string) {
  const { start, end, label } = weekRange(weekParam);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 7);

  // Calendar data
  const [weekEvents, prevWeekEvents] = await Promise.all([
    fetchCalendarEvents(start.toISOString(), end.toISOString()),
    fetchCalendarEvents(prevStart.toISOString(), prevEnd.toISOString()),
  ]);
  const calls = weekEvents.filter(isSalesCall);
  const cancelled = weekEvents.filter(isCancelled);
  const prevCalls = prevWeekEvents.filter(isSalesCall);

  // Enrich with platform
  const enriched = calls.map(e => ({
    email: getExternalAttendeeEmail(e), platform: detectBookingPlatform(e), date: e.start,
  }));

  // Platform counts
  const platformCounts: Record<string, { booked: number; completed: number; noShow: number }> = {};
  enriched.forEach(c => {
    if (!platformCounts[c.platform]) platformCounts[c.platform] = { booked: 0, completed: 0, noShow: 0 };
    platformCounts[c.platform].booked++;
  });

  // Zoho
  let newLeadsCount = 0, newOrdersCount = 0, noShowsThisWeek = 0, directCount = 0, prevNewLeads = 0, prevOrders = 0;
  let totalOrderValue = 0;
  const leadSourceCounts: Record<string, number> = {};
  const demoSourceCounts: Record<string, { completed: number; noShow: number }> = {};
  const orderProductCounts: Record<string, { count: number; value: number }> = {};
  let rollingConvRate = 0;

  if (isZohoConfigured()) {
    const [leads, deals] = await Promise.all([fetchAllJamesLeads(), fetchAllJamesDeals()]);
    const { leadsByEmail, dealsByEmail } = buildEmailMaps(leads, deals);

    // New leads this week
    const newLeads = leads.filter(l => { const d = new Date(l.Created_Time); return d >= start && d <= end; });
    newLeadsCount = newLeads.length;
    prevNewLeads = leads.filter(l => { const d = new Date(l.Created_Time); return d >= prevStart && d <= prevEnd; }).length;

    // Lead source breakdown
    newLeads.forEach(l => { const s = cleanSource(l.Lead_Source); leadSourceCounts[s] = (leadSourceCounts[s] || 0) + 1; });

    // New orders this week
    const newOrders = deals.filter(d => { const dt = new Date(d.Created_Time); return dt >= start && dt <= end; });
    newOrdersCount = newOrders.length;
    totalOrderValue = newOrders.reduce((s, d) => s + getDealValue(d), 0);
    prevOrders = deals.filter(d => { const dt = new Date(d.Created_Time); return dt >= prevStart && dt <= prevEnd; }).length;

    // Order product breakdown
    newOrders.forEach(d => {
      const p = getProductType(d);
      if (!orderProductCounts[p]) orderProductCounts[p] = { count: 0, value: 0 };
      orderProductCounts[p].count++;
      orderProductCounts[p].value += getDealValue(d);
    });

    // No-shows: calendar events THIS WEEK where the Zoho lead is at No Show
    // Only count if the calendar event was booked for this week
    noShowsThisWeek = 0;
    enriched.forEach(c => {
      const email = c.email?.toLowerCase() || '';
      if (!email) return;
      const lead = leadsByEmail.get(email);
      if (lead?.Status === 'No Show') {
        noShowsThisWeek++;
        // Track by source and platform
        const src = cleanSource(lead.Lead_Source);
        if (!demoSourceCounts[src]) demoSourceCounts[src] = { completed: 0, noShow: 0 };
        demoSourceCounts[src].noShow++;
        if (platformCounts[c.platform]) platformCounts[c.platform].noShow++;
      } else {
        // Completed (showed up)
        if (platformCounts[c.platform]) platformCounts[c.platform].completed++;
        const lead2 = leadsByEmail.get(email);
        const src = cleanSource(lead2?.Lead_Source || null);
        if (!demoSourceCounts[src]) demoSourceCounts[src] = { completed: 0, noShow: 0 };
        demoSourceCounts[src].completed++;
      }
    });

    // Direct bookings (no CRM record)
    directCount = enriched.filter(c => {
      const email = c.email?.toLowerCase() || '';
      return email && !leadsByEmail.has(email) && !dealsByEmail.has(email);
    }).length;

    // Rolling 60-day conversion
    const sixtyDaysAgo = new Date(end.getTime() - 60 * 86400000);
    const sixtyEvents = await fetchCalendarEvents(sixtyDaysAgo.toISOString(), end.toISOString());
    const sixtyCalls = sixtyEvents.filter(isSalesCall);
    let r60ordered = 0, r60showed = 0;
    sixtyCalls.forEach(e => {
      const email = getExternalAttendeeEmail(e).toLowerCase();
      if (!email) return;
      if (dealsByEmail.has(email)) { r60ordered++; r60showed++; }
      else { const lead = leadsByEmail.get(email); if (lead?.Status === 'Virtual Demo Completed' || lead?.Status === 'Demo Completed') r60showed++; }
    });
    rollingConvRate = r60showed > 0 ? Math.round((r60ordered / r60showed) * 100) : 0;
  }

  const completed = enriched.length - noShowsThisWeek;
  const showRate = enriched.length > 0 ? Math.round((completed / enriched.length) * 100) : 0;
  const weeklyConv = completed > 0 ? Math.round((newOrdersCount / completed) * 100) : 0;

  // Build email body — ALL ASCII, NO NAMES
  const L: string[] = [];
  L.push(`BRYANT DENTAL WEEKLY - ${label}`);
  L.push('');
  L.push('SNAPSHOT');
  L.push(`Leads: ${newLeadsCount} (vs ${prevNewLeads} last week, ${pct(newLeadsCount, prevNewLeads)})`);
  L.push(`Booked: ${enriched.length} = Completed ${completed} + No-show ${noShowsThisWeek} + Cancelled ${cancelled.length}`);
  L.push(`Orders: ${newOrdersCount} (value: $${Math.round(totalOrderValue).toLocaleString()})`);
  L.push(`Show rate: ${showRate}% | Weekly conv: ${weeklyConv}% | Rolling 60-day conv: ${rollingConvRate}%`);

  // Leads by source
  if (Object.keys(leadSourceCounts).length > 0) {
    L.push('');
    L.push('LEADS BY SOURCE');
    const total = newLeadsCount || 1;
    Object.entries(leadSourceCounts).sort(([,a],[,b]) => b - a).slice(0, 6).forEach(([s, c]) => {
      L.push(`${s}: ${c} leads (${Math.round((c / total) * 100)}%)`);
    });
  }

  // Bookings by platform
  if (Object.keys(platformCounts).length > 0) {
    L.push('');
    L.push('BOOKINGS BY PLATFORM');
    Object.entries(platformCounts).forEach(([p, d]) => {
      const sr = d.booked > 0 ? Math.round((d.completed / d.booked) * 100) : 0;
      L.push(`${p}: ${d.booked} booked, ${d.completed} completed, ${sr}% show rate`);
    });
  }

  // Demos by source
  const srcWithDemos = Object.entries(demoSourceCounts).filter(([,v]) => v.completed + v.noShow > 0);
  if (srcWithDemos.length > 0) {
    L.push('');
    L.push('DEMOS BY SOURCE');
    srcWithDemos.sort(([,a],[,b]) => (b.completed + b.noShow) - (a.completed + a.noShow)).slice(0, 6).forEach(([s, d]) => {
      L.push(`${s}: ${d.completed} completed, ${d.noShow} no-show`);
    });
  }

  // Orders by product
  if (Object.keys(orderProductCounts).length > 0) {
    L.push('');
    L.push('ORDERS BY PRODUCT');
    Object.entries(orderProductCounts).forEach(([p, d]) => {
      L.push(`${p}: ${d.count} orders, $${Math.round(d.value).toLocaleString()}`);
    });
  }

  // Funnel leaks
  if (directCount > 0) {
    L.push('');
    L.push(`FUNNEL LEAKS: ${directCount} bookings not in CRM (booked via Calendly/Cal but no Zoho record)`);
  }

  // Comparison + best source
  L.push('');
  L.push(`vs last week: leads ${pct(newLeadsCount, prevNewLeads)}, demos ${pct(enriched.length, prevCalls.length)}, orders ${pct(newOrdersCount, prevOrders)}`);
  if (rollingConvRate > 0) L.push(`Rolling 60-day conv: ${rollingConvRate}%`);

  const subject = `BD Weekly - ${label} | ${newLeadsCount} Leads | ${enriched.length} Demos | ${newOrdersCount} Orders`;
  const body = L.join('\n');

  return { week: label, subject, body, data: {
    calls: enriched.length, completed, newLeads: newLeadsCount, orders: newOrdersCount,
    noShows: noShowsThisWeek, cancelled: cancelled.length, directBookings: directCount,
    showRate, weeklyConv, rollingConvRate, totalOrderValue: Math.round(totalOrderValue),
    prevCalls: prevCalls.length, prevLeads: prevNewLeads, prevOrders,
  }};
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

    // Plain ASCII subject, UTF-8 body
    const asciiSubject = subject.replace(/[^\x20-\x7E]/g, '-');
    const mime = [
      `To: ${to}`, `Cc: ${cc}`,
      `Subject: ${asciiSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body, 'utf-8').toString('base64'),
    ].join('\r\n');

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
