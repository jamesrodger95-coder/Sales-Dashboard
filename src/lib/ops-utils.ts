// Shared helpers for the ops dashboard — phone formatting, mailto builder,
// name/product extraction. Kept UI-agnostic.

import { ZohoDeal } from './zoho-client';

export function cleanPhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits.length >= 6 ? digits : null;
}

export function whatsappHref(phone: string | null | undefined): string | null {
  const clean = cleanPhoneForWhatsApp(phone);
  return clean ? `https://wa.me/${clean}` : null;
}

export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there';
  const parts = fullName.trim().split(/\s+/);
  // Skip common honorifics
  const skip = /^(dr|mr|mrs|ms|miss|prof)\.?$/i;
  const first = parts.find(p => !skip.test(p));
  return first || parts[0] || 'there';
}

export function dealCustomerName(deal: ZohoDeal): string {
  const contact = deal.Contact_Name?.name;
  return (contact || deal.Deal_Name || '').trim();
}

export function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function weeksSince(dateStr: string | null | undefined): number {
  return Math.floor(daysSince(dateStr) / 7);
}

// Build a mailto: URL — the safest way to prefill body content is
// encodeURIComponent, but we keep line breaks readable as \r\n which most
// mail clients honour.
export function mailtoHref(to: string | null, subject: string, body: string): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body.replace(/\n/g, '\r\n'));
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${to || ''}${qs ? '?' + qs : ''}`;
}
