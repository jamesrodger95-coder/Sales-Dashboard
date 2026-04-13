// Shared data engine — SINGLE SOURCE OF TRUTH for all dashboard components
// Every page, API route, chatbot, and briefing MUST use these functions

import {
  fetchAllJamesLeads, fetchAllJamesDeals, isZohoConfigured,
  getDealValue, getLeadPhone, getMfgStatus,
  categorizeLeadStatus,
  ZohoLead, ZohoDeal,
} from './zoho-client';

// ============================================================
// ATTENTION ITEMS — one function, used everywhere
// ============================================================

export interface AttentionItem {
  name: string;
  stage: string;
  days: number;
  priority: 'red' | 'amber';
  action: string;
  email?: string | null;
  phone?: string | null;
  type: 'lead' | 'deal' | 'manufacturing';
}

export function getAttentionNeeded(leads: ZohoLead[], deals: ZohoDeal[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  const nowMs = Date.now();

  // Build email set of people who already have deals (skip them in lead follow-ups)
  const dealEmails = new Set<string>();
  deals.forEach(d => { if (d.Email) dealEmails.add(d.Email.toLowerCase()); });

  // PRE-PURCHASE LEADS
  leads.forEach(l => {
    const days = Math.floor((nowMs - new Date(l.Modified_Time).getTime()) / 86400000);
    const phone = getLeadPhone(l);
    const cat = categorizeLeadStatus(l.Status);

    // Skip: purchased, lost, gone_cold (already dead), or has a Deal
    if (['purchased', 'lost', 'gone_cold'].includes(cat)) return;
    if (l.Email && dealEmails.has(l.Email.toLowerCase())) return;

    // Registered: only if created in last 14 days AND over 24 hours
    if ((!l.Status || l.Status === 'Registered' || l.Status === 'Not Contacted' || l.Status === '-None-') && days > 1 && days <= 14) {
      items.push({ name: l.Full_Name, stage: 'Registered', days, priority: 'red', action: 'VA needs to contact', email: l.Email, phone, type: 'lead' });
    }
    // FCM: only if in stage less than 30 days AND over 7 days
    else if (l.Status === 'First Contact Made' && days > 7 && days <= 30) {
      items.push({ name: l.Full_Name, stage: 'FCM', days, priority: days > 10 ? 'red' : 'amber', action: 'Follow up — approaching no-contact deadline', email: l.Email, phone, type: 'lead' });
    }
    // VDC: only if in stage less than 60 days AND over 7 days
    else if ((l.Status === 'Virtual Demo Completed' || l.Status === 'Demo Completed') && days > 7 && days <= 60) {
      items.push({ name: l.Full_Name, stage: 'VDC', days, priority: days > 14 ? 'red' : 'amber', action: 'Decision pending — follow up', email: l.Email, phone, type: 'lead' });
    }
    // No Show: only if moved in last 30 days
    else if (l.Status === 'No Show' && days <= 30) {
      items.push({ name: l.Full_Name, stage: 'No Show', days, priority: 'red', action: 'Rebook demo', email: l.Email, phone, type: 'lead' });
    }
  });

  // POST-PURCHASE DEALS
  deals.forEach(d => {
    const days = Math.floor((nowMs - new Date(d.Modified_Time).getTime()) / 86400000);

    // Awaiting Measurements: show ALL over 7 days
    if (d.Stage === 'Awaiting Measurements' && days > 7) {
      items.push({ name: d.Deal_Name, stage: 'Awaiting Meas.', days, priority: days > 10 ? 'red' : 'amber', action: 'Remind about measurements — ' + days + ' days', email: d.Email, phone: d.Phone, type: 'deal' });
    }
    // Measurement Final Checks: show ALL over 3 days
    if (d.Stage === 'Measurements Final Checks' && days > 3) {
      items.push({ name: d.Deal_Name, stage: 'Final Checks', days, priority: days > 5 ? 'red' : 'amber', action: 'Check measurement issue', email: d.Email, phone: d.Phone, type: 'deal' });
    }
    // Measurement Issues: always show
    if (d.Stage === 'Measurement Issues') {
      items.push({ name: d.Deal_Name, stage: 'Meas. Issues', days, priority: 'amber', action: 'Resolve measurement issue', email: d.Email, phone: d.Phone, type: 'deal' });
    }
  });

  // MANUFACTURING — overdue and approaching based on product timeline
  deals.filter(d => d.Stage === 'In Manufacturing').forEach(d => {
    const m = getMfgStatus(d);
    if (m.status === 'overdue') {
      items.push({
        name: d.Deal_Name,
        stage: `${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks}`,
        days: m.weeksElapsed * 7,
        priority: 'red',
        action: `${m.product} overdue by ${m.weeksElapsed - m.targetWeeks} weeks — update customer`,
        email: d.Email, phone: d.Phone, type: 'manufacturing',
      });
    } else if (m.status === 'approaching') {
      items.push({
        name: d.Deal_Name,
        stage: `${m.product} Wk ${m.weeksElapsed}/${m.targetWeeks}`,
        days: m.weeksElapsed * 7,
        priority: 'amber',
        action: `${m.product} approaching deadline — prepare update`,
        email: d.Email, phone: d.Phone, type: 'manufacturing',
      });
    }
  });

  // Sort: red first, then amber. Within each, most days first.
  items.sort((a, b) => {
    if (a.priority === 'red' && b.priority !== 'red') return -1;
    if (a.priority !== 'red' && b.priority === 'red') return 1;
    return b.days - a.days;
  });

  return items;
}

// ============================================================
// MANUFACTURING STATUS — one function, used everywhere
// ============================================================

export interface ManufacturingOrder {
  name: string;
  product: string;
  weeksElapsed: number;
  targetWeeks: number;
  status: 'on_track' | 'approaching' | 'overdue';
  overdueBy: number;
  country: string | null;
  value: number;
  email: string | null;
  phone: string | null;
}

export function getManufacturingOrders(deals: ZohoDeal[]): ManufacturingOrder[] {
  return deals
    .filter(d => d.Stage === 'In Manufacturing')
    .map(d => {
      const m = getMfgStatus(d);
      return {
        name: d.Deal_Name,
        product: m.product,
        weeksElapsed: m.weeksElapsed,
        targetWeeks: m.targetWeeks,
        status: m.status,
        overdueBy: Math.max(0, m.weeksElapsed - m.targetWeeks),
        country: d.Country,
        value: getDealValue(d),
        email: d.Email,
        phone: d.Phone,
      };
    });
}

export function getManufacturingSummary(deals: ZohoDeal[]): { total: number; onTrack: number; approaching: number; overdue: number; orders: ManufacturingOrder[] } {
  const orders = getManufacturingOrders(deals);
  return {
    total: orders.length,
    onTrack: orders.filter(o => o.status === 'on_track').length,
    approaching: orders.filter(o => o.status === 'approaching').length,
    overdue: orders.filter(o => o.status === 'overdue').length,
    orders,
  };
}

// ============================================================
// PIPELINE SUMMARY — one function, used everywhere
// ============================================================

export function getPipelineCounts(leads: ZohoLead[], deals: ZohoDeal[]): {
  leadStages: Record<string, number>;
  dealStages: Record<string, number>;
  activeLeads: number;
  activePipelineValue: number;
} {
  const nowMs = Date.now();
  const D30 = 30 * 86400000;
  const D60 = 60 * 86400000;

  // Recent leads only
  const leadStages: Record<string, number> = {};
  let activeLeads = 0;
  leads.forEach(l => {
    const stageAge = nowMs - new Date(l.Modified_Time).getTime();
    const cat = categorizeLeadStatus(l.Status);
    if (cat === 'pre_purchase' && stageAge <= D30) { activeLeads++; const s = l.Status || 'No Status'; leadStages[s] = (leadStages[s] || 0) + 1; }
    else if (cat === 'demo_done' && stageAge <= D60) { activeLeads++; const s = l.Status || 'VDC'; leadStages[s] = (leadStages[s] || 0) + 1; }
    else if (cat === 'no_show' && stageAge <= D30) { const s = 'No Show'; leadStages[s] = (leadStages[s] || 0) + 1; }
  });

  // Active deals
  const activeOrderStages = ['Awaiting Measurements', 'Measurements Final Checks', 'Measurement Issues', 'In Manufacturing', 'Order Assembled', 'Order Ready to Send', 'Address Confirmed', 'Pending Payment Authorisation', 'Customers Not Ordered', 'Prescription Ordered'];
  const dealStages: Record<string, number> = {};
  let activePipelineValue = 0;
  deals.filter(d => activeOrderStages.includes(d.Stage)).forEach(d => {
    dealStages[d.Stage] = (dealStages[d.Stage] || 0) + 1;
    activePipelineValue += getDealValue(d);
  });

  return { leadStages, dealStages, activeLeads, activePipelineValue };
}

// ============================================================
// CONVERSION — one function, used everywhere
// ============================================================

export function getConversionStats(
  calls: { email: string }[],
  leadsByEmail: Map<string, ZohoLead>,
  dealsByEmail: Map<string, ZohoDeal>,
): { ordered: number; demoDone: number; showedUp: number; convRate: number } {
  let ordered = 0, demoDone = 0;
  calls.forEach(c => {
    const email = c.email?.toLowerCase();
    if (!email) return;
    if (dealsByEmail.has(email)) { ordered++; return; }
    const lead = leadsByEmail.get(email);
    if (lead?.Status === 'Purchased') { ordered++; return; }
    if (lead?.Status === 'Virtual Demo Completed' || lead?.Status === 'Demo Completed') { demoDone++; }
  });
  const showedUp = ordered + demoDone;
  return { ordered, demoDone, showedUp, convRate: showedUp > 0 ? Math.round((ordered / showedUp) * 100) : 0 };
}

// ============================================================
// FULL DATA FETCH — cached, used by dashboard API
// ============================================================

export async function fetchAllData() {
  const leads = isZohoConfigured() ? await fetchAllJamesLeads() : [];
  const deals = isZohoConfigured() ? await fetchAllJamesDeals() : [];
  return { leads, deals, zohoConnected: isZohoConfigured() };
}
