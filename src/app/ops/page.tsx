'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StatChip from '@/components/ops/StatChip';
import type { ZohoDeal } from '@/lib/zoho-client';
import type { MfgMilestones, DeliveryMilestones } from '@/lib/ops-schedules';
import { isMagniFlex, mfgStartOf } from '@/lib/ops-schedules';
import { daysSince, weeksSince, dealCustomerName } from '@/lib/ops-utils';

// Repeated verbatim here (not imported) because the ops page is a client
// component and doesn't need the schedule bodies — only the stage names.
const AWAITING = 'Awaiting Measurements';
const FINAL_CHECKS = ['Measurements Final Checks', 'Measurement Final Checks'];
const MANUFACTURING = 'In Manufacturing';
const READY_STAGES = ['Order Assembled', 'Address Confirmed', 'Order Ready to Send'];
const DISPATCHED_STAGES = ['Order Dispatched to Customer', 'Order Arrived'];

// Fetch every deal at every stage the ops dashboard cares about, in one hit.
const OPS_STAGES = [AWAITING, ...FINAL_CHECKS, MANUFACTURING, ...READY_STAGES, ...DISPATCHED_STAGES];

interface DealResponse {
  configured: boolean;
  deals: ZohoDeal[];
  mfg?: Record<string, MfgMilestones>;
  delivery?: Record<string, DeliveryMilestones>;
}

function targetWeeks(d: ZohoDeal): number {
  return isMagniFlex(d) ? 20 : 12;
}
// Weeks elapsed since manufacturing started. Uses the stored startDate from
// Redis (frozen on first sight) so status buckets don't drift when someone
// edits the deal in Zoho.
function mfgWeeksElapsed(d: ZohoDeal, milestone: MfgMilestones | undefined): number {
  return weeksSince(mfgStartOf(d, milestone));
}
function mfgStatus(d: ZohoDeal, milestone: MfgMilestones | undefined): 'on_track' | 'approaching' | 'overdue' {
  const target = targetWeeks(d);
  const elapsed = mfgWeeksElapsed(d, milestone);
  if (elapsed >= target) return 'overdue';
  if (elapsed >= target - 1) return 'approaching';
  return 'on_track';
}

export default function OpsHome() {
  const [data, setData] = useState<DealResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const url = `/api/ops/deals?stages=${encodeURIComponent(OPS_STAGES.join(','))}&withMfg=1&withDelivery=1`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Server ${res.status}`);
      setData(j);
      setLastSync(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh every 5 minutes so VAs pick up Zoho stage changes without a manual reload.
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const deals = data?.deals || [];
  const now = Date.now();

  // Buckets
  const awaiting = deals.filter(d => d.Stage === AWAITING);
  const finalChecks = deals.filter(d => FINAL_CHECKS.includes(d.Stage));
  const manufacturing = deals.filter(d => d.Stage === MANUFACTURING);
  const ready = deals.filter(d => READY_STAGES.includes(d.Stage));
  const dispatched = deals.filter(d => DISPATCHED_STAGES.includes(d.Stage));

  // Measurements sub-buckets — only overdue is surfaced on the home page.
  // The full on-track / needs-nudge breakdown lives on /ops/measurements.
  const awaitingOverdue = awaiting.filter(d => daysSince(d.Modified_Time) > 14);

  // Manufacturing sub-buckets — pass through the stored milestone so the
  // status matches what /ops/production shows exactly.
  const mfgDb = data?.mfg || {};
  const mfgOnTrack     = manufacturing.filter(d => mfgStatus(d, mfgDb[d.id]) === 'on_track');
  const mfgApproaching = manufacturing.filter(d => mfgStatus(d, mfgDb[d.id]) === 'approaching');
  const mfgOverdue     = manufacturing.filter(d => mfgStatus(d, mfgDb[d.id]) === 'overdue');

  // Post-delivery: for each dispatched deal (proxy: stage moved to Dispatched at Modified_Time)
  const deliveryDb = data?.delivery || {};
  // Match the /ops/post-delivery ranges exactly: week1 in days (3–10), the rest
  // in weeks. Widened week8 window from 7–9 to 6–10 per spec.
  const forWeekBucket = (fromWeek: number, toWeek: number, key: 'week8' | 'week16' | 'week20' | 'week24') =>
    dispatched.filter(d => {
      const weeks = weeksSince(deliveryDb[d.id]?.dispatchedAt || d.Modified_Time);
      const done = deliveryDb[d.id]?.entries[key]?.sent === true;
      return weeks >= fromWeek && weeks <= toWeek && !done;
    });
  const dueOnboarding = dispatched.filter(d => {
    const days = daysSince(deliveryDb[d.id]?.dispatchedAt || d.Modified_Time);
    const done = deliveryDb[d.id]?.entries.week1?.sent === true;
    return days >= 3 && days <= 10 && !done;
  });
  const dueFit      = forWeekBucket(6, 10, 'week8');
  const dueReview   = forWeekBucket(15, 17, 'week16');
  const dueReferral = forWeekBucket(19, 21, 'week20');
  const dueFollowUp = forWeekBucket(23, 25, 'week24');

  // Action items today — highest-priority items from each area, capped at 8
  interface Action { tone: 'bad' | 'warn' | 'good'; text: string; href: string }
  const actions: Action[] = [];
  awaitingOverdue.slice(0, 3).forEach(d => actions.push({
    tone: 'bad',
    text: `${dealCustomerName(d)} — measurements overdue ${daysSince(d.Modified_Time)} days`,
    href: '/ops/measurements',
  }));
  mfgOverdue.slice(0, 3).forEach(d => actions.push({
    tone: 'bad',
    text: `${dealCustomerName(d)} — ${d.Refractive_Magnification || 'Refractive'} week ${mfgWeeksElapsed(d, mfgDb[d.id])}/${targetWeeks(d)}`,
    href: '/ops/production',
  }));
  dueFit.slice(0, 2).forEach(d => actions.push({
    tone: 'warn',
    text: `${dealCustomerName(d)} — fit check due this week`,
    href: '/ops/post-delivery',
  }));
  void now; // reserved for future "sent-today" filtering

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-6 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Operations</h1>
          <p className="text-xs text-dim mt-1">
            {lastSync ? `Last synced ${lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · auto-refreshes every 5 minutes` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-muted hover:text-white hover:border-[#555] disabled:opacity-40 transition-colors"
        >
          {loading ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>Sync failed: {error}</span>
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      {/* Three main areas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Measurements */}
        <Link href="/ops/measurements" className="group rounded-2xl border border-[#1A1A1A] bg-surface p-5 hover:border-emerald-400/30 transition-colors">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-4">Measurements</h2>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <StatChip label="Awaiting" value={awaiting.length} tone="default" sub={`${awaitingOverdue.length} overdue`} />
            <StatChip label="Final Checks" value={finalChecks.length} tone="default" sub="in review" />
          </div>
          {awaitingOverdue.length > 0 && (
            <p className="text-[11px] text-red-400 mt-2">{awaitingOverdue.length} overdue · needs personal outreach</p>
          )}
          <span className="text-[11px] text-dim group-hover:text-emerald-300 transition-colors">Open →</span>
        </Link>

        {/* Production */}
        <Link href="/ops/production" className="group rounded-2xl border border-[#1A1A1A] bg-surface p-5 hover:border-emerald-400/30 transition-colors">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-4">Production</h2>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <StatChip label="Manufacturing" value={manufacturing.length} tone="default" sub={`${mfgOnTrack.length} on track`} />
            <StatChip label="Ready / Dispatched" value={ready.length + dispatched.length} tone="default" sub={`${ready.length} ready · ${dispatched.length} shipped`} />
          </div>
          {(mfgApproaching.length + mfgOverdue.length) > 0 && (
            <p className="text-[11px] text-amber-400 mt-2">{mfgApproaching.length} approaching · <span className="text-red-400">{mfgOverdue.length} overdue</span></p>
          )}
          <span className="text-[11px] text-dim group-hover:text-emerald-300 transition-colors">Open →</span>
        </Link>

        {/* Post-Delivery */}
        <Link href="/ops/post-delivery" className="group rounded-2xl border border-[#1A1A1A] bg-surface p-5 hover:border-emerald-400/30 transition-colors">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-4">Post-Delivery</h2>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <StatChip label="Onboarding" value={dueOnboarding.length} tone="default" sub="week 1 due" />
            <StatChip label="Fit checks" value={dueFit.length} tone="default" sub="week 8 due" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <StatChip label="Review asks" value={dueReview.length} tone="default" sub="week 16 due" />
            <StatChip label="Referral asks" value={dueReferral.length} tone="default" sub="week 20 due" />
          </div>
          <p className="text-[11px] text-dim">Follow-ups (week 24): <span className="text-white font-semibold tabular-nums">{dueFollowUp.length}</span></p>
          <span className="mt-3 block text-[11px] text-dim group-hover:text-emerald-300 transition-colors">Open →</span>
        </Link>
      </div>

      {/* Action items */}
      <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-3">Action items today</h2>
        {actions.length === 0 ? (
          <p className="text-xs text-dim italic py-3 text-center">Nothing urgent right now. Nice work.</p>
        ) : (
          <ul className="space-y-1.5">
            {actions.map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-xs ${
                    a.tone === 'bad'
                      ? 'border-red-400/30 text-red-300 hover:bg-red-400/5'
                      : a.tone === 'warn'
                        ? 'border-amber-400/30 text-amber-300 hover:bg-amber-400/5'
                        : 'border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/5'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${a.tone === 'bad' ? 'bg-red-400' : a.tone === 'warn' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span className="flex-1">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
