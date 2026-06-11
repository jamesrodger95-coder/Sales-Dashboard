// Closing Board — manually curated Kanban of live deals James is working.
// Mirrors the debriefs storage pattern: KV REST first when configured, falling
// back to /tmp on Vercel and ./data locally.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Frame, Magnification, Headlight } from './debriefs';

export type BoardColumn = 'interested' | 'quoted' | 'deciding' | 'closing';
export const COLUMNS: BoardColumn[] = ['interested', 'quoted', 'deciding', 'closing'];

export type BoardOutcome = 'won' | 'lost';

export interface BoardCard {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  country: string | null;
  frame: Frame | null;
  magnification: Magnification[];
  px: boolean;
  headlight: Headlight | null;
  notes: string;
  column: BoardColumn;
  outcome: BoardOutcome | null;
  lostReason: string | null;
  addedAt: string;
  movedAt: string;
  followUpDate: string | null;
  debriefId: string | null;
  wonAt: string | null;
  lostAt: string | null;
  /** Optional deal value — surfaces in the Won total when present. */
  value?: number | null;
}

// ============================================================================
// Storage — single key, JSON array. Same pattern as debriefs.ts.
// ============================================================================

const KV_KEY = 'board:all';
const hasKV = () => !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const isVercel = () => !!process.env.VERCEL;

const LOCAL_DIR = path.join(process.cwd(), 'data');
const LOCAL_FILE = path.join(LOCAL_DIR, 'board.json');
const TMP_FILE = '/tmp/board.json';

function activeFilePath(): string {
  return isVercel() ? TMP_FILE : LOCAL_FILE;
}

async function ensureFile(file: string): Promise<void> {
  try { await fs.access(file); return; } catch { /* missing */ }
  const dir = path.dirname(file);
  try { await fs.mkdir(dir, { recursive: true }); } catch { /* exists */ }
  await fs.writeFile(file, '[]', 'utf-8');
}

async function kvGetAll(): Promise<BoardCard[]> {
  const url = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;
  const res = await fetch(`${url}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
  const data = await res.json();
  if (!data?.result) return [];
  try { return JSON.parse(data.result) as BoardCard[]; }
  catch { return []; }
}

async function kvSetAll(items: BoardCard[]): Promise<void> {
  const url = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;
  const res = await fetch(`${url}/set/${KV_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KV set failed: ${res.status} ${text}`);
  }
}

export async function readAll(): Promise<BoardCard[]> {
  if (hasKV()) {
    try { return await kvGetAll(); }
    catch (err) { console.error('[board] KV read failed, falling back to file:', err); }
  }
  const file = activeFilePath();
  await ensureFile(file);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as BoardCard[];
  } catch (err) {
    console.error(`[board] readAll failed for ${file}:`, err);
    return [];
  }
}

async function writeAll(items: BoardCard[]): Promise<void> {
  if (hasKV()) { await kvSetAll(items); return; }
  const file = activeFilePath();
  await ensureFile(file);
  await fs.writeFile(file, JSON.stringify(items, null, 2), 'utf-8');
}

export function storageMode(): 'kv' | 'tmp' | 'local' {
  if (hasKV()) return 'kv';
  if (isVercel()) return 'tmp';
  return 'local';
}

// ============================================================================
// CRUD
// ============================================================================

export async function create(input: Partial<BoardCard> & { name: string }): Promise<BoardCard> {
  const items = await readAll();
  const now = new Date().toISOString();
  const card: BoardCard = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    phone: input.phone ?? null,
    email: input.email ?? null,
    country: input.country ?? null,
    frame: input.frame ?? null,
    magnification: Array.isArray(input.magnification) ? input.magnification : [],
    px: input.px ?? false,
    headlight: input.headlight ?? null,
    notes: input.notes ?? '',
    column: input.column ?? 'interested',
    outcome: null,
    lostReason: null,
    addedAt: now,
    movedAt: now,
    followUpDate: input.followUpDate ?? null,
    debriefId: input.debriefId ?? null,
    wonAt: null,
    lostAt: null,
    value: input.value ?? null,
  };
  items.push(card);
  await writeAll(items);
  return card;
}

export async function update(id: string, patch: Partial<BoardCard>): Promise<BoardCard | null> {
  const items = await readAll();
  const idx = items.findIndex(c => c.id === id);
  if (idx === -1) return null;
  const prev = items[idx];
  const next: BoardCard = { ...prev, ...patch };
  // If column changed, stamp movedAt
  if (patch.column && patch.column !== prev.column) next.movedAt = new Date().toISOString();
  // If outcome flipped, stamp the corresponding timestamp
  if (patch.outcome === 'won' && prev.outcome !== 'won') next.wonAt = new Date().toISOString();
  if (patch.outcome === 'lost' && prev.outcome !== 'lost') next.lostAt = new Date().toISOString();
  if (patch.outcome === null) { next.wonAt = null; next.lostAt = null; next.lostReason = null; }
  items[idx] = next;
  await writeAll(items);
  return next;
}

export async function remove(id: string): Promise<boolean> {
  const items = await readAll();
  const next = items.filter(c => c.id !== id);
  if (next.length === items.length) return false;
  await writeAll(next);
  return true;
}

// ============================================================================
// Query helpers
// ============================================================================

export async function activeCards(): Promise<BoardCard[]> {
  return (await readAll()).filter(c => c.outcome === null);
}

export async function wonThisMonth(now = new Date()): Promise<BoardCard[]> {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return (await readAll())
    .filter(c => c.outcome === 'won' && c.wonAt && new Date(c.wonAt).getTime() >= start)
    .sort((a, b) => (b.wonAt || '').localeCompare(a.wonAt || ''));
}

export async function lostThisMonth(now = new Date()): Promise<BoardCard[]> {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return (await readAll())
    .filter(c => c.outcome === 'lost' && c.lostAt && new Date(c.lostAt).getTime() >= start)
    .sort((a, b) => (b.lostAt || '').localeCompare(a.lostAt || ''));
}

export function countByColumn(cards: BoardCard[]): Record<BoardColumn, number> {
  const out: Record<BoardColumn, number> = { interested: 0, quoted: 0, deciding: 0, closing: 0 };
  for (const c of cards) if (c.outcome === null && out[c.column] !== undefined) out[c.column]++;
  return out;
}

export function totalValue(cards: BoardCard[]): number {
  return cards.reduce((sum, c) => sum + (typeof c.value === 'number' ? c.value : 0), 0);
}
