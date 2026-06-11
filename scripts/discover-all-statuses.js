// Pure discovery: enumerate every unique Status, Owner, Lead_Source, and
// Country across the entire Zoho Leads module. No filtering, no analysis.
//
// Run: node scripts/discover-all-statuses.js

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const sep = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const fmtRow = (r) => '| ' + r.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ') + ' |';
  return [fmtRow(headers), sep, ...rows.map(fmtRow)].join('\n');
}

async function getToken() {
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
  const res = await fetch(`${api}${p}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 204) return { data: [], info: { more_records: false } };
  const text = await res.text();
  if (!text) return { data: [], info: { more_records: false } };
  try { return JSON.parse(text); } catch { return { data: [], info: { more_records: false } }; }
}

async function fetchAllLeads(token) {
  const all = [];
  for (let page = 1; page <= 500; page++) {
    const data = await zohoFetch(token, `/crm/v6/Leads?fields=Status,Owner,Lead_Source,Country&per_page=200&page=${page}`);
    const rows = data.data || [];
    all.push(...rows);
    process.stdout.write(`\r  Fetched ${all.length}...`);
    if (!data.info?.more_records) break;
    await sleep(100);
  }
  process.stdout.write('\n');
  return all;
}

function tally(items, accessor) {
  const map = new Map();
  for (const it of items) {
    const v = accessor(it);
    const k = (v === null || v === undefined || v === '') ? '(none)' : v;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n]);
}

(async () => {
  const t0 = Date.now();
  console.log('=== Zoho CRM Raw Discovery ===\n');

  console.log('[1/2] Authenticating...');
  const token = await getToken();

  console.log('[2/2] Fetching every lead (Status, Owner, Lead_Source, Country)...');
  const leads = await fetchAllLeads(token);
  console.log(`  Total leads fetched: ${leads.length}\n`);

  const byStatus = tally(leads, l => l.Status);
  const byOwner  = tally(leads, l => l.Owner?.name);
  const bySource = tally(leads, l => l.Lead_Source);
  const byCountry = tally(leads, l => l.Country);

  const md = [];
  const push = (s) => md.push(s);

  push('# Zoho CRM — Raw Discovery');
  push('');
  push(`Generated: ${new Date().toISOString()}`);
  push(`Total leads in system: **${leads.length.toLocaleString()}**`);
  push('');

  push('## Table 1: Every Unique Status');
  push('');
  push(table(['Status', 'Count'], byStatus));
  push('');

  push('## Table 2: Every Unique Owner');
  push('');
  push(table(['Owner', 'Count'], byOwner));
  push('');

  push('## Table 3: Every Unique Lead Source');
  push('');
  push(table(['Lead Source', 'Count'], bySource));
  push('');

  push('## Table 4: Every Unique Country');
  push('');
  push(table(['Country', 'Count'], byCountry));
  push('');

  push(`## Table 5: Total leads in the system: **${leads.length.toLocaleString()}**`);
  push('');
  push(`(Statuses: ${byStatus.length} unique · Owners: ${byOwner.length} unique · Sources: ${bySource.length} unique · Countries: ${byCountry.length} unique)`);
  push('');

  console.log(md.join('\n'));

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'crm-raw-discovery.md');
  fs.writeFileSync(outPath, md.join('\n'), 'utf-8');

  console.log(`\n✓ Saved: ${outPath}`);
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
