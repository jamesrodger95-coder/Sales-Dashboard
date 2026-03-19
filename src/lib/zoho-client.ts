// Zoho CRM API client with token caching and auto-refresh

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
      method: 'POST',
      cache: 'no-store',
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
    tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 minutes
    console.log('[Zoho] Got token:', data.access_token?.substring(0, 20) + '...');
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
    cachedToken = null;
    tokenExpiry = 0;
    const newToken = await getAccessToken();
    const retry = await fetch(`${apiDomain}${path}`, {
      cache: 'no-store',
      headers: { 'Authorization': `Zoho-oauthtoken ${newToken}` },
    });
    return retry.json() as Promise<Record<string, unknown>>;
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// --- Types ---

export interface ZohoLead {
  id: string;
  Full_Name: string;
  Email: string | null;
  Phone: string | null;
  Lead_Status: string | null;
  Country: string | null;
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
  Magnification: string | null;
  Lighting_Selection: string | null;
  Created_Time: string;
  Modified_Time: string;
  Owner: { name: string; id: string; email: string };
}

// --- Pipeline stage classification ---

export const PRE_PURCHASE_STAGES = [
  'Customers Not Ordered',
  'Confirmed Awaiting Mandate',
  'Pending Payment Authorisation',
  'Trial Requested',
  'Trial Sent',
  'Preorder Placed',
  'Order Placed',
];

export const IN_PRODUCTION_STAGES = [
  'Awaiting Measurements',
  'Measurements Final Checks',
  'Measurement Issues',
  'Awaiting Customisation',
  'Prescription to Order',
  'Prescription Ordered',
  'Awaiting Prescription',
  'In Manufacturing',
  'Order Assembled',
  'Order Ready to Send',
  'Address Confirmed',
];

export const SHIPPED_STAGES = [
  'Dispatched',
  'Order Dispatched to Customer',
  'Order Dispatched to Australia',
  'Partially Fulfilled',
  'Fulfilled',
];

export const POST_DELIVERY_STAGES = [
  'Pending Fit Call',
  'Fit not confirmed - customer trialling',
  'Loupes Fit',
  'Customer Happy',
  'Customer Unhappy',
  'Loupes do not Fit - Pending Repair Submission',
  'First Repair Raised',
  'Second Repair Raised',
  'No Response from Customer',
];

export const PROBLEM_STAGES = [
  'LATE',
  'Unsold Returned',
  'Order Refunded',
  'Refunded',
  'Old',
  'Not Dispatched By Post',
];

export type StageCategory = 'pre_purchase' | 'in_production' | 'shipped' | 'post_delivery' | 'problem' | 'other';

export function categorizeStage(stage: string): StageCategory {
  if (PRE_PURCHASE_STAGES.includes(stage)) return 'pre_purchase';
  if (IN_PRODUCTION_STAGES.includes(stage)) return 'in_production';
  if (SHIPPED_STAGES.includes(stage)) return 'shipped';
  if (POST_DELIVERY_STAGES.includes(stage)) return 'post_delivery';
  if (PROBLEM_STAGES.includes(stage)) return 'problem';
  return 'other';
}

// --- Fetch functions ---

export async function fetchJamesLeads(page = 1, perPage = 200): Promise<{ leads: ZohoLead[]; more: boolean; total: number }> {
  const data = await zohoFetch(
    `/crm/v6/Leads/search?criteria=(Owner.name:equals:James Rodger)&fields=Full_Name,Email,Phone,Lead_Status,Country,Created_Time,Modified_Time,Owner&per_page=${perPage}&page=${page}`
  );
  const leads = (data.data as ZohoLead[] | undefined) || [];
  const info = data.info as { more_records?: boolean; count?: number } | undefined;
  return { leads, more: !!info?.more_records, total: info?.count || leads.length };
}

export async function fetchAllJamesLeads(): Promise<ZohoLead[]> {
  const all: ZohoLead[] = [];
  let page = 1;
  let more = true;
  while (more && page <= 15) {
    const { leads, more: hasMore } = await fetchJamesLeads(page, 200);
    all.push(...leads);
    more = hasMore;
    page++;
  }
  console.log(`[Zoho] Fetched ${all.length} leads for James`);
  return all;
}

export async function fetchJamesDeals(page = 1, perPage = 200): Promise<{ deals: ZohoDeal[]; more: boolean; total: number }> {
  const data = await zohoFetch(
    `/crm/v6/Deals/search?criteria=(Owner.name:equals:James Rodger)&fields=Deal_Name,Stage,Email,Phone,Country,Total_Order_Value,Contact_Name,Pipeline,Magnification,Lighting_Selection,Created_Time,Modified_Time,Owner&per_page=${perPage}&page=${page}`
  );
  const deals = (data.deals as ZohoDeal[] | undefined) || (data.data as ZohoDeal[] | undefined) || [];
  const info = data.info as { more_records?: boolean; count?: number } | undefined;
  return { deals, more: !!info?.more_records, total: info?.count || deals.length };
}

export async function fetchAllJamesDeals(): Promise<ZohoDeal[]> {
  const all: ZohoDeal[] = [];
  let page = 1;
  let more = true;
  while (more && page <= 15) {
    const { deals, more: hasMore } = await fetchJamesDeals(page, 200);
    all.push(...deals);
    more = hasMore;
    page++;
  }
  console.log(`[Zoho] Fetched ${all.length} deals for James`);
  return all;
}

export function getDealValue(deal: ZohoDeal): number {
  const val = deal.Total_Order_Value;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

export function isZohoConfigured(): boolean {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}
