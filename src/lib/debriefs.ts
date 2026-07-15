import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { hasKV, kvGet, kvSet } from './kv-client';

export type Frame = 'Rounded' | 'Rectangular' | 'Not Sure';
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
  /** Up to 2 magnifications selected. Legacy records may have a string here — use magsOf() to read. */
  magnification: Magnification[];
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

// Read magnification as a normalized array regardless of whether the underlying
// record stores a string (legacy), an array, or null. Used everywhere that
// displays / sums / formats magnification.
export function magsOf(d: { magnification?: unknown }): Magnification[] {
  const m = d.magnification;
  if (Array.isArray(m)) return m.filter(Boolean) as Magnification[];
  if (typeof m === 'string' && m) return [m as Magnification];
  return [];
}

export function magsJoin(d: { magnification?: unknown }, sep = ' / '): string {
  return magsOf(d).join(sep);
}

// ============================================================================
// Storage layer — runtime-aware so dashboard saves work in every environment.
//
// Order of preference:
//   1. Vercel KV (REST API) — durable across deploys; used when KV_REST_API_URL
//      and KV_REST_API_TOKEN are set.
//   2. /tmp on Vercel — writable but ephemeral (lost on cold start). Better
//      than failing every save while waiting on KV setup.
//   3. ./data/ locally — durable on dev machine.
// ============================================================================

const KV_KEY = 'debriefs:all';
const isVercel = () => !!process.env.VERCEL;

const LOCAL_DIR = path.join(process.cwd(), 'data');
const LOCAL_FILE = path.join(LOCAL_DIR, 'debriefs.json');
const TMP_FILE = '/tmp/debriefs.json';

function activeFilePath(): string {
  return isVercel() ? TMP_FILE : LOCAL_FILE;
}

async function ensureFile(file: string): Promise<void> {
  try { await fs.access(file); return; } catch { /* missing */ }
  const dir = path.dirname(file);
  try { await fs.mkdir(dir, { recursive: true }); } catch { /* may already exist */ }
  await fs.writeFile(file, '[]', 'utf-8');
}

export async function readAll(): Promise<Debrief[]> {
  if (hasKV()) {
    try {
      const items = await kvGet<Debrief[]>(KV_KEY);
      return items || [];
    }
    catch (err) { console.error('[debriefs] KV read failed, falling back to file:', err); }
  }
  const file = activeFilePath();
  await ensureFile(file);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as Debrief[];
  } catch (err) {
    console.error(`[debriefs] readAll failed for ${file}:`, err);
    return [];
  }
}

async function writeAll(items: Debrief[]): Promise<void> {
  if (hasKV()) {
    await kvSet(KV_KEY, items);
    return;
  }
  const file = activeFilePath();
  await ensureFile(file);
  await fs.writeFile(file, JSON.stringify(items, null, 2), 'utf-8');
}

export function storageMode(): 'kv' | 'tmp' | 'local' {
  if (hasKV()) return 'kv';
  if (isVercel()) return 'tmp';
  return 'local';
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
