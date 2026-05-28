// Minimal Telegram Bot API client — direct fetch, no SDK.

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

const API = (token: string) => `https://api.telegram.org/bot${token}`;

interface InlineButton { text: string; callback_data: string }
type InlineKeyboard = InlineButton[][];

export async function sendMessage(
  chatId: string | number,
  text: string,
  opts?: { parse_mode?: 'Markdown' | 'HTML'; reply_markup?: { inline_keyboard: InlineKeyboard } }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts?.parse_mode || 'HTML',
        reply_markup: opts?.reply_markup,
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[Telegram] sendMessage failed', err);
    return false;
  }
}

export async function sendToJames(text: string, opts?: Parameters<typeof sendMessage>[2]): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return false;
  return sendMessage(chatId, text, opts);
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${API(token)}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch { /* ignore */ }
}

// ------------------ Natural language debrief parsing ------------------

import { Frame, Magnification, Headlight, Outcome, FollowUpType } from './debriefs';

const FRAME_PATTERNS: [RegExp, Frame][] = [
  [/\brectangular\b|\brect\b|\brectangle\b/i, 'Rectangular'],
  [/\brounded?\b|\bround\b/i, 'Rounded'],
];
const MAG_PATTERNS: [RegExp, Magnification][] = [
  [/\b2\.?9\s*x?\b/i, '2.9x'],
  [/\b3\.?8\s*x?\b/i, '3.8x'],
  [/\b5\.?7\s*x?\b/i, '5.7x'],
  [/\b7\.?8\s*x?\b/i, '7.8x'],
  [/\bmagniflex\b|\bmagni\s*flex\b/i, 'MagniFlex'],
];
const HEADLIGHT_PATTERNS: [RegExp, Headlight][] = [
  [/\bignis\s*4?\s*pro\b|\bignis\s*pro\b/i, 'Ignis 4 Pro'],
  [/\bignis\s*4?\s*lite\b|\bignis\s*lite\b/i, 'Ignis 4 Lite'],
  [/\bhalo\b/i, 'Halo'],
  [/\bno\s*light\b|\bno\s*headlight\b/i, 'None'],
];
const OUTCOME_PATTERNS: [RegExp, Outcome][] = [
  [/\bordered\b|\bclosed\b|\bbought\b|\bpurchased\b/i, 'Ordered'],
  [/\binterested\b|\bkeen\b/i, 'Interested'],
  [/\bthinking\b|\bmaybe\b|\bconsider/i, 'Thinking'],
  [/\bnot\s*ready\b|\bnext\s*year\b|\bbudget\b/i, 'Not Ready'],
  [/\bno\s*answer\b|\bno\s*show\b|\bdidn'?t\s*answer\b/i, 'No Answer'],
];

export function parseDebriefText(text: string): {
  frame: Frame | null;
  magnification: Magnification[];
  px: boolean;
  headlight: Headlight | null;
  outcome: Outcome | null;
  followUp: FollowUpType | null;
  followUpDate: string | null;
  notes: string;
  name: string;
} {
  const out = {
    frame: null as Frame | null,
    magnification: [] as Magnification[],
    px: /\bpx\b|\bprescription\b/i.test(text),
    headlight: null as Headlight | null,
    outcome: null as Outcome | null,
    followUp: null as FollowUpType | null,
    followUpDate: null as string | null,
    notes: '',
    name: '',
  };

  for (const [r, v] of FRAME_PATTERNS) if (r.test(text)) { out.frame = v; break; }
  // Collect up to 2 magnifications mentioned in the text — handles "3.8x and magniflex".
  for (const [r, v] of MAG_PATTERNS) {
    if (r.test(text) && !out.magnification.includes(v)) {
      out.magnification.push(v);
      if (out.magnification.length >= 2) break;
    }
  }
  for (const [r, v] of HEADLIGHT_PATTERNS) if (r.test(text)) { out.headlight = v; break; }
  for (const [r, v] of OUTCOME_PATTERNS) if (r.test(text)) { out.outcome = v; break; }

  // Day of week / "tomorrow" / "next week"
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (/\btomorrow\b/i.test(text)) out.followUp = 'Tomorrow';
  else if (/\bnext\s*week\b/i.test(text)) out.followUp = 'Next Week';
  else if (/\bthis\s*week\b/i.test(text)) out.followUp = 'This Week';
  else {
    const dm = text.toLowerCase().match(new RegExp(`\\b(${days.join('|')})\\b`));
    if (dm) {
      out.followUp = 'Custom';
      const targetDay = days.indexOf(dm[1]);
      const today = new Date();
      const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const offset = ((targetDay - t0.getDay()) + 7) % 7 || 7;
      const target = new Date(t0.getTime() + offset * 86400000);
      out.followUpDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    }
  }

  // Name = leading words BEFORE the first structured token (frame/mag/headlight/outcome).
  // Lets "Dr. Fabian Meinke rectangular 5.7x..." pick up the full name.
  const STRUCTURED = /\b(rectangular|rect|rounded?|round|2\.?9|3\.?8|5\.?7|7\.?8|magniflex|magni|ignis|halo|ordered|interested|thinking|not\s*ready|no\s*answer|px|prescription|follow|tomorrow|next|this)\b/i;
  const m = text.trim().match(/^([^]*?)(?=\s)(?:.*)/);
  // Find the first structured token's index
  const sm = STRUCTURED.exec(text);
  if (sm && sm.index > 0) {
    out.name = text.slice(0, sm.index).trim().replace(/[,;:]+$/, '');
  } else {
    out.name = text.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  void m;

  // Notes: anything after follow-up keyword, or first chunk after structured words
  const followUpMatch = text.match(/follow[\s-]?up[:\s]+([\s\S]+?)(?:$|\.|,)/i);
  if (followUpMatch) out.notes = '';

  return out;
}
