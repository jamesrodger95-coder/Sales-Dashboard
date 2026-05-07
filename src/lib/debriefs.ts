import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type Frame = 'Rounded' | 'Rectangular';
export type Magnification = '2.9x' | '3.8x' | '5.7x' | '7.8x' | 'MagniFlex';
export type Headlight = 'Ignis 4 Pro' | 'Ignis 4 Lite' | 'Halo' | 'None';
export type Outcome = 'Ordered' | 'Interested' | 'Thinking' | 'Not Ready' | 'No Answer';
export type FollowUpType = 'Tomorrow' | 'This Week' | 'Next Week' | 'Custom' | 'No Follow Up';

export interface Debrief {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  callDate: string;
  frame: Frame | null;
  magnification: Magnification | null;
  px: boolean;
  headlight: Headlight | null;
  outcome: Outcome | null;
  notes: string;
  followUpDate: string | null;
  followUpType: FollowUpType;
  followUpDone: boolean;
  followUpDoneAt?: string | null;
  createdAt: string;
  source: 'dashboard' | 'telegram';
  reminderSent: boolean;
  nudgeSent?: boolean;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'debriefs.json');

async function ensureFile() {
  try { await fs.access(DATA_FILE); }
  catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, '[]', 'utf-8');
  }
}

export async function readAll(): Promise<Debrief[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as Debrief[];
  } catch {
    return [];
  }
}

async function writeAll(items: Debrief[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

export async function create(input: Omit<Debrief, 'id' | 'createdAt' | 'reminderSent' | 'followUpDone'>): Promise<Debrief> {
  const items = await readAll();
  const debrief: Debrief = {
    ...input,
    id: crypto.randomUUID(),
    followUpDone: false,
    reminderSent: false,
    createdAt: new Date().toISOString(),
  };
  items.push(debrief);
  await writeAll(items);
  return debrief;
}

export async function update(id: string, patch: Partial<Debrief>): Promise<Debrief | null> {
  const items = await readAll();
  const idx = items.findIndex(d => d.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  await writeAll(items);
  return items[idx];
}

export async function remove(id: string): Promise<boolean> {
  const items = await readAll();
  const next = items.filter(d => d.id !== id);
  if (next.length === items.length) return false;
  await writeAll(next);
  return true;
}

export async function findByName(name: string): Promise<Debrief | null> {
  if (!name) return null;
  const items = await readAll();
  const q = name.toLowerCase();
  // Most recent first
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted.find(d => d.name.toLowerCase().includes(q)) || null;
}

export function isOverdue(d: Debrief, today = new Date()): boolean {
  if (!d.followUpDate || d.followUpDone) return false;
  return d.followUpDate < ymd(today);
}

export function isDueToday(d: Debrief, today = new Date()): boolean {
  if (!d.followUpDate || d.followUpDone) return false;
  return d.followUpDate === ymd(today);
}

export function bucketByDate(items: Debrief[], today = new Date()) {
  const todayStr = ymd(today);
  const tomorrowStr = ymd(new Date(today.getTime() + 86400000));
  const weekEndStr = ymd(new Date(today.getTime() + 7 * 86400000));
  const nextWeekEndStr = ymd(new Date(today.getTime() + 14 * 86400000));

  const overdue: Debrief[] = [];
  const todayItems: Debrief[] = [];
  const thisWeek: Debrief[] = [];
  const nextWeek: Debrief[] = [];
  const later: Debrief[] = [];

  for (const d of items) {
    if (d.followUpDone || !d.followUpDate) continue;
    const due = d.followUpDate;
    if (due < todayStr) overdue.push(d);
    else if (due < tomorrowStr) todayItems.push(d);
    else if (due < weekEndStr) thisWeek.push(d);
    else if (due < nextWeekEndStr) nextWeek.push(d);
    else later.push(d);
  }

  // Sort overdue oldest-first, others nearest first
  overdue.sort((a, b) => (a.followUpDate || '').localeCompare(b.followUpDate || ''));
  const sortAsc = (a: Debrief, b: Debrief) => (a.followUpDate || '').localeCompare(b.followUpDate || '');
  todayItems.sort(sortAsc); thisWeek.sort(sortAsc); nextWeek.sort(sortAsc); later.sort(sortAsc);

  return { overdue, today: todayItems, thisWeek, nextWeek, later };
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveFollowUpDate(type: FollowUpType, custom?: string): string | null {
  if (type === 'No Follow Up') return null;
  if (type === 'Custom') return custom || null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (type === 'Tomorrow') return ymd(new Date(today.getTime() + 86400000));
  if (type === 'This Week') {
    const day = today.getDay();
    const daysToFri = day <= 5 ? 5 - day : 7 - day + 5;
    const target = daysToFri === 0 ? 3 : daysToFri;
    return ymd(new Date(today.getTime() + target * 86400000));
  }
  if (type === 'Next Week') {
    const day = today.getDay();
    const daysToMon = ((8 - day) % 7) || 7;
    return ymd(new Date(today.getTime() + daysToMon * 86400000));
  }
  return null;
}
