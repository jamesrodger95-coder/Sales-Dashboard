// Deep analysis: why do leads end up in "No Contact" / "No Contact From Customer"?
// Binary framing — did we ever make contact, yes or no? Everything that left
// those two statuses (Customer Said No, No Show, Demo Completed, Purchased,
// etc.) counts as a successful contact.
//
// Run: node scripts/analyse-no-contact.js

const fs = require('fs');
const path = require('path');

// ---------- env loader (no dotenv dep) ----------
function loadEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (n, d) => d > 0 ? (n / d * 100) : 0;
const fmt = (n) => Number.isFinite(n) ? n.toFixed(1) : '0.0';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const truncate = (s, n) => (s && s.length > n) ? s.slice(0, n - 1) + '…' : (s || '');

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const sep = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const fmtRow = (r) => '| ' + r.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ') + ' |';
  return [fmtRow(headers), sep, ...rows.map(fmtRow)].join('\n');
}

// ---------- HTML rendering ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rateColor(rate) {
  if (rate >= 70) return '#059669'; // emerald-600
  if (rate >= 40) return '#D97706'; // amber-600
  return '#DC2626';                 // red-600
}

function rateBadge(rate) {
  return `<span class="badge" style="background:${rateColor(rate)}1A;color:${rateColor(rate)}">${fmt(rate)}%</span>`;
}

// Render a horizontal bar chart from rows. Each row: { label, value (%), count }.
function renderBarChart(rows, maxRows = 15) {
  const list = rows.slice(0, maxRows);
  return `<div class="bars">${list.map(r => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)} <span class="bar-count">${r.count}</span></div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max(2, r.value).toFixed(1)}%;background:${rateColor(r.value)}"></div>
        <div class="bar-value">${fmt(r.value)}%</div>
      </div>
    </div>`).join('')}
  </div>`;
}

// Render a styled HTML table. `colorIdx` marks a column whose value is a
// percentage to be color-coded (e.g. Contact Rate column).
function renderTable(headers, rows, opts = {}) {
  const { colorIdx = -1, compact = false } = opts;
  const cls = compact ? 'tbl compact' : 'tbl';
  return `<table class="${cls}">
    <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => {
      if (i === colorIdx && typeof c === 'number') {
        return `<td class="num"><span class="badge" style="background:${rateColor(c)}1A;color:${rateColor(c)};">${fmt(c)}%</span></td>`;
      }
      const isNum = typeof c === 'number';
      return `<td class="${isNum ? 'num' : ''}">${escapeHtml(c)}</td>`;
    }).join('')}</tr>`).join('')}
    </tbody></table>`;
}

// Minimal markdown → HTML converter for the Claude AI text. Handles headings,
// bold, lists, paragraphs, and pipe-tables. Good enough for the report.
function aiMarkdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  let inTable = false;
  let tableHeader = null;
  const flushList = () => { if (inList) { out.push('</ol>'); inList = false; } };
  const flushTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeader = null; } };
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { flushList(); flushTable(); continue; }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) { flushList(); flushTable(); const lvl = Math.min(h[1].length + 1, 6); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }

    // Table
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      // Separator row like |---|---|
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

    // Numbered list
    const nl = line.match(/^(\d+)\.\s+(.+)$/);
    if (nl) {
      if (!inList) { out.push('<ol>'); inList = true; }
      out.push(`<li>${inline(nl[2])}</li>`);
      continue;
    }

    // Bullet
    const bl = line.match(/^[-*]\s+(.+)$/);
    if (bl) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(bl[1])}</li>`);
      continue;
    }
    flushList();

    // Horizontal rule
    if (/^---+$/.test(line)) { out.push('<hr>'); continue; }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList(); flushTable();
  return out.join('\n');
}

// Top 15 by volume for charts (showing visible signal, not 1-lead outliers).
function topByVolume(rows, n = 15) {
  return [...rows].sort((a, b) => b.total - a.total).slice(0, n)
    .map(r => ({ label: r.key, value: r.rate, count: r.total }));
}

function renderHtmlReport(data) {
  const {
    generated, allLeadsCount, contactedCount, noContactCount,
    contactRate, dropRate, noContactDash,
    sourceRows, countryRows, crossRows, monthRows,
    avgRecent, avgPrior, trendDelta,
    avgDays, medDays, buckets, daysToNCLen,
    ncPhone, ncEmailOnly, ncNeither, cPhone, cEmailOnly, cNeither, phoneGap,
    contactedRows, salvageable, topSources, topCountries, aiText,
  } = data;

  const css = `
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif;
      color: #0F172A; font-size: 10.5px; line-height: 1.5; background: #fff; }
    h1, h2, h3, h4 { color: #0F172A; margin: 0; }
    h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    h2 { font-size: 16px; font-weight: 700; margin: 22px 0 10px; padding-top: 14px;
      border-top: 2px solid #0F172A; letter-spacing: -0.01em; page-break-after: avoid; }
    h3 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; color: #334155; page-break-after: avoid; }
    h4 { font-size: 11.5px; font-weight: 600; margin: 10px 0 4px; color: #475569; }
    p { margin: 4px 0 8px; }
    strong { color: #0F172A; }
    code { font-family: "SF Mono", Consolas, monospace; font-size: 95%;
      background: #F1F5F9; padding: 1px 5px; border-radius: 3px; }
    hr { border: 0; border-top: 1px solid #E2E8F0; margin: 16px 0; }

    .cover { padding: 40px 0 20px; border-bottom: 3px solid #0F172A; margin-bottom: 22px; }
    .cover .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.18em;
      text-transform: uppercase; color: #64748B; margin-bottom: 8px; }
    .cover .subtitle { color: #475569; font-size: 14px; margin-top: 4px; font-weight: 500; }
    .cover .meta { color: #94A3B8; font-size: 10.5px; margin-top: 10px; }

    .kpis { display: flex; gap: 12px; margin: 16px 0 24px; }
    .kpi { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px;
      padding: 14px 16px; background: #fff; }
    .kpi-label { font-size: 9px; font-weight: 600; letter-spacing: 0.12em;
      text-transform: uppercase; color: #64748B; margin-bottom: 4px; }
    .kpi-value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
      line-height: 1.1; color: #0F172A; }
    .kpi-value.good { color: #059669; }
    .kpi-value.bad  { color: #DC2626; }
    .kpi-sub { font-size: 11px; color: #64748B; margin-top: 2px; }

    .tbl { width: 100%; border-collapse: collapse; margin: 8px 0 12px;
      font-size: 10px; page-break-inside: auto; }
    .tbl thead th { text-align: left; font-weight: 600; color: #475569;
      padding: 8px 10px; border-bottom: 2px solid #0F172A;
      font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; }
    .tbl tbody td { padding: 6px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
    .tbl tbody tr:nth-child(odd) td { background: #F8FAFC; }
    .tbl tbody tr { page-break-inside: avoid; }
    .tbl .num { text-align: right; font-variant-numeric: tabular-nums; font-family: "SF Mono", Consolas, monospace; }
    .tbl.compact td, .tbl.compact th { padding: 5px 8px; font-size: 9.5px; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-weight: 600; font-size: 10px; font-variant-numeric: tabular-nums; }

    .bars { margin: 12px 0 18px; }
    .bar-row { display: grid; grid-template-columns: 200px 1fr; gap: 12px;
      align-items: center; margin-bottom: 6px; page-break-inside: avoid; }
    .bar-label { font-size: 10px; color: #334155; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .bar-count { color: #94A3B8; font-size: 9px; margin-left: 4px; }
    .bar-track { position: relative; height: 18px; background: #F1F5F9;
      border-radius: 4px; overflow: hidden; }
    .bar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px;
      transition: width 0.3s; opacity: 0.85; }
    .bar-value { position: absolute; right: 8px; top: 0; bottom: 0; display: flex;
      align-items: center; font-size: 9.5px; font-weight: 600; color: #0F172A;
      font-variant-numeric: tabular-nums; }

    .callout { padding: 12px 14px; border-left: 3px solid #0F172A;
      background: #F8FAFC; border-radius: 0 6px 6px 0; margin: 10px 0 14px; font-size: 10.5px; }
    .callout.warn { border-left-color: #D97706; background: #FFFBEB; }
    .callout.good { border-left-color: #059669; background: #F0FDF4; }
    .callout.bad { border-left-color: #DC2626; background: #FEF2F2; }

    .section { page-break-inside: auto; }
    .section + .section { margin-top: 0; }

    .ai-section { margin-top: 28px; padding: 18px 20px; border: 1px solid #E2E8F0;
      border-radius: 10px; background: #FAFAFA; page-break-before: auto; }
    .ai-section h2 { border-top: 0; padding-top: 0; margin-top: 0; font-size: 18px; }
    .ai-section h3 { font-size: 13px; margin-top: 14px; }
    .ai-section ol, .ai-section ul { padding-left: 22px; margin: 6px 0 10px; }
    .ai-section li { margin-bottom: 3px; }
    .ai-section table { font-size: 9.5px; }

    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0;
      color: #94A3B8; font-size: 9px; text-align: center; }
  `;

  const trendLabel = trendDelta > 1 ? 'improving'
    : trendDelta < -1 ? 'declining' : 'stable';
  const trendClass = trendDelta > 1 ? 'good' : trendDelta < -1 ? 'bad' : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bryant Dental — No Contact Lead Analysis</title>
<style>${css}</style></head><body>

<div class="cover">
  <div class="brand">Bryant Dental</div>
  <h1>No Contact Lead Analysis</h1>
  <p class="subtitle">Why are leads ending up in "No Contact" status — and what to do about it</p>
  <p class="meta">Generated ${escapeHtml(new Date(generated).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }))} · ${allLeadsCount.toLocaleString()} leads analysed · Lead owner: James Rodger</p>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-label">Total Leads</div><div class="kpi-value">${allLeadsCount.toLocaleString()}</div><div class="kpi-sub">All-time, all sources</div></div>
  <div class="kpi"><div class="kpi-label">Contacted</div><div class="kpi-value good">${contactedCount.toLocaleString()}</div><div class="kpi-sub">${fmt(contactRate)}% reached any stage beyond No Contact</div></div>
  <div class="kpi"><div class="kpi-label">No Contact</div><div class="kpi-value bad">${noContactCount.toLocaleString()}</div><div class="kpi-sub">${fmt(dropRate)}% never engaged at all</div></div>
</div>

<div class="callout">
  <strong>Definition.</strong> "No Contact" = Status is exactly <code>No Contact</code> or <code>No Contact From Customer</code>.
  Every other status — including <code>Customer Said No</code>, <code>No Show</code>, <code>Demo Completed</code>, <code>Purchased</code> — counts as a successful contact, because the lead engaged in some way.
  ${noContactDash > 0 ? `<br><br><em>Note: ${noContactDash} leads with the Zoho-typo status "No Contact -" are counted as Contacted per this strict definition.</em>` : ''}
</div>

<div class="section">
  <h2>1. Contact Rate by Lead Source — Top 15 by Volume</h2>
  ${renderBarChart(topByVolume(sourceRows, 15))}
  <h3>Full source breakdown (sorted best → worst)</h3>
  ${renderTable(
    ['Lead Source', 'Total', 'Contacted', 'No Contact', 'Contact Rate'],
    sourceRows.map(r => [r.key, r.total, r.contacted, r.noContact, r.rate]),
    { colorIdx: 4 },
  )}
</div>

<div class="section">
  <h2>2. Contact Rate by Country — Top 15 by Volume</h2>
  ${renderBarChart(topByVolume(countryRows, 15))}
  <h3>Full country breakdown (sorted best → worst)</h3>
  ${renderTable(
    ['Country', 'Total', 'Contacted', 'No Contact', 'Contact Rate'],
    countryRows.map(r => [r.key, r.total, r.contacted, r.noContact, r.rate]),
    { colorIdx: 4 },
  )}
</div>

<div class="section">
  <h2>3. Worst Source × Country Combinations</h2>
  <p>Only combinations with at least 5 leads. Top 30 worst combos.</p>
  ${renderTable(
    ['Source + Country', 'Total', 'Contacted', 'No Contact', 'Contact Rate'],
    crossRows.slice(0, 30).map(r => [r.key, r.total, r.contacted, r.noContact, r.rate]),
    { colorIdx: 4 },
  )}
</div>

<div class="section">
  <h2>4. Contact Rate Trend Over Time</h2>
  ${renderTable(
    ['Month', 'Created', 'No Contact', 'Contact Rate'],
    monthRows.slice(-18).map(r => [r.month, r.created, r.noContact, r.rate]),
    { colorIdx: 3 },
  )}
  <div class="callout ${trendClass}">
    <strong>Trend:</strong> Last 6 months avg contact rate <strong>${fmt(avgRecent)}%</strong>,
    prior 6 months <strong>${fmt(avgPrior)}%</strong>.
    Delta: <strong>${trendDelta > 0 ? '+' : ''}${fmt(trendDelta)} pts (${trendLabel})</strong>.
    <br><br>
    <em>Caveat: leads created in the last ~30 days haven't aged enough to be marked No Contact
    (median time-to-NC is ${medDays} days), so the most recent months will look artificially strong.</em>
  </div>
</div>

<div class="section">
  <h2>5. Speed to No Contact</h2>
  <p>For the ${noContactCount.toLocaleString()} No Contact leads, this is how long it took before the VA gave up.</p>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Avg days</div><div class="kpi-value">${fmt(avgDays)}</div></div>
    <div class="kpi"><div class="kpi-label">Median</div><div class="kpi-value">${medDays}</div><div class="kpi-sub">days from create</div></div>
    <div class="kpi"><div class="kpi-label">In ≤7 days</div><div class="kpi-value">${buckets['0-3'] + buckets['4-7']}</div><div class="kpi-sub">${fmt(pct(buckets['0-3'] + buckets['4-7'], daysToNCLen))}% — process speed signal</div></div>
  </div>
  ${renderTable(
    ['Bucket', 'Count', '% of No Contact'],
    Object.entries(buckets).map(([b, n]) => [b + ' days', n, fmt(pct(n, daysToNCLen)) + '%']),
  )}
</div>

<div class="section">
  <h2>6. Phone Number Availability</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">No Contact w/ phone</div><div class="kpi-value">${fmt(pct(ncPhone, noContactCount))}%</div><div class="kpi-sub">${ncPhone.toLocaleString()} of ${noContactCount.toLocaleString()}</div></div>
    <div class="kpi"><div class="kpi-label">Contacted w/ phone</div><div class="kpi-value">${fmt(pct(cPhone, contactedCount))}%</div><div class="kpi-sub">${cPhone.toLocaleString()} of ${contactedCount.toLocaleString()}</div></div>
    <div class="kpi"><div class="kpi-label">Phone gap</div><div class="kpi-value ${Math.abs(phoneGap) < 5 ? '' : phoneGap < 0 ? 'bad' : 'good'}">${phoneGap > 0 ? '+' : ''}${fmt(phoneGap)} pts</div><div class="kpi-sub">No Contact − Contacted</div></div>
  </div>
  <div class="callout ${Math.abs(phoneGap) < 5 ? '' : phoneGap < 0 ? 'bad' : 'good'}">
    ${Math.abs(phoneGap) < 5
      ? '<strong>No meaningful gap.</strong> Phone availability is similar in both groups. Missing phone numbers are NOT the cause of No Contact — leads had contact info, they just did not respond.'
      : phoneGap < 0
        ? '<strong>No Contact leads have LESS phone coverage</strong> — data quality at registration is part of the issue.'
        : '<strong>No Contact leads have MORE phone coverage</strong> — contactability was fine, the leads simply did not respond.'}
  </div>
</div>

<div class="section">
  <h2>7. Where Do Contacted Leads End Up?</h2>
  <p>Of the ${contactedCount.toLocaleString()} contacted leads, where they ultimately landed. This is the benchmark for what happens when the funnel works.</p>
  ${renderTable(
    ['Status', 'Count', '% of Contacted'],
    contactedRows.map(r => [r.status, r.count, fmt(r.pct) + '%']),
  )}
</div>

<div class="section">
  <h2>8. Salvageable Leads — ${salvageable.length} candidates</h2>
  <p><strong>Criteria:</strong> created in last 120 days · from a high-contact source OR country · has a phone number.</p>
  <p><strong>High-contact sources used as filter:</strong> ${topSources.length ? topSources.map(s => escapeHtml(s)).join(', ') : '—'}<br>
     <strong>High-contact countries used as filter:</strong> ${topCountries.length ? topCountries.map(c => escapeHtml(c)).join(', ') : '—'}</p>
  ${salvageable.length === 0 ? '<p><em>No leads matched all criteria.</em></p>' : `
    <h3>Top 20 most-recent candidates</h3>
    ${renderTable(
      ['Name', 'Country', 'Source', 'Phone', 'Created'],
      salvageable.slice(0, 20).map(l => [
        truncate(l.Full_Name, 30),
        l.Country || '?',
        l.Lead_Source || '?',
        l.Mobile || l.Phone || '',
        new Date(l.Created_Time).toLocaleDateString('en-GB'),
      ]),
      { compact: true },
    )}
  `}
</div>

<div class="ai-section">
  <h2>AI Strategic Recommendations</h2>
  <p style="color:#64748B;font-size:10px;margin-bottom:14px">Generated by Claude Opus 4.7 from the full dataset above.</p>
  ${aiMarkdownToHtml(aiText)}
</div>

<div class="footer">
  Bryant Dental Sales Intelligence · Generated by analyse-no-contact.js · ${escapeHtml(new Date(generated).toISOString())}
</div>

</body></html>`;
}

async function renderPdf(html, outPath) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch (err) {
    console.warn('[PDF] puppeteer not available — skipping PDF render:', err.message);
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

async function zohoSearch(token, p) {
  const api = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  const res = await fetch(`${api}${p}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 204) return { data: [], info: { more_records: false } };
  const text = await res.text();
  if (!text) return { data: [], info: { more_records: false } };
  try { return JSON.parse(text); } catch { return { data: [], info: { more_records: false } }; }
}

async function fetchAllJamesLeads(token) {
  const fields = 'Full_Name,Email,Mobile,Phone,Country,Lead_Source,Created_Time,Modified_Time,Status,Owner';
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const data = await zohoSearch(token, `/crm/v6/Leads/search?criteria=(Owner.name:equals:James Rodger)&fields=${fields}&per_page=200&page=${page}`);
    const rows = data.data || [];
    all.push(...rows);
    process.stdout.write(`\r  Zoho leads: fetched ${all.length}...`);
    if (!data.info?.more_records) break;
    await sleep(120);
  }
  process.stdout.write('\n');
  return all;
}

// ---------- Claude ----------
async function askClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
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

// ---------- classification ----------
// Strictly the two statuses per the spec. "No Contact -" (Zoho typo variant) is
// noted in console but NOT folded in, so the numbers honour the user's framing.
const NO_CONTACT = new Set(['No Contact', 'No Contact From Customer']);
const statusOf = (l) => l.Status || '-None-';
const isNoContact = (l) => NO_CONTACT.has(statusOf(l));
const hasPhone = (l) => !!(l.Mobile || l.Phone);
const hasEmail = (l) => !!l.Email;

// Median helper
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================================
// MAIN
// ============================================================================
(async () => {
  const t0 = Date.now();
  console.log('=== No Contact Lead Analysis (binary framing) ===\n');

  console.log('[1/3] Authenticating Zoho...');
  const zohoToken = await getZohoToken();

  console.log('[2/3] Fetching all James leads...');
  const allLeads = await fetchAllJamesLeads(zohoToken);
  console.log(`  Total leads: ${allLeads.length}`);

  console.log('[3/3] Running analysis...\n');

  const noContact = allLeads.filter(isNoContact);
  const contacted = allLeads.filter(l => !isNoContact(l));

  // "No Contact -" warning if present
  const noContactDash = allLeads.filter(l => statusOf(l) === 'No Contact -').length;
  if (noContactDash > 0) {
    console.log(`Note: ${noContactDash} leads with status "No Contact -" (Zoho typo) are grouped as Contacted per strict spec. Add to NO_CONTACT set in script if you want them folded in.\n`);
  }

  // ============================================================
  // 1. OVERALL PICTURE
  // ============================================================
  const contactRate = pct(contacted.length, allLeads.length);
  const dropRate = pct(noContact.length, allLeads.length);

  // ============================================================
  // 2. CONTACT RATE BY LEAD SOURCE
  // ============================================================
  const sourceMap = new Map();
  for (const l of allLeads) {
    const k = l.Lead_Source || 'Unknown';
    if (!sourceMap.has(k)) sourceMap.set(k, { total: 0, contacted: 0, noContact: 0 });
    const e = sourceMap.get(k);
    e.total++;
    if (isNoContact(l)) e.noContact++;
    else e.contacted++;
  }
  const sourceRows = [...sourceMap.entries()]
    .map(([k, v]) => ({ key: k, total: v.total, contacted: v.contacted, noContact: v.noContact, rate: pct(v.contacted, v.total) }))
    .sort((a, b) => b.rate - a.rate);

  // ============================================================
  // 3. CONTACT RATE BY COUNTRY
  // ============================================================
  const countryMap = new Map();
  for (const l of allLeads) {
    const k = l.Country || 'Unknown';
    if (!countryMap.has(k)) countryMap.set(k, { total: 0, contacted: 0, noContact: 0 });
    const e = countryMap.get(k);
    e.total++;
    if (isNoContact(l)) e.noContact++;
    else e.contacted++;
  }
  const countryRows = [...countryMap.entries()]
    .map(([k, v]) => ({ key: k, total: v.total, contacted: v.contacted, noContact: v.noContact, rate: pct(v.contacted, v.total) }))
    .sort((a, b) => b.rate - a.rate);

  // ============================================================
  // 4. SOURCE × COUNTRY (worst first, min 5)
  // ============================================================
  const crossMap = new Map();
  for (const l of allLeads) {
    const k = `${l.Lead_Source || 'Unknown'} + ${l.Country || 'Unknown'}`;
    if (!crossMap.has(k)) crossMap.set(k, { total: 0, contacted: 0, noContact: 0 });
    const e = crossMap.get(k);
    e.total++;
    if (isNoContact(l)) e.noContact++;
    else e.contacted++;
  }
  const crossRows = [...crossMap.entries()]
    .filter(([, v]) => v.total >= 5)
    .map(([k, v]) => ({ key: k, total: v.total, contacted: v.contacted, noContact: v.noContact, rate: pct(v.contacted, v.total) }))
    .sort((a, b) => a.rate - b.rate);

  // ============================================================
  // 5. TREND BY CREATED MONTH
  // ============================================================
  const monthMap = new Map();
  for (const l of allLeads) {
    const k = ymd(new Date(l.Created_Time));
    if (!monthMap.has(k)) monthMap.set(k, { created: 0, noContact: 0 });
    const e = monthMap.get(k);
    e.created++;
    if (isNoContact(l)) e.noContact++;
  }
  const monthRows = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({ month: m, created: v.created, noContact: v.noContact, rate: pct(v.created - v.noContact, v.created) }));

  // Trend: last 6 vs prior 6
  const lastN = monthRows.slice(-12);
  const recent6 = lastN.slice(-6);
  const prior6 = lastN.slice(-12, -6);
  const avgRecent = recent6.length ? recent6.reduce((s, r) => s + r.rate, 0) / recent6.length : 0;
  const avgPrior = prior6.length ? prior6.reduce((s, r) => s + r.rate, 0) / prior6.length : 0;
  const trendDelta = avgRecent - avgPrior;

  // ============================================================
  // 6. SPEED TO NO CONTACT
  // ============================================================
  const daysToNC = noContact.map(l => {
    const created = new Date(l.Created_Time).getTime();
    const modified = new Date(l.Modified_Time).getTime();
    return Math.max(0, Math.round((modified - created) / 86400000));
  });
  const avgDays = daysToNC.length ? daysToNC.reduce((a, b) => a + b, 0) / daysToNC.length : 0;
  const medDays = median(daysToNC);
  const buckets = { '0-3': 0, '4-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
  for (const d of daysToNC) {
    if (d <= 3) buckets['0-3']++;
    else if (d <= 7) buckets['4-7']++;
    else if (d <= 14) buckets['8-14']++;
    else if (d <= 30) buckets['15-30']++;
    else buckets['30+']++;
  }

  // ============================================================
  // 7. PHONE COVERAGE
  // ============================================================
  const ncPhone = noContact.filter(hasPhone).length;
  const ncEmailOnly = noContact.filter(l => hasEmail(l) && !hasPhone(l)).length;
  const ncNeither = noContact.filter(l => !hasEmail(l) && !hasPhone(l)).length;
  const cPhone = contacted.filter(hasPhone).length;
  const cEmailOnly = contacted.filter(l => hasEmail(l) && !hasPhone(l)).length;
  const cNeither = contacted.filter(l => !hasEmail(l) && !hasPhone(l)).length;

  // ============================================================
  // 8. CONTACTED OUTCOMES BREAKDOWN
  // ============================================================
  const contactedStatusMap = new Map();
  for (const l of contacted) {
    const s = statusOf(l);
    contactedStatusMap.set(s, (contactedStatusMap.get(s) || 0) + 1);
  }
  const contactedRows = [...contactedStatusMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => ({ status: s, count: n, pct: pct(n, contacted.length) }));

  // ============================================================
  // 9. SALVAGEABLE
  // ============================================================
  // High-contact-rate filters (min sample 10 for stability)
  const topSources = new Set(sourceRows.filter(r => r.total >= 10).slice(0, Math.max(3, Math.floor(sourceRows.filter(r => r.total >= 10).length / 3))).map(r => r.key));
  const topCountries = new Set(countryRows.filter(r => r.total >= 10).slice(0, Math.max(3, Math.floor(countryRows.filter(r => r.total >= 10).length / 3))).map(r => r.key));
  const nowMs = Date.now();
  const D120 = 120 * 86400000;
  const salvageable = noContact.filter(l => {
    if (nowMs - new Date(l.Created_Time).getTime() > D120) return false;
    if (!topCountries.has(l.Country) && !topSources.has(l.Lead_Source)) return false;
    if (!hasPhone(l)) return false;
    return true;
  });

  // ============================================================
  // BUILD REPORT
  // ============================================================
  const md = [];
  const push = (s) => md.push(s);
  const now = new Date();

  push('# Why Are Leads Going to "No Contact"? — Deep Analysis');
  push('');
  push(`Generated: ${now.toISOString()}`);
  push('');
  push(`Definition: "No Contact" group = Status is exactly "No Contact" or "No Contact From Customer". Everything else (including Customer Said No, No Show, Demo Completed, Purchased, etc.) counts as a successful contact.`);
  push('');

  // 1
  push('## 1. The Overall Picture');
  push('');
  push(`- Total leads owned by James: **${allLeads.length}**`);
  push(`- Contacted (reached any stage beyond No Contact): **${contacted.length}** (${fmt(contactRate)}%)`);
  push(`- No Contact (never engaged): **${noContact.length}** (${fmt(dropRate)}%)`);
  push('');
  push(`**Contact Rate: ${fmt(contactRate)}%**`);
  push(`**Drop Rate: ${fmt(dropRate)}%**`);
  push('');

  // 2
  push('## 2. Contact Rate by Lead Source');
  push('');
  push(table(
    ['Lead Source', 'Total', 'Contacted', 'No Contact', 'Contact Rate'],
    sourceRows.map(r => [r.key, r.total, r.contacted, r.noContact, fmt(r.rate) + '%']),
  ));
  push('');

  // 3
  push('## 3. Contact Rate by Country');
  push('');
  push(table(
    ['Country', 'Total', 'Contacted', 'No Contact', 'Contact Rate'],
    countryRows.map(r => [r.key, r.total, r.contacted, r.noContact, fmt(r.rate) + '%']),
  ));
  push('');

  // 4
  push('## 4. Lead Source × Country — Worst Combinations (min 5 leads)');
  push('');
  push(table(
    ['Source + Country', 'Total', 'Contacted', 'No Contact', 'Contact Rate'],
    crossRows.slice(0, 30).map(r => [truncate(r.key, 40), r.total, r.contacted, r.noContact, fmt(r.rate) + '%']),
  ));
  push('');
  push('_Top 30 worst combos shown. Full list in JSON._');
  push('');

  // 5
  push('## 5. No Contact Trend Over Time');
  push('');
  push(table(
    ['Month', 'Created', 'No Contact', 'Contact Rate'],
    monthRows.slice(-18).map(r => [r.month, r.created, r.noContact, fmt(r.rate) + '%']),
  ));
  push('');
  push(`**Trend:** last 6 months avg contact rate ${fmt(avgRecent)}%, prior 6 months ${fmt(avgPrior)}%. Delta: ${trendDelta > 0 ? '+' : ''}${fmt(trendDelta)} pts ${trendDelta > 1 ? '(improving)' : trendDelta < -1 ? '(declining)' : '(stable)'}.`);
  push('');
  push('_Caveat: recent months will look artificially good — leads created in the last ~30 days haven\'t aged enough to be marked No Contact (median time-to-NC is ${medDays} days)._'.replace('${medDays}', String(medDays)));
  push('');

  // 6
  push('## 6. Speed to No Contact');
  push('');
  push(`- Avg days from create → No Contact: **${fmt(avgDays)}**`);
  push(`- Median: **${medDays} days**`);
  push('');
  push(table(
    ['Bucket', 'Count', '% of No Contact'],
    Object.entries(buckets).map(([b, n]) => [b + ' days', n, fmt(pct(n, daysToNC.length)) + '%']),
  ));
  push('');

  // 7
  push('## 7. Phone Number Availability');
  push('');
  push('### No Contact leads:');
  push(`- Has phone (Mobile or Phone): **${ncPhone}** (${fmt(pct(ncPhone, noContact.length))}%)`);
  push(`- Has email only, no phone: **${ncEmailOnly}** (${fmt(pct(ncEmailOnly, noContact.length))}%)`);
  push(`- Has neither: **${ncNeither}** (${fmt(pct(ncNeither, noContact.length))}%)`);
  push('');
  push('### Contacted leads (comparison):');
  push(`- Has phone: **${cPhone}** (${fmt(pct(cPhone, contacted.length))}%)`);
  push(`- Has email only, no phone: **${cEmailOnly}** (${fmt(pct(cEmailOnly, contacted.length))}%)`);
  push(`- Has neither: **${cNeither}** (${fmt(pct(cNeither, contacted.length))}%)`);
  push('');
  const phoneGap = pct(ncPhone, noContact.length) - pct(cPhone, contacted.length);
  push(`**Phone-coverage gap (No Contact − Contacted): ${phoneGap > 0 ? '+' : ''}${fmt(phoneGap)} pts.** ${Math.abs(phoneGap) < 5 ? 'No meaningful gap — phone availability is similar in both groups, so missing phone numbers are NOT the cause of No Contact.' : phoneGap < 0 ? 'No Contact leads are LESS likely to have a phone — data quality at registration matters.' : 'No Contact leads are MORE likely to have a phone — they had contact info, the issue is response, not reachability.'}`);
  push('');

  // 8
  push('## 8. Where Do Contacted Leads End Up?');
  push('');
  push(`Of the **${contacted.length}** contacted leads:`);
  push('');
  push(table(
    ['Status', 'Count', '% of Contacted'],
    contactedRows.map(r => [r.status, r.count, fmt(r.pct) + '%']),
  ));
  push('');

  // 9
  push('## 9. Salvageable Leads');
  push('');
  push(`Criteria: created in last 120 days, from high-contact source OR country, has a phone number.`);
  push('');
  push(`**Salvageable: ${salvageable.length} leads**`);
  push('');
  push(`High-contact-rate sources used as filter: ${[...topSources].join(', ') || '—'}`);
  push(`High-contact-rate countries used as filter: ${[...topCountries].join(', ') || '—'}`);
  push('');
  if (salvageable.length > 0) {
    push('Top 20 sample:');
    push('');
    push(table(
      ['Name', 'Country', 'Source', 'Phone', 'Created'],
      salvageable
        .sort((a, b) => new Date(b.Created_Time) - new Date(a.Created_Time))
        .slice(0, 20)
        .map(l => [
          truncate(l.Full_Name, 25),
          truncate(l.Country || '?', 15),
          truncate(l.Lead_Source || '?', 18),
          truncate(l.Mobile || l.Phone || '', 18),
          new Date(l.Created_Time).toLocaleDateString('en-GB'),
        ]),
    ));
    push('');
  }

  // Print everything to console
  console.log(md.join('\n'));

  // ============================================================
  // CLAUDE INSIGHTS
  // ============================================================
  console.log('\n=== Requesting Claude analysis (Opus 4.7)... ===\n');

  const claudePrompt = `You are a sales operations analyst for Bryant Dental, a dental loupe company. Here is a comprehensive analysis of leads that went to "No Contact" — meaning the VA tried to reach them for 10 days and got zero response.

OVERALL:
Total leads: ${allLeads.length}
Contacted: ${contacted.length} (${fmt(contactRate)}%)
No Contact: ${noContact.length} (${fmt(dropRate)}%)

CONTACT RATE BY LEAD SOURCE (best to worst):
${table(['Source', 'Total', 'Contacted', 'NoContact', 'Rate'], sourceRows.map(r => [r.key, r.total, r.contacted, r.noContact, fmt(r.rate) + '%']))}

CONTACT RATE BY COUNTRY (best to worst, top 30):
${table(['Country', 'Total', 'Contacted', 'NoContact', 'Rate'], countryRows.slice(0, 30).map(r => [r.key, r.total, r.contacted, r.noContact, fmt(r.rate) + '%']))}

WORST SOURCE × COUNTRY COMBINATIONS (min 5 leads):
${table(['Combo', 'Total', 'Contacted', 'NoContact', 'Rate'], crossRows.slice(0, 25).map(r => [r.key, r.total, r.contacted, r.noContact, fmt(r.rate) + '%']))}

TREND BY MONTH (last 18):
${table(['Month', 'Created', 'NoContact', 'ContactRate'], monthRows.slice(-18).map(r => [r.month, r.created, r.noContact, fmt(r.rate) + '%']))}

Last 6 months avg contact rate ${fmt(avgRecent)}%, prior 6 months ${fmt(avgPrior)}%. Delta ${trendDelta > 0 ? '+' : ''}${fmt(trendDelta)} pts.

SPEED TO NO CONTACT:
Avg ${fmt(avgDays)} days, median ${medDays} days
${Object.entries(buckets).map(([b, n]) => `  ${b} days: ${n} (${fmt(pct(n, daysToNC.length))}%)`).join('\n')}

PHONE NUMBER COVERAGE:
No Contact leads with phone: ${ncPhone}/${noContact.length} (${fmt(pct(ncPhone, noContact.length))}%)
Contacted leads with phone:  ${cPhone}/${contacted.length} (${fmt(pct(cPhone, contacted.length))}%)
Phone-coverage gap: ${fmt(phoneGap)} pts.

WHERE CONTACTED LEADS END UP:
${table(['Status', 'Count', '%'], contactedRows.map(r => [r.status, r.count, fmt(r.pct) + '%']))}

SALVAGEABLE COUNT: ${salvageable.length} (last 120 days, high-contact source/country, has phone)

Provide:
1. The single biggest pattern explaining why leads go to No Contact
2. Which lead sources are producing unreachable leads (waste of ad spend)?
3. Which lead sources are producing reachable leads (invest more)?
4. Which countries respond best vs worst?
5. Are things getting better or worse over time?
6. Is this a lead quality problem (wrong leads) or a process problem (not contacting fast enough)?
7. Specific recommendations: what 3 changes would reduce the No Contact rate the most?
8. How many salvageable leads exist and is a re-engagement campaign worth it?

Be brutally specific with numbers. No generic advice. If Instagram US leads have a 31% contact rate, say that.`;

  let aiText = '';
  try {
    aiText = await askClaude(claudePrompt);
    console.log(aiText);
  } catch (err) {
    aiText = `Claude analysis failed: ${err.message}`;
    console.error(aiText);
  }

  // Append AI section
  md.push('');
  md.push('---');
  md.push('');
  md.push('## AI Insights (Claude Opus 4.7)');
  md.push('');
  md.push(aiText);
  md.push('');

  // Save report + JSON + PDF
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'analysis-no-contact-report.md');
  const jsonPath = path.join(outDir, 'analysis-no-contact-report.json');
  const pdfPath = path.join(outDir, 'analysis-no-contact-report.pdf');
  const htmlPath = path.join(outDir, 'analysis-no-contact-report.html');
  fs.writeFileSync(mdPath, md.join('\n'), 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generated: now.toISOString(),
    overall: { total: allLeads.length, contacted: contacted.length, noContact: noContact.length, contactRate, dropRate },
    bySource: sourceRows,
    byCountry: countryRows,
    crossSourceCountry: crossRows,
    byMonth: monthRows,
    trend: { recent6: avgRecent, prior6: avgPrior, delta: trendDelta },
    speed: { avg: avgDays, median: medDays, distribution: buckets },
    phoneCoverage: {
      noContact: { hasPhone: ncPhone, emailOnly: ncEmailOnly, neither: ncNeither },
      contacted: { hasPhone: cPhone, emailOnly: cEmailOnly, neither: cNeither },
      gapPoints: phoneGap,
    },
    contactedOutcomes: contactedRows,
    salvageable: {
      count: salvageable.length,
      topSources: [...topSources],
      topCountries: [...topCountries],
      sample: salvageable.slice(0, 100).map(l => ({
        name: l.Full_Name, email: l.Email, phone: l.Mobile || l.Phone,
        country: l.Country, source: l.Lead_Source, created: l.Created_Time,
      })),
    },
  }, null, 2), 'utf-8');

  // Render HTML + PDF
  console.log('\n=== Rendering professional PDF... ===');
  const html = renderHtmlReport({
    generated: now.toISOString(),
    allLeadsCount: allLeads.length, contactedCount: contacted.length, noContactCount: noContact.length,
    contactRate, dropRate, noContactDash,
    sourceRows, countryRows, crossRows, monthRows,
    avgRecent, avgPrior, trendDelta,
    avgDays, medDays, buckets, daysToNCLen: daysToNC.length,
    ncPhone, ncEmailOnly, ncNeither, cPhone, cEmailOnly, cNeither, phoneGap,
    contactedRows,
    salvageable: salvageable.sort((a, b) => new Date(b.Created_Time) - new Date(a.Created_Time)),
    topSources: [...topSources], topCountries: [...topCountries],
    aiText,
  });
  fs.writeFileSync(htmlPath, html, 'utf-8');
  const pdfOk = await renderPdf(html, pdfPath);

  console.log('\nReports saved to /data/ — PDF, Markdown, and JSON');
  console.log(`  ✓ Markdown: ${mdPath}`);
  console.log(`  ✓ JSON:     ${jsonPath}`);
  console.log(`  ✓ HTML:     ${htmlPath}`);
  console.log(`  ${pdfOk ? '✓' : '✗'} PDF:      ${pdfPath}${pdfOk ? '' : ' (skipped — puppeteer error)'}`);
  console.log(`\nElapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
