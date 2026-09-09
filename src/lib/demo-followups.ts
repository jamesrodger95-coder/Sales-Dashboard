// ============================================================================
// Daily "Virtual Demo Completed" follow-up report.
//
// Two buckets, both filtered to leads still sitting in Virtual Demo Completed:
//   FRESH  — moved into the status within the last 14 days. Still warm, chase now.
//   AGEING — older than 14 days but within 3 months. At risk of going cold.
//
// Every row carries a wa.me link so James can open WhatsApp straight from the
// email on his phone.
//
// Date basis: Zoho Leads carry no stage-history field the way Deals do, so
// Modified_Time is used as the proxy for "when it landed in this status". It is
// the closest signal available without a per-lead history call (~2000 leads,
// far too slow for a cron). Rows say "updated Nd ago" rather than claiming to
// be the exact stage-entry date.
// ============================================================================

import { fetchAllJamesLeads, getLeadPhone, type ZohoLead } from '@/lib/zoho-client';

const FRESH_DAYS = 14;
const AGEING_DAYS = 90;

// Only this status — "Demo Completed" is a separate (in-person) status and
// James asked specifically for Virtual Demo Completed.
const TARGET_STATUS = 'Virtual Demo Completed';

// Dial codes for the countries that actually appear in James's lead data, used
// to repair locally-formatted numbers ("07712..." -> "447712..."). Numbers that
// already carry a country code are left alone.
const DIAL_CODES: Record<string, string> = {
  'united kingdom': '44', 'uk': '44', 'great britain': '44', 'england': '44',
  'scotland': '44', 'wales': '44', 'northern ireland': '44',
  'ireland': '353', 'republic of ireland': '353',
  'united states': '1', 'usa': '1', 'us': '1', 'america': '1',
  'north america': '1', 'canada': '1',
  'germany': '49', 'france': '33', 'spain': '34', 'italy': '39',
  'netherlands': '31', 'belgium': '32', 'switzerland': '41', 'austria': '43',
  'sweden': '46', 'norway': '47', 'denmark': '45', 'finland': '358',
  'portugal': '351', 'poland': '48', 'czech republic': '420', 'greece': '30',
  'australia': '61', 'new zealand': '64', 'south africa': '27',
  'united arab emirates': '971', 'uae': '971', 'saudi arabia': '966',
  'qatar': '974', 'kuwait': '965', 'bahrain': '973', 'oman': '968',
  'india': '91', 'pakistan': '92', 'singapore': '65', 'malaysia': '60',
  'hong kong': '852', 'japan': '81', 'israel': '972', 'turkey': '90',
  'romania': '40', 'hungary': '36', 'bulgaria': '359', 'croatia': '385',
  'luxembourg': '352', 'malta': '356', 'cyprus': '357', 'iceland': '354',
};

export interface FollowUpRow {
  name: string;
  email: string | null;
  phone: string | null;
  waLink: string | null;
  waConfident: boolean;   // false when we had to guess the country code
  country: string | null;
  source: string | null;
  daysSince: number;
}

export interface DemoFollowUpReport {
  subject: string;
  text: string;
  html: string;
  fresh: FollowUpRow[];
  ageing: FollowUpRow[];
  skippedNoPhone: number;
}

function daysBetween(dateStr: string, now: Date): number {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

// Build a wa.me target. Returns confident:false when the number looked local
// and we had to infer the dial code, so the email can mark it for checking.
export function whatsappForLead(
  rawPhone: string | null,
  country: string | null,
): { link: string | null; confident: boolean } {
  if (!rawPhone) return { link: null, confident: false };

  const trimmed = String(rawPhone).trim();
  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 6) return { link: null, confident: false };

  // 00 44 ... is the same as +44 ...
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return { link: `https://wa.me/${digits}`, confident: true };
  }
  if (hadPlus) return { link: `https://wa.me/${digits}`, confident: true };

  const dial = country ? DIAL_CODES[country.trim().toLowerCase()] : undefined;

  // National format: a single leading 0 then the subscriber number.
  if (digits.startsWith('0')) {
    const national = digits.replace(/^0+/, '');
    if (dial) return { link: `https://wa.me/${dial}${national}`, confident: true };
    // No country on the record — UK is the safe default for Bryant Dental, but
    // flag it rather than pretend we know.
    return { link: `https://wa.me/44${national}`, confident: false };
  }

  // Already starts with a known dial code — treat as international.
  if (dial && digits.startsWith(dial)) return { link: `https://wa.me/${digits}`, confident: true };

  // Bare national number with no leading zero (common for US records).
  if (dial) return { link: `https://wa.me/${dial}${digits}`, confident: true };

  return { link: `https://wa.me/${digits}`, confident: false };
}

function toRow(lead: ZohoLead, now: Date): FollowUpRow {
  const phone = getLeadPhone(lead);
  const { link, confident } = whatsappForLead(phone, lead.Country);
  return {
    name: lead.Full_Name || '(no name)',
    email: lead.Email,
    phone,
    waLink: link,
    waConfident: confident,
    country: lead.Country,
    source: lead.Lead_Source,
    daysSince: daysBetween(lead.Modified_Time, now),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------- rendering

function renderTextSection(title: string, rows: FollowUpRow[]): string {
  if (rows.length === 0) return `${title}\n  (none)\n`;
  const lines = rows.map((r, i) => {
    const bits = [`${i + 1}. ${r.name}`];
    if (r.country) bits.push(r.country);
    bits.push(`${r.daysSince}d`);
    if (r.source) bits.push(r.source);
    let line = bits.join(' · ');
    if (r.waLink) {
      line += `\n     WhatsApp: ${r.waLink}${r.waConfident ? '' : '  (check country code)'}`;
    } else {
      line += '\n     No phone number on the lead';
    }
    if (r.email) line += `\n     ${r.email}`;
    return line;
  });
  return `${title}\n${lines.join('\n')}\n`;
}

function renderHtmlSection(title: string, subtitle: string, rows: FollowUpRow[], accent: string): string {
  const head = `
    <h2 style="margin:28px 0 4px;font:600 17px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
      ${escapeHtml(title)} <span style="color:${accent}">(${rows.length})</span>
    </h2>
    <p style="margin:0 0 12px;font:400 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#777">${escapeHtml(subtitle)}</p>`;

  if (rows.length === 0) {
    return `${head}<p style="margin:0;font:400 14px -apple-system,sans-serif;color:#999">Nobody in this bucket today.</p>`;
  }

  const items = rows.map(r => {
    const meta = [r.country, r.source].filter(Boolean).map(x => escapeHtml(String(x))).join(' · ');
    const wa = r.waLink
      ? `<a href="${r.waLink}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;
           font:600 13px -apple-system,sans-serif;padding:7px 14px;border-radius:6px;margin-top:6px">
           WhatsApp${r.phone ? ' ' + escapeHtml(r.phone) : ''}</a>${
           r.waConfident ? '' : '<span style="font:400 11px -apple-system,sans-serif;color:#C00;margin-left:8px">check country code</span>'}`
      : '<span style="font:400 12px -apple-system,sans-serif;color:#C00">No phone number on the lead</span>';

    return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #EEE">
        <div style="font:600 15px -apple-system,sans-serif;color:#111">${escapeHtml(r.name)}</div>
        <div style="font:400 12px -apple-system,sans-serif;color:#888;margin-top:2px">
          ${meta}${meta ? ' · ' : ''}last updated ${r.daysSince}d ago
        </div>
        ${r.email ? `<div style="font:400 12px -apple-system,sans-serif;color:#888">${escapeHtml(r.email)}</div>` : ''}
        <div>${wa}</div>
      </td></tr>`;
  }).join('');

  return `${head}<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${items}</table>`;
}

// ---------------------------------------------------------------- the report

export async function buildDemoFollowUpReport(now: Date = new Date()): Promise<DemoFollowUpReport> {
  const leads = await fetchAllJamesLeads();

  const inStatus = leads.filter(l => l.Status === TARGET_STATUS);

  const fresh: FollowUpRow[] = [];
  const ageing: FollowUpRow[] = [];
  for (const lead of inStatus) {
    const age = daysBetween(lead.Modified_Time, now);
    if (age <= FRESH_DAYS) fresh.push(toRow(lead, now));
    else if (age <= AGEING_DAYS) ageing.push(toRow(lead, now));
  }

  // Freshest first in bucket one (chase while warm); oldest first in bucket two
  // (most at risk of being lost entirely).
  fresh.sort((a, b) => a.daysSince - b.daysSince);
  ageing.sort((a, b) => b.daysSince - a.daysSince);

  const skippedNoPhone = [...fresh, ...ageing].filter(r => !r.waLink).length;

  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const subject = `Demo follow-ups — ${fresh.length} fresh, ${ageing.length} ageing (${dateLabel})`;

  const text = [
    `VIRTUAL DEMO COMPLETED — follow-up list for ${dateLabel}`,
    '',
    renderTextSection(`FRESH — last ${FRESH_DAYS} days (${fresh.length})`, fresh),
    '',
    renderTextSection(`AGEING — ${FRESH_DAYS}+ days, within 3 months (${ageing.length})`, ageing),
    '',
    `${inStatus.length} leads are in Virtual Demo Completed in total.`,
    skippedNoPhone > 0 ? `${skippedNoPhone} of the listed leads have no phone number in Zoho.` : '',
    'Dates are based on the last update to the Zoho lead record.',
  ].filter(Boolean).join('\n');

  const html = `
  <div style="max-width:640px;margin:0 auto;padding:24px 20px;background:#fff">
    <div style="font:700 20px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">Demo follow-ups</div>
    <div style="font:400 13px -apple-system,sans-serif;color:#888;margin-top:2px">${escapeHtml(dateLabel)} · Virtual Demo Completed</div>

    ${renderHtmlSection(`Fresh — last ${FRESH_DAYS} days`, 'Still warm. Best chance of a reply.', fresh, '#25D366')}
    ${renderHtmlSection(`Ageing — ${FRESH_DAYS}+ days, within 3 months`, 'Going cold. Oldest first.', ageing, '#E8A33D')}

    <p style="margin:28px 0 0;font:400 12px -apple-system,sans-serif;color:#AAA;border-top:1px solid #EEE;padding-top:12px">
      ${inStatus.length} leads in Virtual Demo Completed in total.${
        skippedNoPhone > 0 ? ` ${skippedNoPhone} listed lead(s) have no phone number in Zoho.` : ''}
      Ages are based on the last update to the Zoho lead record.
    </p>
  </div>`;

  return { subject, text, html, fresh, ageing, skippedNoPhone };
}
