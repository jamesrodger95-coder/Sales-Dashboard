// Zoho CRM API client — verified field names and stages

let cachedToken: string | null = null;
let tokenExpiry = 0;
let tokenPromise: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const authDomain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';
    console.log('[Zoho] Refreshing access token...');
    const res = await fetch(`${authDomain}/oauth/v2/token`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID || '',
        client_secret: process.env.ZOHO_CLIENT_SECRET || '',
        refresh_token: process.env.ZOHO_REFRESH_TOKEN || '',
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Zoho auth: ${data.error}`);
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + 50 * 60 * 1000;
    console.log('[Zoho] Got token');
    return data.access_token;
  })();

  try { return await tokenPromise; }
  finally { tokenPromise = null; }
}

async function zohoFetch(path: string): Promise<Record<string, unknown>> {
  const apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  const token = await getAccessToken();
  const res = await fetch(`${apiDomain}${path}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 401) {
    cachedToken = null; tokenExpiry = 0;
    const newToken = await getAccessToken();
    return (await fetch(`${apiDomain}${path}`, {
      cache: 'no-store', headers: { 'Authorization': `Zoho-oauthtoken ${newToken}` },
    })).json() as Promise<Record<string, unknown>>;
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// --- Types (verified field names) ---

export interface ZohoLead {
  id: string;
  Full_Name: string;
  Email: string | null;
  Mobile: string | null;
  Phone: string | null;
  Status: string | null;        // "Status" field, NOT "Lead_Status"
  Country: string | null;
  City: string | null;
  Created_Time: string;
  Modified_Time: string;
  Owner: { name: string; id: string; email: string };
}

export interface ZohoDeal {
  id: string;
  Deal_Name: string;
  Stage: string;
  Email: string | null;
  Phone: string | null;
  Country: string | null;
  Total_Order_Value: number | string | null;
  Contact_Name: { name: string; id: string } | null;
  Pipeline: string | null;
  Refractive_Magnification: string | null;
  Lighting_Selection: string | null;
  Loupes_Type: string | null;
  Payment_Authorisation_Date: string | null;
  Delivery_Window: string | null;
  Created_Time: string;
  Modified_Time: string;
  Owner: { name: string; id: string; email: string };
}

// --- Stage definitions (from actual Zoho data) ---

// Lead statuses with real counts (total ~2000 for James)
export const LEAD_PRE_PURCHASE = ['First Contact Made', 'Virtual Demo Booked'];
export const LEAD_DEMO_DONE = ['Virtual Demo Completed', 'Demo Completed'];
export const LEAD_PURCHASED = ['Purchased'];
export const LEAD_NO_SHOW = ['No Show'];
export const LEAD_GONE_COLD = ['No Contact From Customer', 'No Contact', 'No Contact -'];
export const LEAD_LOST = ['Customer Said No', 'Not a Lead', 'Dead Lead'];

// Deal stages (from actual Zoho data — ~885 for James)
export const DEAL_AWAITING = ['Awaiting Measurements', 'Pending Payment Authorisation', 'Customers Not Ordered'];
export const DEAL_IN_PROGRESS = ['Measurement Issues', 'Measurements Final Checks', 'Prescription Ordered', 'In Manufacturing', 'Order Assembled'];
export const DEAL_READY = ['Address Confirmed', 'Order Ready to Send'];
export const DEAL_SHIPPED = ['Order Dispatched to Customer', 'Not Dispatched By Post'];
export const DEAL_POST_DELIVERY = ['Order Arrived', 'Pending Fit Call', 'Fit not confirmed - customer trialling', 'Loupes Fit', 'No Response from Customer', 'First Repair Raised', 'Second Repair Raised'];
export const DEAL_PROBLEM = ['Order Refunded', 'LATE', 'Unsold Returned'];

export type LeadCategory = 'pre_purchase' | 'demo_done' | 'purchased' | 'no_show' | 'gone_cold' | 'lost' | 'unknown';
export type DealCategory = 'awaiting' | 'in_progress' | 'ready' | 'shipped' | 'post_delivery' | 'problem' | 'other';

export function categorizeLeadStatus(status: string | null): LeadCategory {
  if (!status || status === '-None-' || status === 'Registered' || status === 'Not Contacted' || status === 'Booked In') return 'pre_purchase';
  if (LEAD_PRE_PURCHASE.includes(status)) return 'pre_purchase';
  if (LEAD_DEMO_DONE.includes(status)) return 'demo_done';
  if (LEAD_PURCHASED.includes(status)) return 'purchased';
  if (LEAD_NO_SHOW.includes(status)) return 'no_show';
  if (LEAD_GONE_COLD.includes(status)) return 'gone_cold';
  if (LEAD_LOST.includes(status)) return 'lost';
  return 'unknown';
}

export function categorizeDealStage(stage: string): DealCategory {
  if (DEAL_AWAITING.includes(stage)) return 'awaiting';
  if (DEAL_IN_PROGRESS.includes(stage)) return 'in_progress';
  if (DEAL_READY.includes(stage)) return 'ready';
  if (DEAL_SHIPPED.includes(stage)) return 'shipped';
  if (DEAL_POST_DELIVERY.includes(stage)) return 'post_delivery';
  if (DEAL_PROBLEM.includes(stage)) return 'problem';
  return 'other';
}

// --- Data caching (5 minutes) ---

interface CacheEntry<T> { data: T; expiry: number; }
let leadsCache: CacheEntry<ZohoLead[]> | null = null;
let dealsCache: CacheEntry<ZohoDeal[]> | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export function clearZohoCache() { leadsCache = null; dealsCache = null; }

// --- Fetch functions ---

const LEAD_FIELDS = 'Full_Name,Email,Mobile,Phone,Status,Country,City,Created_Time,Modified_Time,Owner';
const DEAL_FIELDS = 'Deal_Name,Stage,Email,Phone,Country,Total_Order_Value,Contact_Name,Pipeline,Refractive_Magnification,Lighting_Selection,Loupes_Type,Payment_Authorisation_Date,Delivery_Window,Created_Time,Modified_Time,Owner';

export async function fetchAllJamesLeads(): Promise<ZohoLead[]> {
  if (leadsCache && Date.now() < leadsCache.expiry) return leadsCache.data;
  const all: ZohoLead[] = [];
  let page = 1, more = true;
  while (more && page <= 15) {
    const data = await zohoFetch(`/crm/v6/Leads/search?criteria=(Owner.name:equals:James Rodger)&fields=${LEAD_FIELDS}&per_page=200&page=${page}`);
    const leads = (data.data as ZohoLead[] | undefined) || [];
    all.push(...leads);
    more = !!(data.info as { more_records?: boolean } | undefined)?.more_records;
    page++;
  }
  console.log(`[Zoho] Fetched ${all.length} leads (cached 5m)`);
  leadsCache = { data: all, expiry: Date.now() + CACHE_TTL };
  return all;
}

export async function fetchAllJamesDeals(): Promise<ZohoDeal[]> {
  if (dealsCache && Date.now() < dealsCache.expiry) return dealsCache.data;
  const all: ZohoDeal[] = [];
  let page = 1, more = true;
  while (more && page <= 10) {
    const data = await zohoFetch(`/crm/v6/Deals/search?criteria=(Owner.name:equals:James Rodger)&fields=${DEAL_FIELDS}&per_page=200&page=${page}`);
    const deals = (data.data as ZohoDeal[] | undefined) || [];
    all.push(...deals);
    more = !!(data.info as { more_records?: boolean } | undefined)?.more_records;
    page++;
  }
  console.log(`[Zoho] Fetched ${all.length} deals (cached 5m)`);
  dealsCache = { data: all, expiry: Date.now() + CACHE_TTL };
  return all;
}

// --- Month filtering helpers ---

export function isInMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export function filterLeadsByStatusAndMonth(leads: ZohoLead[], status: string, year: number, month: number): ZohoLead[] {
  return leads.filter(l => l.Status === status && isInMonth(l.Modified_Time, year, month));
}

export function filterDealsByStageAndMonth(deals: ZohoDeal[], stage: string | string[], year: number, month: number): ZohoDeal[] {
  const stages = Array.isArray(stage) ? stage : [stage];
  return deals.filter(d => stages.includes(d.Stage) && isInMonth(d.Modified_Time, year, month));
}

export function currentAtStage(leads: ZohoLead[], status: string): ZohoLead[] {
  return leads.filter(l => l.Status === status);
}

export function currentDealsAtStage(deals: ZohoDeal[], stages: string[]): ZohoDeal[] {
  return deals.filter(d => stages.includes(d.Stage));
}

export function getDealValue(deal: ZohoDeal): number {
  const val = deal.Total_Order_Value;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

// --- Manufacturing timeline ---

export function getProductType(deal: ZohoDeal): string {
  const mag = deal.Refractive_Magnification;
  if (!mag || mag === '-None-') return 'Unknown';
  if (mag === 'MagniFlex') return 'MagniFlex';
  return `${mag} Refractive`;
}

export function getTargetWeeks(deal: ZohoDeal): number {
  const mag = deal.Refractive_Magnification;
  if (mag === 'MagniFlex') return 20;
  return 12; // All Refractive models
}

export function getMfgWeeksElapsed(deal: ZohoDeal): number {
  const startDate = deal.Payment_Authorisation_Date || deal.Created_Time;
  if (!startDate) return 0;
  const days = Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000);
  return Math.floor(days / 7);
}

export type MfgStatus = 'on_track' | 'approaching' | 'overdue';

export function getMfgStatus(deal: ZohoDeal): { status: MfgStatus; weeksElapsed: number; targetWeeks: number; product: string } {
  const target = getTargetWeeks(deal);
  const elapsed = getMfgWeeksElapsed(deal);
  const product = getProductType(deal);
  const warnAt = target - 2;

  let status: MfgStatus = 'on_track';
  if (elapsed >= target) status = 'overdue';
  else if (elapsed >= warnAt) status = 'approaching';

  return { status, weeksElapsed: elapsed, targetWeeks: target, product };
}

export function getLeadPhone(lead: ZohoLead): string | null {
  return lead.Mobile || lead.Phone || null;
}

export function isZohoConfigured(): boolean {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

// --- Cross-referencing helpers ---

export type CrmMatchStatus = 'ordered' | 'in_pipeline' | 'demo_done' | 'no_show' | 'gone_cold' | 'direct_booking' | 'pending';

export function matchEmailToCrm(
  email: string,
  leadsByEmail: Map<string, ZohoLead>,
  dealsByEmail: Map<string, ZohoDeal>,
  daysSinceCall: number
): { status: CrmMatchStatus; stage: string | null; value: number | null } {
  const e = email.toLowerCase();

  // Check deals first (they ordered)
  const deal = dealsByEmail.get(e);
  if (deal) {
    const cat = categorizeDealStage(deal.Stage);
    if (['shipped', 'post_delivery', 'ready'].includes(cat)) {
      return { status: 'ordered', stage: deal.Stage, value: getDealValue(deal) };
    }
    return { status: 'in_pipeline', stage: deal.Stage, value: getDealValue(deal) };
  }

  // Check leads
  const lead = leadsByEmail.get(e);
  if (lead) {
    const cat = categorizeLeadStatus(lead.Status);
    if (cat === 'purchased') return { status: 'ordered', stage: 'Purchased', value: null };
    if (cat === 'demo_done') return { status: 'demo_done', stage: lead.Status, value: null };
    if (cat === 'no_show') return { status: 'no_show', stage: 'No Show', value: null };
    if (cat === 'gone_cold') return { status: 'gone_cold', stage: lead.Status, value: null };
    return { status: 'in_pipeline', stage: lead.Status || 'Registered', value: null };
  }

  // Not in CRM at all
  if (daysSinceCall <= 30) return { status: 'pending', stage: null, value: null };
  return { status: 'direct_booking', stage: null, value: null };
}

export function buildEmailMaps(leads: ZohoLead[], deals: ZohoDeal[]): {
  leadsByEmail: Map<string, ZohoLead>;
  dealsByEmail: Map<string, ZohoDeal>;
} {
  const leadsByEmail = new Map<string, ZohoLead>();
  leads.forEach(l => { if (l.Email) leadsByEmail.set(l.Email.toLowerCase(), l); });
  const dealsByEmail = new Map<string, ZohoDeal>();
  deals.forEach(d => { if (d.Email) dealsByEmail.set(d.Email.toLowerCase(), d); });
  return { leadsByEmail, dealsByEmail };
}
