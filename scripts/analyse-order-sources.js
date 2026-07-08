// Trace active orders back to their Lead Source.
// Stages in scope: Awaiting Measurements, Measurements Final Checks, In Manufacturing.
// Outputs: console tables, JSON, Markdown, PDF.
//
// Run: node scripts/analyse-order-sources.js

const fs = require('fs');
const path = require('path');

// ---------- env loader ----------
function loadEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (n, d) => d > 0 ? (n / d * 100) : 0;
const fmt = (n) => Number.isFinite(n) ? n.toFixed(1) : '0.0';
const truncate = (s, n) => (s && s.length > n) ? s.slice(0, n - 1) + '…' : (s || '');
const money = (n) => `£${Math.round(n).toLocaleString()}`;

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const sep = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const fmtRow = (r) => '| ' + r.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ') + ' |';
  return [fmtRow(headers), sep, ...rows.map(fmtRow)].join('\n');
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Zoho ----------
async function getZohoToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });
  const auth = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';
  const res = await fetch(`${auth}/oauth/v2/token`, { method: 'POST', body });
  const data = await res.json();
  if (!data.access_token) throw new Error('Zoho auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function zohoFetch(token, p) {
  const api = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  const res = await fetch(`${api}${p}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (res.status === 204) return { data: [], info: { more_records: false } };
  const text = await res.text();
  if (!text) return { data: [], info: { more_records: false } };
  try { return JSON.parse(text); } catch { return { data: [], info: { more_records: false } }; }
}

// Fetch every James deal — paginated. Stage filtering happens in JS so we
// catch both "Measurement Final Checks" and "Measurements Final Checks"
// spellings without having to URL-encode complex OR criteria.
async function fetchAllJamesDeals(token) {
  const fields = 'Deal_Name,Stage,Email,Phone,Country,Total_Order_Value,Amount,Contact_Name,Refractive_Magnification,Lighting_Selection,Created_Time,Modified_Time,Owner';
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const data = await zohoFetch(token, `/crm/v6/Deals/search?criteria=(Owner.name:equals:James Rodger)&fields=${fields}&per_page=200&page=${page}`);
    const rows = data.data || [];
    all.push(...rows);
    process.stdout.write(`\r  Deals fetched: ${all.length}...`);
    if (!data.info?.more_records) break;
    await sleep(120);
  }
  process.stdout.write('\n');
  return all;
}

async function fetchAllJamesLeads(token) {
  const fields = 'Full_Name,Email,Mobile,Phone,Country,Lead_Source,Created_Time,Modified_Time,Status';
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const data = await zohoFetch(token, `/crm/v6/Leads/search?criteria=(Owner.name:equals:James Rodger)&fields=${fields}&per_page=200&page=${page}`);
    const rows = data.data || [];
    all.push(...rows);
    process.stdout.write(`\r  Leads fetched: ${all.length}...`);
    if (!data.info?.more_records) break;
    await sleep(120);
  }
  process.stdout.write('\n');
  return all;
}

// Last-resort lookup: when no in-memory match, hit the Zoho Leads search live.
async function liveLeadByEmail(token, email) {
  if (!email) return null;
  const data = await zohoFetch(token, `/crm/v6/Leads/search?email=${encodeURIComponent(email)}&fields=Full_Name,Email,Lead_Source,Country,Created_Time,Status`);
  return (data.data || [])[0] || null;
}

// ---------- analysis ----------
const TARGET_STAGES = new Set([
  'Awaiting Measurements',
  'Measurements Final Checks',
  'Measurement Final Checks',
  'In Manufacturing',
]);

const STAGE_ORDER = [
  'Awaiting Measurements',
  'Measurements Final Checks',
  'Measurement Final Checks',
  'In Manufacturing',
];

const STAGE_LABEL = {
  'Awaiting Measurements': 'Awaiting Meas',
  'Measurements Final Checks': 'Measurement FC',
  'Measurement Final Checks': 'Measurement FC',
  'In Manufacturing': 'Manufacturing',
};

function dealValue(d) {
  const v = d.Total_Order_Value ?? d.Amount;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

// ---------- Claude ----------
async function askClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ============================================================================
// MAIN
// ============================================================================
(async () => {
  const t0 = Date.now();
  console.log('=== Order → Lead Source Analysis ===\n');

  console.log('[1/4] Authenticating...');
  const token = await getZohoToken();

  console.log('[2/4] Fetching Zoho data...');
  const [allLeads, allDeals] = await Promise.all([
    fetchAllJamesLeads(token),
    fetchAllJamesDeals(token),
  ]);

  const activeOrders = allDeals.filter(d => TARGET_STAGES.has(d.Stage));
  console.log(`  Active orders at target stages: ${activeOrders.length} (of ${allDeals.length} total deals)`);

  // Build in-memory lookup maps for cheap matching
  const leadByEmail = new Map();
  for (const l of allLeads) if (l.Email) leadByEmail.set(l.Email.toLowerCase(), l);

  // For name-fallback: build {lowercaseName -> [leads]}
  const leadsByName = new Map();
  for (const l of allLeads) {
    if (!l.Full_Name) continue;
    const k = l.Full_Name.toLowerCase().trim();
    if (!leadsByName.has(k)) leadsByName.set(k, []);
    leadsByName.get(k).push(l);
  }

  // ============================================================
  // STEP 3: Match each order to its originating lead
  // ============================================================
  console.log('[3/4] Tracing orders back to leads...');
  const liveLookupCache = new Map();
  const records = [];

  let matchedEmail = 0, matchedName = 0, matchedLive = 0, unmatched = 0;
  for (const d of activeOrders) {
    const dealEmail = (d.Email || '').toLowerCase();
    const contactName = (d.Contact_Name && d.Contact_Name.name) || d.Deal_Name || '';
    let lead = null;
    let method = null;

    // A: email match against in-memory leads
    if (dealEmail && leadByEmail.has(dealEmail)) {
      lead = leadByEmail.get(dealEmail);
      method = 'email';
      matchedEmail++;
    }
    // B: name fallback
    if (!lead && contactName) {
      const exact = leadsByName.get(contactName.toLowerCase().trim());
      if (exact && exact.length > 0) {
        lead = [...exact].sort((a, b) => (b.Created_Time || '').localeCompare(a.Created_Time || ''))[0];
        method = 'name';
        matchedName++;
      } else {
        // partial / contains match
        const target = contactName.toLowerCase().trim();
        const partial = allLeads.filter(l =>
          l.Full_Name && (l.Full_Name.toLowerCase().includes(target) || target.includes(l.Full_Name.toLowerCase()))
        );
        if (partial.length > 0) {
          lead = partial.sort((a, b) => (b.Created_Time || '').localeCompare(a.Created_Time || ''))[0];
          method = 'name-partial';
          matchedName++;
        }
      }
    }
    // C: live search by email (catches leads outside James's owned set)
    if (!lead && dealEmail) {
      if (liveLookupCache.has(dealEmail)) lead = liveLookupCache.get(dealEmail);
      else {
        try {
          lead = await liveLeadByEmail(token, dealEmail);
          liveLookupCache.set(dealEmail, lead);
          if (lead) { method = 'live-email'; matchedLive++; }
        } catch {}
      }
    }
    if (!lead) unmatched++;

    const value = dealValue(d);
    const leadCreated = lead?.Created_Time || null;
    records.push({
      dealId: d.id,
      dealName: d.Deal_Name || contactName,
      dealStage: d.Stage,
      dealAmount: value,
      dealCreated: d.Created_Time,
      dealEmail: dealEmail || null,
      contactName,
      leadId: lead?.id || null,
      leadSource: lead?.Lead_Source || (lead ? 'Unknown' : null),
      country: lead?.Country || d.Country || null,
      leadCreated,
      daysToConvert: leadCreated && d.Created_Time ? daysBetween(leadCreated, d.Created_Time) : null,
      matchMethod: method || 'unmatched',
    });
  }
  console.log(`  Matched: ${matchedEmail} by email, ${matchedName} by name, ${matchedLive} via live search, ${unmatched} unmatched`);
  console.log('[4/4] Building tables...\n');

  // ============================================================
  // TABLES
  // ============================================================
  // Sort orders by stage order then by amount desc
  const stageRank = (s) => {
    const i = STAGE_ORDER.indexOf(s);
    return i === -1 ? 99 : i;
  };
  records.sort((a, b) => stageRank(a.dealStage) - stageRank(b.dealStage) || b.dealAmount - a.dealAmount);

  // TABLE 1: Every active order with its lead source
  const t1Rows = records.map((r, i) => [
    i + 1,
    truncate(r.dealName, 30),
    STAGE_LABEL[r.dealStage] || r.dealStage,
    money(r.dealAmount),
    truncate(r.country || '?', 16),
    truncate(r.leadSource || '— no lead found', 22),
    r.leadCreated ? new Date(r.leadCreated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?',
    r.daysToConvert != null ? `${r.daysToConvert}d` : '?',
  ]);

  // TABLE 2: Lead Source breakdown
  const bySource = new Map();
  for (const r of records) {
    if (!r.leadSource) continue;
    const k = r.leadSource;
    if (!bySource.has(k)) bySource.set(k, { orders: 0, value: 0, daysList: [] });
    const e = bySource.get(k);
    e.orders++;
    e.value += r.dealAmount;
    if (r.daysToConvert != null) e.daysList.push(r.daysToConvert);
  }
  const t2 = [...bySource.entries()]
    .map(([source, v]) => ({
      source, orders: v.orders, totalValue: v.value,
      avgValue: v.orders > 0 ? v.value / v.orders : 0,
      avgDays: v.daysList.length > 0 ? v.daysList.reduce((s, x) => s + x, 0) / v.daysList.length : null,
      medianDays: median(v.daysList),
    }))
    .sort((a, b) => b.orders - a.orders);

  // TABLE 3: Country breakdown
  const byCountry = new Map();
  for (const r of records) {
    const k = r.country || 'Unknown';
    if (!byCountry.has(k)) byCountry.set(k, { orders: 0, value: 0, sourceCount: new Map() });
    const e = byCountry.get(k);
    e.orders++;
    e.value += r.dealAmount;
    if (r.leadSource) e.sourceCount.set(r.leadSource, (e.sourceCount.get(r.leadSource) || 0) + 1);
  }
  const t3 = [...byCountry.entries()]
    .map(([country, v]) => {
      const top = [...v.sourceCount.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        country, orders: v.orders, totalValue: v.value,
        avgValue: v.orders > 0 ? v.value / v.orders : 0,
        topSource: top ? `${top[0]} (${top[1]})` : '—',
      };
    })
    .sort((a, b) => b.orders - a.orders);

  // TABLE 4: Source × Country
  const byCross = new Map();
  for (const r of records) {
    if (!r.leadSource || !r.country) continue;
    const k = `${r.leadSource} + ${r.country}`;
    if (!byCross.has(k)) byCross.set(k, { orders: 0, value: 0, daysList: [] });
    const e = byCross.get(k);
    e.orders++;
    e.value += r.dealAmount;
    if (r.daysToConvert != null) e.daysList.push(r.daysToConvert);
  }
  const t4 = [...byCross.entries()]
    .map(([key, v]) => ({
      key, orders: v.orders, totalValue: v.value,
      avgDays: v.daysList.length > 0 ? v.daysList.reduce((s, x) => s + x, 0) / v.daysList.length : null,
    }))
    .sort((a, b) => b.orders - a.orders || b.totalValue - a.totalValue);

  // TABLE 5: Stage breakdown (avg days in stage = days since Modified)
  const nowMs = Date.now();
  const byStage = new Map();
  for (const r of records) {
    const k = STAGE_LABEL[r.dealStage] || r.dealStage;
    if (!byStage.has(k)) byStage.set(k, { count: 0, value: 0, daysList: [] });
    const e = byStage.get(k);
    e.count++;
    e.value += r.dealAmount;
    // proxy: days since lead → now (waiting time in pipeline)
    if (r.leadCreated) e.daysList.push(Math.round((nowMs - new Date(r.leadCreated).getTime()) / 86400000));
  }
  const t5 = [...byStage.entries()].map(([stage, v]) => ({
    stage, count: v.count, totalValue: v.value,
    avgDaysFromLead: v.daysList.length > 0 ? v.daysList.reduce((s, x) => s + x, 0) / v.daysList.length : null,
  }));

  // TABLE 6: Unmatched orders
  const unmatchedRows = records.filter(r => r.matchMethod === 'unmatched').map(r => ({
    customer: r.dealName,
    stage: STAGE_LABEL[r.dealStage] || r.dealStage,
    amount: r.dealAmount,
    attempted: r.dealEmail ? `Email: ${r.dealEmail}` : `Name: ${r.contactName}`,
    result: 'No lead found',
  }));

  // Key metrics
  const totalValue = records.reduce((s, r) => s + r.dealAmount, 0);
  const sourceMost = t2[0] || null;
  const sourceHighestValue = [...t2].sort((a, b) => b.avgValue - a.avgValue)[0] || null;
  const sourceFastest = [...t2]
    .filter(r => r.avgDays != null && r.orders >= 2)
    .sort((a, b) => a.avgDays - b.avgDays)[0] || null;
  const topCountry = t3[0] || null;

  // ============================================================
  // BUILD MARKDOWN + CONSOLE
  // ============================================================
  const md = [];
  const push = (s) => md.push(s);
  const now = new Date();

  push('# Active Orders → Lead Source Analysis');
  push('');
  push(`Generated: ${now.toISOString()}`);
  push(`Stages in scope: **Awaiting Measurements**, **Measurements Final Checks**, **In Manufacturing**.`);
  push('');

  push('## Headline Numbers');
  push(`- Active orders: **${records.length}**`);
  push(`- Total pipeline value: **${money(totalValue)}**`);
  push(`- Matched to lead: ${records.length - unmatched} of ${records.length} (${fmt(pct(records.length - unmatched, records.length))}%)`);
  if (sourceMost) push(`- Most common lead source: **${sourceMost.source}** — ${sourceMost.orders} orders (${fmt(pct(sourceMost.orders, records.length))}% of matched)`);
  if (sourceHighestValue) push(`- Highest avg-value source (min 1 order): **${sourceHighestValue.source}** — ${money(sourceHighestValue.avgValue)} per order`);
  if (sourceFastest) push(`- Fastest converting source (min 2 orders): **${sourceFastest.source}** — ${fmt(sourceFastest.avgDays)} days avg lead→order`);
  if (topCountry) push(`- Most common country: **${topCountry.country}** — ${topCountry.orders} orders`);
  push('');

  push('## Table 1: Every Active Order with its Lead Source');
  push('');
  push(table(
    ['#', 'Customer', 'Stage', 'Amount', 'Country', 'Lead Source', 'Lead Created', 'Days to Convert'],
    t1Rows,
  ));
  push('');

  push('## Table 2: Lead Source Breakdown for Paying Customers');
  push('');
  push(table(
    ['Lead Source', 'Orders', 'Total Value', 'Avg Value', 'Avg Days', 'Median Days'],
    t2.map(r => [
      r.source, r.orders, money(r.totalValue), money(r.avgValue),
      r.avgDays != null ? fmt(r.avgDays) + 'd' : '?',
      r.medianDays > 0 ? r.medianDays + 'd' : '?',
    ]),
  ));
  push('');

  push('## Table 3: Country Breakdown for Paying Customers');
  push('');
  push(table(
    ['Country', 'Orders', 'Total Value', 'Avg Value', 'Top Source'],
    t3.map(r => [r.country, r.orders, money(r.totalValue), money(r.avgValue), r.topSource]),
  ));
  push('');

  push('## Table 4: Lead Source × Country (Top 25)');
  push('');
  push(table(
    ['Source + Country', 'Orders', 'Total Value', 'Avg Days'],
    t4.slice(0, 25).map(r => [truncate(r.key, 38), r.orders, money(r.totalValue), r.avgDays != null ? fmt(r.avgDays) + 'd' : '?']),
  ));
  push('');

  push('## Table 5: Stage Breakdown');
  push('');
  push(table(
    ['Stage', 'Count', 'Total Value', 'Avg Days From Lead'],
    t5.map(r => [r.stage, r.count, money(r.totalValue), r.avgDaysFromLead != null ? fmt(r.avgDaysFromLead) + 'd' : '?']),
  ));
  push('');

  push(`## Table 6: Unmatched Orders (${unmatchedRows.length})`);
  push('');
  if (unmatchedRows.length === 0) {
    push('All active orders matched back to a lead. ✓');
  } else {
    push(table(
      ['Customer', 'Stage', 'Amount', 'Match Attempted', 'Result'],
      unmatchedRows.map(r => [truncate(r.customer, 30), r.stage, money(r.amount), truncate(r.attempted, 40), r.result]),
    ));
  }
  push('');

  console.log(md.join('\n'));

  // ============================================================
  // Claude analysis
  // ============================================================
  console.log('\n=== Requesting Claude analysis (Opus 4.7)... ===\n');

  const claudePrompt = `You are a sales analyst for Bryant Dental, a dental loupes company. Here is data tracing active orders (Awaiting Measurements, Measurements Final Checks, In Manufacturing) back to their original lead source.

HEADLINE:
${records.length} active orders, total ${money(totalValue)} pipeline value.
Match rate: ${records.length - unmatched}/${records.length} traced back to a lead record.

LEAD SOURCE BREAKDOWN (sorted by orders):
${table(['Source', 'Orders', 'Value', 'AvgValue', 'AvgDays'], t2.map(r => [r.source, r.orders, money(r.totalValue), money(r.avgValue), r.avgDays != null ? fmt(r.avgDays) + 'd' : '?']))}

COUNTRY BREAKDOWN:
${table(['Country', 'Orders', 'Value', 'AvgValue', 'TopSource'], t3.map(r => [r.country, r.orders, money(r.totalValue), money(r.avgValue), r.topSource]))}

SOURCE × COUNTRY (top 20):
${table(['Combo', 'Orders', 'Value', 'AvgDays'], t4.slice(0, 20).map(r => [r.key, r.orders, money(r.totalValue), r.avgDays != null ? fmt(r.avgDays) + 'd' : '?']))}

STAGE BREAKDOWN:
${table(['Stage', 'Count', 'Value', 'AvgDaysFromLead'], t5.map(r => [r.stage, r.count, money(r.totalValue), r.avgDaysFromLead != null ? fmt(r.avgDaysFromLead) + 'd' : '?']))}

UNMATCHED ORDERS: ${unmatchedRows.length}

Important context: a prior "No Contact" analysis on Bryant Dental's full lead database (2,000 leads) found that 46.8% of leads never engage at all. The worst sources for unreachable leads were USDentalNachos (96.6% no-contact), UAE_IG (91.2%), MiddleEastLeads (88.9%), FBAdsUSLeads (69.6%), USFBLeads (62.1%). The best were CAL (100% contact rate), Website (73%), and InstagramBio (45.8% — bulk volume but low conversion).

Analyse the order-source data above and tell me:
1. Which lead source produces the most paying customers?
2. Which lead source produces the highest value customers (avg order value)?
3. Which lead source converts fastest (shortest days from lead to order)?
4. Which country + source combos are most valuable?
5. Where should we INCREASE ad spend based on this data?
6. Where should we DECREASE ad spend?
7. Any surprising findings?
8. Compare this to the No Contact analysis above — are the sources that produce buyers DIFFERENT from the sources that produce ghosts? Specifically, do any "bad" no-contact sources still produce paying customers when they DO respond?

Be brutally specific with numbers. No generic advice.`;

  let aiText = '';
  try {
    aiText = await askClaude(claudePrompt);
    console.log(aiText);
  } catch (err) {
    aiText = `Claude analysis failed: ${err.message}`;
    console.error(aiText);
  }

  md.push('');
  md.push('---');
  md.push('');
  md.push('## AI Strategic Recommendations');
  md.push('');
  md.push('_Generated by Claude Opus 4.7 with the full dataset above, cross-referenced against the prior No Contact analysis._');
  md.push('');
  md.push(aiText);
  md.push('');

  // ============================================================
  // Save outputs
  // ============================================================
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'order-source-analysis.md');
  const jsonPath = path.join(outDir, 'order-source-analysis.json');
  const htmlPath = path.join(outDir, 'order-source-analysis.html');
  const pdfPath = path.join(outDir, 'order-source-analysis.pdf');

  fs.writeFileSync(mdPath, md.join('\n'), 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generated: now.toISOString(),
    headline: {
      orders: records.length, totalValue,
      matchedCount: records.length - unmatched,
      sourceMostOrders: sourceMost?.source || null,
      sourceHighestAvgValue: sourceHighestValue?.source || null,
      sourceFastestConvert: sourceFastest?.source || null,
      topCountry: topCountry?.country || null,
    },
    records,
    bySource: t2,
    byCountry: t3,
    crossSourceCountry: t4,
    byStage: t5,
    unmatched: unmatchedRows,
    matchStats: { email: matchedEmail, name: matchedName, live: matchedLive, unmatched },
  }, null, 2), 'utf-8');

  // ---------- HTML + PDF ----------
  console.log('\n=== Rendering PDF... ===');
  const html = renderHtmlReport({
    generated: now.toISOString(), records, totalValue,
    matched: records.length - unmatched, unmatched,
    sourceMost, sourceHighestValue, sourceFastest, topCountry,
    t2, t3, t4, t5, unmatchedRows, aiText,
  });
  fs.writeFileSync(htmlPath, html, 'utf-8');
  const pdfOk = await renderPdf(html, pdfPath);

  console.log('\nReports saved to /data/');
  console.log(`  ✓ Markdown: ${mdPath}`);
  console.log(`  ✓ JSON:     ${jsonPath}`);
  console.log(`  ✓ HTML:     ${htmlPath}`);
  console.log(`  ${pdfOk ? '✓' : '✗'} PDF:      ${pdfPath}${pdfOk ? '' : ' (skipped — puppeteer error)'}`);
  console.log(`\nElapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});

// ============================================================================
// HTML + PDF
// ============================================================================
function rateColor(rate) {
  if (rate >= 70) return '#059669';
  if (rate >= 40) return '#D97706';
  return '#DC2626';
}

function renderHtmlTable(headers, rows) {
  return `<table class="tbl">
    <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => {
      const isNum = typeof c === 'number';
      return `<td class="${isNum ? 'num' : ''}">${escapeHtml(c)}</td>`;
    }).join('')}</tr>`).join('')}
    </tbody></table>`;
}

function renderHorizontalBars(rows, maxRows = 12, valueKey = 'value') {
  const list = rows.slice(0, maxRows);
  if (list.length === 0) return '';
  const max = Math.max(...list.map(r => r[valueKey]));
  return `<div class="bars">${list.map(r => {
    const pctW = max > 0 ? (r[valueKey] / max) * 100 : 0;
    return `<div class="bar-row">
      <div class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)} <span class="bar-count">${r.count}</span></div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max(2, pctW).toFixed(1)}%;background:${r.color || '#0F172A'}"></div>
        <div class="bar-value">${escapeHtml(r.display)}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function aiMarkdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false, inTable = false, tableHeader = null;
  const flushList = () => { if (inList) { out.push('</ol>'); inList = false; } };
  const flushTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeader = null; } };
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); flushTable(); continue; }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) { flushList(); flushTable(); out.push(`<h${Math.min(h[1].length + 1, 6)}>${inline(h[2])}</h${Math.min(h[1].length + 1, 6)}>`); continue; }
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        if (tableHeader) {
          out.push('<table class="tbl compact"><thead><tr>' + tableHeader.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
          inTable = true; tableHeader = null;
        }
        continue;
      }
      if (!inTable) { tableHeader = cells; continue; }
      out.push('<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>');
      continue;
    }
    flushTable();
    const nl = line.match(/^(\d+)\.\s+(.+)$/);
    if (nl) {
      if (!inList) { out.push('<ol>'); inList = true; }
      out.push(`<li>${inline(nl[2])}</li>`); continue;
    }
    const bl = line.match(/^[-*]\s+(.+)$/);
    if (bl) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(bl[1])}</li>`); continue;
    }
    flushList();
    if (/^---+$/.test(line)) { out.push('<hr>'); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList(); flushTable();
  return out.join('\n');
}

function renderHtmlReport(data) {
  const {
    generated, records, totalValue, matched, unmatched,
    sourceMost, sourceHighestValue, sourceFastest, topCountry,
    t2, t3, t4, t5, unmatchedRows, aiText,
  } = data;

  const css = `
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif; color: #0F172A; font-size: 10.5px; line-height: 1.5; background: #fff; }
    h1, h2, h3, h4 { color: #0F172A; margin: 0; }
    h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    h2 { font-size: 16px; font-weight: 700; margin: 22px 0 10px; padding-top: 14px; border-top: 2px solid #0F172A; }
    h3 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; color: #334155; }
    p { margin: 4px 0 8px; }
    strong { color: #0F172A; }
    code { font-family: "SF Mono", Consolas, monospace; font-size: 95%; background: #F1F5F9; padding: 1px 5px; border-radius: 3px; }
    hr { border: 0; border-top: 1px solid #E2E8F0; margin: 16px 0; }

    .cover { padding: 40px 0 20px; border-bottom: 3px solid #0F172A; margin-bottom: 22px; }
    .cover .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: #64748B; margin-bottom: 8px; }
    .cover .subtitle { color: #475569; font-size: 14px; margin-top: 4px; font-weight: 500; }
    .cover .meta { color: #94A3B8; font-size: 10.5px; margin-top: 10px; }

    .kpis { display: flex; gap: 12px; margin: 16px 0 24px; flex-wrap: wrap; }
    .kpi { flex: 1; min-width: 140px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; background: #fff; }
    .kpi-label { font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #64748B; margin-bottom: 4px; }
    .kpi-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: #0F172A; }
    .kpi-value.good { color: #059669; }
    .kpi-value.bad { color: #DC2626; }
    .kpi-sub { font-size: 11px; color: #64748B; margin-top: 2px; }

    .tbl { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 10px; }
    .tbl thead th { text-align: left; font-weight: 600; color: #475569; padding: 8px 10px; border-bottom: 2px solid #0F172A; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; }
    .tbl tbody td { padding: 6px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
    .tbl tbody tr:nth-child(odd) td { background: #F8FAFC; }
    .tbl tbody tr { page-break-inside: avoid; }
    .tbl .num { text-align: right; font-variant-numeric: tabular-nums; font-family: "SF Mono", Consolas, monospace; }
    .tbl.compact td, .tbl.compact th { padding: 5px 8px; font-size: 9.5px; }

    .bars { margin: 12px 0 18px; }
    .bar-row { display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: center; margin-bottom: 6px; page-break-inside: avoid; }
    .bar-label { font-size: 10px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-count { color: #94A3B8; font-size: 9px; margin-left: 4px; }
    .bar-track { position: relative; height: 18px; background: #F1F5F9; border-radius: 4px; overflow: hidden; }
    .bar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; opacity: 0.85; }
    .bar-value { position: absolute; right: 8px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 9.5px; font-weight: 600; color: #0F172A; }

    .callout { padding: 12px 14px; border-left: 3px solid #0F172A; background: #F8FAFC; border-radius: 0 6px 6px 0; margin: 10px 0 14px; font-size: 10.5px; }

    .ai-section { margin-top: 28px; padding: 18px 20px; border: 1px solid #E2E8F0; border-radius: 10px; background: #FAFAFA; }
    .ai-section h2 { border-top: 0; padding-top: 0; margin-top: 0; font-size: 18px; }
    .ai-section ol, .ai-section ul { padding-left: 22px; margin: 6px 0 10px; }
    .ai-section li { margin-bottom: 3px; }
    .ai-section table { font-size: 9.5px; }

    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; color: #94A3B8; font-size: 9px; text-align: center; }
  `;

  // Bar chart: top sources by order count
  const sourceBars = t2.slice(0, 12).map(r => ({
    label: r.source, count: r.orders,
    value: r.orders,
    display: `${r.orders} · ${money(r.totalValue)}`,
    color: '#0F172A',
  }));
  const countryBars = t3.slice(0, 12).map(r => ({
    label: r.country, count: r.orders,
    value: r.totalValue,
    display: money(r.totalValue),
    color: '#0F172A',
  }));

  const t1Rows = records.map((r, i) => [
    i + 1,
    truncate(r.dealName, 30),
    STAGE_LABEL[r.dealStage] || r.dealStage,
    money(r.dealAmount),
    r.country || '?',
    r.leadSource || '— no lead found',
    r.leadCreated ? new Date(r.leadCreated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?',
    r.daysToConvert != null ? `${r.daysToConvert}d` : '?',
  ]);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bryant Dental — Order Source Analysis</title>
<style>${css}</style></head><body>

<div class="cover">
  <div class="brand">Bryant Dental</div>
  <h1>Active Orders → Lead Source Analysis</h1>
  <p class="subtitle">Which marketing channels actually produce paying customers</p>
  <p class="meta">Generated ${escapeHtml(new Date(generated).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }))} · ${records.length} active orders · Stages: Awaiting Measurements, Measurements Final Checks, In Manufacturing</p>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-label">Active orders</div><div class="kpi-value">${records.length}</div></div>
  <div class="kpi"><div class="kpi-label">Pipeline value</div><div class="kpi-value good">${money(totalValue)}</div></div>
  <div class="kpi"><div class="kpi-label">Matched to lead</div><div class="kpi-value">${matched}/${records.length}</div><div class="kpi-sub">${fmt(pct(matched, records.length))}%</div></div>
  ${unmatched > 0 ? `<div class="kpi"><div class="kpi-label">Unmatched</div><div class="kpi-value bad">${unmatched}</div><div class="kpi-sub">no lead record found</div></div>` : ''}
</div>

<div class="callout">
  ${sourceMost ? `<strong>Most common lead source:</strong> ${escapeHtml(sourceMost.source)} — ${sourceMost.orders} orders (${fmt(pct(sourceMost.orders, records.length))}% of matched).<br>` : ''}
  ${sourceHighestValue ? `<strong>Highest avg-value source:</strong> ${escapeHtml(sourceHighestValue.source)} — ${money(sourceHighestValue.avgValue)} per order.<br>` : ''}
  ${sourceFastest ? `<strong>Fastest converting source (min 2 orders):</strong> ${escapeHtml(sourceFastest.source)} — ${fmt(sourceFastest.avgDays)} days avg.<br>` : ''}
  ${topCountry ? `<strong>Most common country:</strong> ${escapeHtml(topCountry.country)} — ${topCountry.orders} orders.` : ''}
</div>

<div class="section">
  <h2>1. Lead Source Volume — Active Orders</h2>
  ${renderHorizontalBars(sourceBars)}
  <h3>Full breakdown</h3>
  ${renderHtmlTable(
    ['Lead Source', 'Orders', 'Total Value', 'Avg Value', 'Avg Days', 'Median Days'],
    t2.map(r => [r.source, r.orders, money(r.totalValue), money(r.avgValue), r.avgDays != null ? fmt(r.avgDays) + 'd' : '?', r.medianDays > 0 ? r.medianDays + 'd' : '?']),
  )}
</div>

<div class="section">
  <h2>2. Country — Paying Customers</h2>
  ${renderHorizontalBars(countryBars)}
  <h3>Full breakdown</h3>
  ${renderHtmlTable(
    ['Country', 'Orders', 'Total Value', 'Avg Value', 'Top Source'],
    t3.map(r => [r.country, r.orders, money(r.totalValue), money(r.avgValue), r.topSource]),
  )}
</div>

<div class="section">
  <h2>3. Source × Country (Top 25)</h2>
  ${renderHtmlTable(
    ['Source + Country', 'Orders', 'Total Value', 'Avg Days'],
    t4.slice(0, 25).map(r => [r.key, r.orders, money(r.totalValue), r.avgDays != null ? fmt(r.avgDays) + 'd' : '?']),
  )}
</div>

<div class="section">
  <h2>4. Stage Breakdown</h2>
  ${renderHtmlTable(
    ['Stage', 'Count', 'Total Value', 'Avg Days From Lead'],
    t5.map(r => [r.stage, r.count, money(r.totalValue), r.avgDaysFromLead != null ? fmt(r.avgDaysFromLead) + 'd' : '?']),
  )}
</div>

<div class="section">
  <h2>5. Every Active Order — Detail</h2>
  ${renderHtmlTable(
    ['#', 'Customer', 'Stage', 'Amount', 'Country', 'Lead Source', 'Lead Created', 'Days to Convert'],
    t1Rows,
  )}
</div>

${unmatchedRows.length > 0 ? `
<div class="section">
  <h2>6. Unmatched Orders</h2>
  <p>Orders we could not trace back to a lead record.</p>
  ${renderHtmlTable(
    ['Customer', 'Stage', 'Amount', 'Match Attempted', 'Result'],
    unmatchedRows.map(r => [r.customer, r.stage, money(r.amount), r.attempted, r.result]),
  )}
</div>
` : ''}

<div class="ai-section">
  <h2>AI Strategic Recommendations</h2>
  <p style="color:#64748B;font-size:10px;margin-bottom:14px">Generated by Claude Opus 4.7. The prompt cross-referenced this dataset against the prior No Contact analysis to spot patterns between sources that ghost vs sources that buy.</p>
  ${aiMarkdownToHtml(aiText)}
</div>

<div class="footer">
  Bryant Dental Sales Intelligence · analyse-order-sources.js · ${escapeHtml(new Date(generated).toISOString())}
</div>

</body></html>`;
}

async function renderPdf(html, outPath) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch (err) {
    console.warn('[PDF] puppeteer not available:', err.message);
    return false;
  }
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' },
      printBackground: true,
      preferCSSPageSize: true,
    });
    return true;
  } finally {
    await browser.close();
  }
}
