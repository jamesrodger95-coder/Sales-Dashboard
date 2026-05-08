import { Debrief } from './debriefs';
import { isZohoConfigured, searchLeadByEmail, searchLeadByName, addNoteToLead } from './zoho-client';

export type CrmPushStatus = 'pushed' | 'failed' | 'no_record' | 'skipped' | 'not_configured';

export interface CrmPushResult {
  status: CrmPushStatus;
  leadId?: string;
  leadName?: string;
  summary?: string;
}

// Generate a natural one-line summary from a debrief.
export function generateSummary(d: Debrief): string {
  const notes = (d.notes || '').trim();
  const cleanNotes = notes
    ? notes.charAt(0).toUpperCase() + notes.slice(1) + (/[.!?]$/.test(notes) ? '' : '.')
    : '';

  // No outcome at all → fall back to a config-only summary
  if (!d.outcome) {
    const cfg = config(d);
    if (cfg) return `Discussed ${cfg}.${cleanNotes ? ' ' + cleanNotes : ''}`;
    return cleanNotes || 'Demo call notes logged.';
  }

  if (d.outcome === 'No Answer') return 'No answer on call.';

  const cfg = config(d);
  let stem = '';

  switch (d.outcome) {
    case 'Ordered':
      stem = cfg ? `Ordered ${cfg}` : 'Ordered.';
      break;
    case 'Interested':
      stem = cfg ? `Interested in ${cfg}` : 'Interested.';
      break;
    case 'Thinking':
      stem = cfg ? `Considering ${cfg}` : 'Considering options.';
      break;
    case 'Not Ready':
      stem = 'Not ready yet';
      break;
  }

  if (!stem.endsWith('.')) stem += '.';
  return cleanNotes ? `${stem} ${cleanNotes}` : stem;
}

function config(d: Debrief): string {
  const parts: string[] = [];
  if (d.magnification) parts.push(d.magnification);
  // Skip "Not Sure" frame in the natural-language summary
  if (d.frame && d.frame !== 'Not Sure') parts.push(d.frame.toLowerCase());
  const headline = parts.join(' ');

  const extras: string[] = [];
  if (d.px) extras.push('PX');
  if (d.headlight && d.headlight !== 'None') extras.push(d.headlight);
  if (d.headlight === 'None' && (d.frame || d.magnification)) extras.push('no headlight');

  if (!headline && extras.length === 0) return '';
  if (!headline) return `with ${extras.join(' and ')}`;
  if (extras.length === 0) return headline;
  return `${headline} with ${extras.join(' and ')}`;
}

// Search for the lead, then push a note. Best-effort: returns status.
export async function pushDebriefToZoho(d: Debrief): Promise<CrmPushResult> {
  if (!isZohoConfigured()) {
    return { status: 'not_configured' };
  }

  const summary = generateSummary(d);

  let lead = null;
  if (d.email) {
    lead = await searchLeadByEmail(d.email);
  }
  if (!lead && d.name) {
    lead = await searchLeadByName(d.name);
  }

  if (!lead) {
    console.log(`[Debrief→Zoho] No CRM record for ${d.name} (${d.email || 'no email'})`);
    return { status: 'no_record', summary };
  }

  const ok = await addNoteToLead(lead.id, 'Demo Call Notes', summary);
  if (ok) {
    console.log(`[Debrief→Zoho] Note added to ${lead.Full_Name} (${lead.id})`);
    return { status: 'pushed', leadId: lead.id, leadName: lead.Full_Name, summary };
  }
  return { status: 'failed', leadId: lead.id, leadName: lead.Full_Name, summary };
}
