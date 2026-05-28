export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { readAll, update, create, bucketByDate, resolveFollowUpDate, magsJoin, Debrief } from '@/lib/debriefs';
import { sendMessage, parseDebriefText } from '@/lib/telegram';
import { searchPersonDeep, getTodaySchedule } from '@/lib/search';
import { pushDebriefToZoho } from '@/lib/debrief-zoho';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from: { id: number; first_name?: string };
    text?: string;
  };
}

function fmtDebrief(d: Debrief): string {
  const cfg = [d.frame, magsJoin(d) || null, d.px ? 'PX' : null, d.headlight, d.outcome].filter(Boolean).join(' · ');
  const note = d.notes ? `\n  "${d.notes}"` : '';
  const fu = d.followUpDate ? `\n  Follow-up: ${d.followUpDate}${d.followUpDone ? ' (done)' : ''}` : '';
  return `<b>${d.name}</b>${d.country ? ` — ${d.country}` : ''}\n${cfg}${note}${fu}`;
}

async function handleCommand(text: string): Promise<string> {
  const t = text.trim();

  if (t === '/start') {
    return 'Hi James. I\'ll send you follow-up reminders here.\n\nCommands:\n/log — log a call\n/followups — today\'s follow-ups\n/find [name] — search\n/today — calendar\n/done [name] — mark follow-up complete\n/reschedule [name] [date] — move follow-up\n\nOr type a free-form debrief like "Meinke rectangular 5.7x ignis pro interested follow up thursday".';
  }

  if (t === '/followups') {
    const all = await readAll();
    const buckets = bucketByDate(all);
    const total = buckets.overdue.length + buckets.today.length;
    if (total === 0) return 'No follow-ups due today. ✓';
    const lines: string[] = [];
    if (buckets.overdue.length) {
      lines.push(`<b>OVERDUE (${buckets.overdue.length}):</b>`);
      buckets.overdue.forEach(d => lines.push(`• ${d.name} — ${[magsJoin(d) || null, d.outcome].filter(Boolean).join(', ')}${d.notes ? ` — "${d.notes}"` : ''}`));
    }
    if (buckets.today.length) {
      if (lines.length) lines.push('');
      lines.push(`<b>TODAY (${buckets.today.length}):</b>`);
      buckets.today.forEach(d => lines.push(`• ${d.name} — ${[magsJoin(d) || null, d.outcome].filter(Boolean).join(', ')}${d.notes ? ` — "${d.notes}"` : ''}`));
    }
    return lines.join('\n');
  }

  if (t === '/today') {
    return await getTodaySchedule();
  }

  if (t.startsWith('/find ')) {
    const name = t.slice(6).trim();
    if (!name) return 'Usage: /find [name]';
    const result = await searchPersonDeep(name);
    return result.substring(0, 3500);
  }

  // /done Meinke OR "done Meinke"
  const doneMatch = t.match(/^(?:\/done|done)\s+(.+)$/i);
  if (doneMatch) {
    const name = doneMatch[1].trim();
    const all = await readAll();
    const candidates = all.filter(d => !d.followUpDone && d.name.toLowerCase().includes(name.toLowerCase()));
    if (candidates.length === 0) return `No open follow-up matching "${name}".`;
    if (candidates.length > 1) {
      return `Multiple matches for "${name}": ${candidates.map(c => c.name).join(', ')}. Be more specific.`;
    }
    await update(candidates[0].id, { followUpDone: true, followUpDoneAt: new Date().toISOString() });
    const remaining = (await readAll()).filter(d => !d.followUpDone && d.followUpDate && d.followUpDate <= new Date().toISOString().split('T')[0]).length;
    return `Marked <b>${candidates[0].name}</b> follow-up as done. ${remaining} remaining.`;
  }

  // /reschedule Meinke friday
  const reschedMatch = t.match(/^(?:\/reschedule|reschedule)\s+(.+?)\s+(.+)$/i);
  if (reschedMatch) {
    const name = reschedMatch[1].trim();
    const dateText = reschedMatch[2].trim();
    const all = await readAll();
    const candidates = all.filter(d => !d.followUpDone && d.name.toLowerCase().includes(name.toLowerCase()));
    if (candidates.length === 0) return `No open follow-up matching "${name}".`;
    const parsed = parseDebriefText(`follow up ${dateText}`);
    let newDate = parsed.followUpDate;
    if (!newDate && parsed.followUp) newDate = resolveFollowUpDate(parsed.followUp);
    // Try direct YYYY-MM-DD
    if (!newDate && /^\d{4}-\d{2}-\d{2}$/.test(dateText)) newDate = dateText;
    if (!newDate) return `Couldn't parse date "${dateText}". Try a weekday name or YYYY-MM-DD.`;
    await update(candidates[0].id, { followUpDate: newDate, followUpType: 'Custom', reminderSent: false, nudgeSent: false });
    return `Moved <b>${candidates[0].name}</b> follow-up to ${newDate}.`;
  }

  if (t === '/log' || t === 'log') {
    return 'Send a free-form debrief like:\n<code>Meinke rectangular 5.7x ignis pro interested follow up thursday</code>\n\nI\'ll parse it and confirm.';
  }

  // Otherwise: try free-form debrief parsing
  const parsed = parseDebriefText(t);
  if (parsed.frame || parsed.magnification.length > 0 || parsed.headlight || parsed.outcome) {
    // Ambiguous: ask for confirmation by saving immediately and reporting back
    const followUpDate = parsed.followUpDate || (parsed.followUp ? resolveFollowUpDate(parsed.followUp) : null);
    const debrief = await create({
      name: parsed.name || 'Unknown',
      email: null, phone: null, country: null,
      callDate: new Date().toISOString(),
      frame: parsed.frame,
      magnification: parsed.magnification,
      px: parsed.px,
      headlight: parsed.headlight,
      outcome: parsed.outcome,
      notes: parsed.notes,
      followUpDate,
      followUpType: parsed.followUp || 'No Follow Up',
      source: 'telegram',
    });

    // Best-effort CRM push (5-second cap)
    let crmLine = '';
    try {
      const crm = await Promise.race([
        pushDebriefToZoho(debrief),
        new Promise<{ status: 'failed' }>(resolve => setTimeout(() => resolve({ status: 'failed' }), 5000)),
      ]);
      if (crm.status === 'pushed') crmLine = `\n\n✓ Note added to ${('leadName' in crm && crm.leadName) || debrief.name}'s CRM record.`;
      else if (crm.status === 'no_record') crmLine = `\n\nNo CRM record found for ${debrief.name} — saved locally.`;
      else if (crm.status === 'failed') crmLine = '\n\nCRM note failed — saved locally only.';
    } catch { /* swallow */ }

    return `Logged:\n${fmtDebrief(debrief)}${crmLine}\n\nReply <code>edit ${parsed.name}</code> to change anything.`;
  }

  return 'Sorry, didn\'t recognise that. Try /followups, /today, /find [name], /done [name], or send a free-form debrief.';
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();
    const msg = update.message;
    if (!msg?.text || !msg.chat?.id) return NextResponse.json({ ok: true });

    // Optional auth: only respond to configured chat ID if set
    const allowedChat = process.env.TELEGRAM_CHAT_ID;
    if (allowedChat && String(msg.chat.id) !== allowedChat) {
      console.log(`[Telegram] ignoring message from chat ${msg.chat.id}`);
      return NextResponse.json({ ok: true });
    }

    const reply = await handleCommand(msg.text);
    await sendMessage(msg.chat.id, reply);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('[Telegram webhook]', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'failed' });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.TELEGRAM_BOT_TOKEN });
}
