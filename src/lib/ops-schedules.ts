// Milestone schedule constants + types for the /ops dashboard.
//
// Separated from ops-milestones.ts (which does storage and imports fs) so that
// client components can consume schedules without pulling Node built-ins into
// the browser bundle.

import type { ZohoDeal } from './zoho-client';

export interface MilestoneEntry {
  sent: boolean;
  sentAt?: string;
  sentBy?: string;
}

export type MfgStartDateSource = 'stage_history' | 'modified_time' | 'manual';

export interface MfgMilestones {
  dealId: string;
  entries: Record<string, MilestoneEntry>; // key = "week1" | "week4" | ...
  /**
   * When this deal entered "In Manufacturing" — pulled from Zoho's
   * Stage_History related list when available. Once stamped from
   * stage_history or manual, we never overwrite it.
   */
  startDate?: string;
  /**
   * How we determined startDate:
   *   'stage_history' — pulled from Zoho's Stage_History (accurate)
   *   'modified_time' — fallback when Stage_History was empty/failed
   *   'manual'        — user set it via the Edit UI
   *
   * The auto-refresh in /api/ops/deals will re-resolve when the source is
   * 'modified_time' or missing, so wrong first-sight stamps get corrected
   * on the next load. It leaves 'stage_history' and 'manual' alone.
   */
  startDateSource?: MfgStartDateSource;
}

export interface DeliveryMilestones {
  dealId: string;
  dispatchedAt?: string;
  entries: Record<string, MilestoneEntry>; // key = "week1" | "week8" | ...
  /** VA has completed the fit call with the customer. */
  fitCallDone?: boolean;
  fitCallDate?: string;
  /**
   * Set only after fitCallDone is true. true = happy; false = FIT ISSUE.
   * When fitCallDone but customerHappy is missing, we treat it as "needs attention"
   * so the VA doesn't lose track of the answer.
   */
  customerHappy?: boolean;
}

// Measurement issue flag lives alongside milestones so we can track cards
// during "Measurement Final Checks" that need clinician follow-up.
export interface MeasurementFlags {
  dealId: string;
  issueFlagged: boolean;
  flaggedAt?: string;
  notes?: string;
}

export interface MfgSchedulePoint {
  week: number;
  label: string;
  emailSubject: string;
  emailBody: (name: string, product: string) => string;
}

export const REFRACTIVE_SCHEDULE: MfgSchedulePoint[] = [
  {
    week: 1,
    label: 'Order confirmed and in production',
    emailSubject: 'Your Bryant Dental order is in production',
    emailBody: (name, product) => `Hi ${name},

Just a quick note to confirm your ${product} is now in production — thanks for choosing Bryant Dental! We'll keep you updated at key stages along the build.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 4,
    label: 'Progressing well, ~8 weeks remaining',
    emailSubject: 'Update on your order',
    emailBody: (name, product) => `Hi ${name},

A quick update on your ${product} — production is progressing well, with approximately 8 weeks remaining until delivery. We'll be in touch again at the halfway point.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 8,
    label: 'Final phase, ~4 weeks to go',
    emailSubject: 'Your loupes are in the final phase',
    emailBody: (name, product) => `Hi ${name},

Great news — your ${product} is now in the final phase of production with approximately 4 weeks to go. We'll keep you posted as things progress.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 11,
    label: 'Nearly complete',
    emailSubject: 'Your Bryant Dental loupes are almost ready',
    emailBody: (name, product) => `Hi ${name},

Your ${product} is nearly complete — we expect production to finish within the next week or so. We'll be in touch shortly to confirm the delivery address before dispatch.

Best wishes,
The Bryant Dental Team`,
  },
];

export const MAGNIFLEX_SCHEDULE: MfgSchedulePoint[] = [
  {
    week: 1,
    label: 'Order confirmed and in production',
    emailSubject: 'Your MagniFlex order is in production',
    emailBody: (name, product) => `Hi ${name},

Just a quick note to confirm your ${product} is now in production — thanks for choosing Bryant Dental! MagniFlex is a 20-week build, and we'll update you at key milestones.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 4,
    label: 'Progressing well in production',
    emailSubject: 'Your MagniFlex is progressing well',
    emailBody: (name, product) => `Hi ${name},

Your ${product} is progressing well in production. We'll be back with another update shortly.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 8,
    label: 'About halfway through the build',
    emailSubject: 'Your MagniFlex is around halfway there',
    emailBody: (name, product) => `Hi ${name},

Your ${product} is around halfway through the build — everything is on schedule. We'll continue to update you at key stages.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 12,
    label: '~8 weeks remaining',
    emailSubject: 'Update on your MagniFlex order',
    emailBody: (name, product) => `Hi ${name},

A quick update — your ${product} has around 8 weeks of production remaining. We'll be in touch at the final stages.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 16,
    label: 'Final stages, ~4 weeks to go',
    emailSubject: 'Your MagniFlex is in the final stages',
    emailBody: (name, product) => `Hi ${name},

Your ${product} is now in the final stages of production, with around 4 weeks to go. We'll be back shortly to confirm your delivery address.

Best wishes,
The Bryant Dental Team`,
  },
  {
    week: 19,
    label: 'Nearly complete',
    emailSubject: 'Your MagniFlex is nearly ready',
    emailBody: (name, product) => `Hi ${name},

Great news — your ${product} is nearly complete and should be finished within the week. We'll be in touch to confirm the delivery address before dispatch.

Best wishes,
The Bryant Dental Team`,
  },
];

export type DeliveryWeekKey = 'week1' | 'week8' | 'week16' | 'week20' | 'week24';

export interface DeliverySchedulePoint {
  key: DeliveryWeekKey;
  week: number;
  label: string;
  emailSubject: string;
  emailBody: (name: string, product: string) => string;
}

export const DELIVERY_SCHEDULE: DeliverySchedulePoint[] = [
  {
    key: 'week1',
    week: 1,
    label: 'Onboarding',
    emailSubject: 'Welcome to Bryant Dental — your loupes are here',
    emailBody: (name, product) => `Hi ${name},

Welcome to Bryant Dental! Your ${product} should be with you now — congratulations, we hope you love them.

A few things to help you get started:
• Wearing them for the first time can feel unusual — give yourself a couple of clinical sessions to adapt.
• The AI custom fit means they should feel balanced and light; if anything feels off, don't push through it, get in touch.
• Any adjustments needed, we can arrange a fit call at a time that suits you.
• Support: just reply to this email, or reach us on WhatsApp.

If you have any questions about fit, adjustment, or how to get the most out of your loupes, just reply and we'll get you sorted.

Best wishes,
The Bryant Dental Team`,
  },
  {
    key: 'week8',
    week: 8,
    label: 'Fit Check',
    emailSubject: 'How are your loupes?',
    emailBody: (name, product) => `Hi ${name},

It's been about 8 weeks with your ${product} now — how are you finding them? Are you happy with the fit? If anything needs adjusting, we're here to help. Just reply and let us know.

Best wishes,
The Bryant Dental Team`,
  },
  {
    key: 'week16',
    week: 16,
    label: 'Review Request',
    emailSubject: 'Would you recommend Bryant Dental?',
    emailBody: (name, product) => `Hi ${name},

We hope you're still loving your ${product}! If you have a moment, we'd really appreciate a quick Google review — it helps other clinicians discover us:

https://g.page/r/bryant-dental/review

Thank you so much!

Best wishes,
The Bryant Dental Team`,
  },
  {
    key: 'week20',
    week: 20,
    label: 'Referral Ask',
    emailSubject: `Know a colleague who'd love loupes like yours?`,
    emailBody: (name, product) => `Hi ${name},

Glad you're enjoying your ${product}! If any colleagues have been asking about your loupes, we'd love to help them too — you can share this booking link:

https://bryant.dental/book

Thank you for being part of the BD community!

Best wishes,
The Bryant Dental Team`,
  },
  {
    key: 'week24',
    week: 24,
    label: 'Review & Referral Follow-Up',
    emailSubject: 'Still loving your loupes?',
    emailBody: (name, product) => `Hi ${name},

It's been about 6 months with your ${product} now. We hope they're still making a difference every day.

If you haven't had a chance yet, we'd really appreciate a quick Google review — it helps other clinicians discover us:

https://g.page/r/bryant-dental/review

And if any colleagues have been asking about your loupes, feel free to share this link:

https://bryant.dental/book

Thank you for being part of the BD community!

Best wishes,
The Bryant Dental Team`,
  },
];

// ============================================================================
// Product helpers — client-safe
// ============================================================================

// Product detection tolerates the various ways MagniFlex has been recorded in
// Zoho — spec asks us to match "MagniFlex", "Magni", and "3-in-1".
export function isMagniFlex(deal: ZohoDeal): boolean {
  const v = (deal.Refractive_Magnification || '').toLowerCase().trim();
  if (!v) return false;
  return v.includes('magniflex') || v.includes('magni') || v.includes('3-in-1') || v.includes('3 in 1');
}

// Whether the product field is populated enough to trust the target-weeks math.
// If false, the UI should surface a "Product unknown" flag so the VA knows
// the 12-week target is a default, not a confirmed spec.
export function productKnown(deal: ZohoDeal): boolean {
  const v = (deal.Refractive_Magnification || '').trim();
  return !!v && v !== '-None-';
}

export function scheduleFor(deal: ZohoDeal): MfgSchedulePoint[] {
  return isMagniFlex(deal) ? MAGNIFLEX_SCHEDULE : REFRACTIVE_SCHEDULE;
}

export function productName(deal: ZohoDeal): string {
  const mag = deal.Refractive_Magnification;
  if (!mag || mag === '-None-') return 'Bryant Dental loupes';
  if (isMagniFlex(deal)) return 'MagniFlex';
  return `${mag} Refractive`;
}

// Manufacturing clock start. Prefer the stored start date (frozen on first
// sight in ops), fall back to Modified_Time, then Created_Time.
export function mfgStartOf(deal: ZohoDeal, milestone: MfgMilestones | undefined): string | null {
  return milestone?.startDate || deal.Modified_Time || deal.Created_Time || null;
}
