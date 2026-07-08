// Milestone tracking storage for the /ops dashboard. SERVER-ONLY (imports fs).
//
// Schedules and types live in ops-schedules.ts (client-safe).

import fs from 'fs/promises';
import path from 'path';
export type {
  MilestoneEntry, MfgMilestones, DeliveryMilestones,
  MfgSchedulePoint, DeliverySchedulePoint,
} from './ops-schedules';
export {
  REFRACTIVE_SCHEDULE, MAGNIFLEX_SCHEDULE, DELIVERY_SCHEDULE,
  isMagniFlex, scheduleFor, productName,
} from './ops-schedules';

import type { MfgMilestones, DeliveryMilestones, MilestoneEntry } from './ops-schedules';

// ============================================================================
// Storage — KV REST first, JSON file fallback (same pattern as debriefs / board).
// One key per deal keeps writes cheap and avoids read-modify-write races.
// ============================================================================

const hasKV = () => !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const isVercel = () => !!process.env.VERCEL;

const LOCAL_FILE = path.join(process.cwd(), 'data', 'ops-milestones.json');
const TMP_FILE = '/tmp/ops-milestones.json';
const activeFile = () => (isVercel() ? TMP_FILE : LOCAL_FILE);

interface FileShape {
  mfg: Record<string, MfgMilestones>;
  delivery: Record<string, DeliveryMilestones>;
}

async function ensureFile(file: string) {
  try { await fs.access(file); return; } catch { /* missing */ }
  try { await fs.mkdir(path.dirname(file), { recursive: true }); } catch { /* exists */ }
  await fs.writeFile(file, JSON.stringify({ mfg: {}, delivery: {} }, null, 2), 'utf-8');
}

async function readAllFromFile(): Promise<FileShape> {
  const file = activeFile();
  await ensureFile(file);
  try { return JSON.parse(await fs.readFile(file, 'utf-8')) as FileShape; }
  catch { return { mfg: {}, delivery: {} }; }
}

async function writeAllToFile(all: FileShape) {
  const file = activeFile();
  await ensureFile(file);
  await fs.writeFile(file, JSON.stringify(all, null, 2), 'utf-8');
}

async function kvGet<T>(key: string): Promise<T | null> {
  const url = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
  const data = await res.json();
  if (!data?.result) return null;
  try { return JSON.parse(data.result) as T; } catch { return null; }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const url = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;
  const res = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KV set failed: ${res.status} ${text}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

const mfgKey = (id: string) => `ops:mfg:${id}`;
const deliveryKey = (id: string) => `ops:delivery:${id}`;

export async function getMfgMilestones(dealId: string): Promise<MfgMilestones> {
  const fallback: MfgMilestones = { dealId, entries: {} };
  if (hasKV()) {
    try {
      const v = await kvGet<MfgMilestones>(mfgKey(dealId));
      return v ?? fallback;
    } catch (err) { console.error('[ops-milestones] KV get mfg failed:', err); }
  }
  const all = await readAllFromFile();
  return all.mfg[dealId] ?? fallback;
}

export async function setMfgMilestone(dealId: string, weekKey: string, entry: MilestoneEntry): Promise<MfgMilestones> {
  const current = await getMfgMilestones(dealId);
  current.entries[weekKey] = entry;
  if (hasKV()) {
    try { await kvSet(mfgKey(dealId), current); return current; }
    catch (err) { console.error('[ops-milestones] KV set mfg failed:', err); }
  }
  const all = await readAllFromFile();
  all.mfg[dealId] = current;
  await writeAllToFile(all);
  return current;
}

export async function getDeliveryMilestones(dealId: string): Promise<DeliveryMilestones> {
  const fallback: DeliveryMilestones = { dealId, entries: {} };
  if (hasKV()) {
    try {
      const v = await kvGet<DeliveryMilestones>(deliveryKey(dealId));
      return v ?? fallback;
    } catch (err) { console.error('[ops-milestones] KV get delivery failed:', err); }
  }
  const all = await readAllFromFile();
  return all.delivery[dealId] ?? fallback;
}

export async function setDeliveryMilestone(
  dealId: string,
  weekKey: 'week1' | 'week8' | 'week16' | 'week20',
  entry: MilestoneEntry,
  dispatchedAt?: string,
): Promise<DeliveryMilestones> {
  const current = await getDeliveryMilestones(dealId);
  current.entries[weekKey] = entry;
  if (dispatchedAt) current.dispatchedAt = dispatchedAt;
  if (hasKV()) {
    try { await kvSet(deliveryKey(dealId), current); return current; }
    catch (err) { console.error('[ops-milestones] KV set delivery failed:', err); }
  }
  const all = await readAllFromFile();
  all.delivery[dealId] = current;
  await writeAllToFile(all);
  return current;
}

// Bulk fetch for a list of deals — used by ops pages to avoid N sequential
// KV round-trips. Returns a Map keyed by dealId.
export async function bulkGetMfg(dealIds: string[]): Promise<Map<string, MfgMilestones>> {
  const out = new Map<string, MfgMilestones>();
  if (hasKV()) {
    await Promise.all(dealIds.map(async id => {
      try {
        const v = await kvGet<MfgMilestones>(mfgKey(id));
        if (v) out.set(id, v);
      } catch { /* leave missing */ }
    }));
    return out;
  }
  const all = await readAllFromFile();
  for (const id of dealIds) if (all.mfg[id]) out.set(id, all.mfg[id]);
  return out;
}

export async function bulkGetDelivery(dealIds: string[]): Promise<Map<string, DeliveryMilestones>> {
  const out = new Map<string, DeliveryMilestones>();
  if (hasKV()) {
    await Promise.all(dealIds.map(async id => {
      try {
        const v = await kvGet<DeliveryMilestones>(deliveryKey(id));
        if (v) out.set(id, v);
      } catch { /* leave missing */ }
    }));
    return out;
  }
  const all = await readAllFromFile();
  for (const id of dealIds) if (all.delivery[id]) out.set(id, all.delivery[id]);
  return out;
}
