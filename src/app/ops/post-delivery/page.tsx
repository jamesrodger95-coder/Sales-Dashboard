'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZohoDeal } from '@/lib/zoho-client';
import { DELIVERY_SCHEDULE, DeliverySchedulePoint, DeliveryMilestones, DeliveryWeekKey } from '@/lib/ops-schedules';
import WhatsAppLink from '@/components/ops/WhatsAppLink';
import WhatsAppButton from '@/components/ops/WhatsAppButton';
import CopyButton from '@/components/ops/CopyButton';
import { daysSince, dealCustomerName, extractFirstName, mailtoHref, weeksSince } from '@/lib/ops-utils';

const DISPATCHED_STAGES = ['Order Dispatched to Customer', 'Order Arrived'];

// Windows for each milestone — used by both "Due now" and "Overdue" bucketing.
// week1 is expressed in days; the rest in whole weeks.
const RANGE_DAYS: Record<'week1', [number, number]> = { week1: [3, 10] };
const RANGE_WEEKS: Record<Exclude<DeliveryWeekKey, 'week1'>, [number, number]> = {
  week8:  [6, 10],  // widened per spec — original 7–9 was showing zero cards
  week16: [15, 17],
  week20: [19, 21],
  week24: [23, 25],
};

const OVERDUE_WINDOW_WEEKS = 4;

interface State {
  deals: ZohoDeal[];
  delivery: Record<string, DeliveryMilestones>;
  lastSync: Date | null;
  loading: boolean;
  error: string | null;
}

function productName(d: ZohoDeal) {
  const mag = d.Refractive_Magnification;
  if (!mag || mag === '-None-') return 'Bryant Dental loupes';
  if (mag === 'MagniFlex') return 'MagniFlex';
  return `${mag} Refractive`;
}

// Modal shown after clicking a send button. Confirms the email was actually
// sent before we mark the milestone.
function ConfirmModal({
  open, deal, point, onClose, onConfirm,
}: {
  open: boolean;
  deal: ZohoDeal | null;
  point: DeliverySchedulePoint | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !deal || !point) return null;
  const name = dealCustomerName(deal);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-[#0F0F0F] border border-[#222] p-5 space-y-4">
        <div>
          <h2 className="text-white font-semibold text-sm">Did you send the {point.label.toLowerCase()} email to {name}?</h2>
          <p className="text-xs text-dim mt-1">Marking as done will move this out of the &ldquo;Due now&rdquo; list.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-xl bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-sm font-semibold hover:bg-emerald-400/30 transition-colors">
            Yes, mark as done
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-dim hover:text-white">
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PostDeliveryPage() {
  const [state, setState] = useState<State>({ deals: [], delivery: {}, lastSync: null, loading: true, error: null });
  const [confirmFor, setConfirmFor] = useState<{ deal: ZohoDeal; point: DeliverySchedulePoint } | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);
  // Only log the debug distribution once per real fetch (not on every render)
  const debugLoggedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setState(s => ({ ...s, error: null }));
    try {
      const url = `/api/ops/deals?stages=${encodeURIComponent(DISPATCHED_STAGES.join(','))}&withDelivery=1`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Server ${res.status}`);
      const deals: ZohoDeal[] = j.deals || [];
      const delivery: Record<string, DeliveryMilestones> = j.delivery || {};
      setState({ deals, delivery, lastSync: new Date(), loading: false, error: null });

      // Debug: dump the weeks-since-dispatch distribution and 10 sample rows.
      // Fingerprint prevents re-logging on 5-minute auto-refreshes if nothing changed.
      const fp = `${deals.length}:${deals.map(d => d.Modified_Time?.slice(0, 10)).slice(0, 5).join(',')}`;
      if (typeof window !== 'undefined' && debugLoggedRef.current !== fp) {
        debugLoggedRef.current = fp;
        const now = Date.now();
        const dist: Record<string, number> = { '0-4w': 0, '5-9w': 0, '10-15w': 0, '16-24w': 0, '25w+': 0 };
        const dispatched = deals.filter(d => DISPATCHED_STAGES.includes(d.Stage));
        const rows = dispatched.map(d => {
          const dispatchedAt = delivery[d.id]?.dispatchedAt || d.Modified_Time;
          const weeks = dispatchedAt ? Math.floor((now - new Date(dispatchedAt).getTime()) / (7 * 86400000)) : 0;
          if (weeks <= 4) dist['0-4w']++;
          else if (weeks <= 9) dist['5-9w']++;
          else if (weeks <= 15) dist['10-15w']++;
          else if (weeks <= 24) dist['16-24w']++;
          else dist['25w+']++;
          return {
            name: dealCustomerName(d),
            stage: d.Stage,
            modified: (d.Modified_Time || '').slice(0, 10),
            weeks,
          };
        });
        console.log(`[post-delivery] ${dispatched.length} dispatched deal(s) · weeks-since-dispatch:`, dist);
        console.log('[post-delivery] first 10 samples:', rows.slice(0, 10));
        // Also log any deals that WOULD match the fit-check window with the new range
        const fitCandidates = rows.filter(r => r.weeks >= 6 && r.weeks <= 10);
        console.log(`[post-delivery] fit-check window (6-10w) candidates: ${fitCandidates.length}`, fitCandidates.slice(0, 10));
      }
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const markSent = useCallback(async (dealId: string, weekKey: DeliveryWeekKey, dispatchedAt: string) => {
    setState(s => ({
      ...s,
      delivery: {
        ...s.delivery,
        [dealId]: {
          ...(s.delivery[dealId] || { dealId, entries: {} }),
          dispatchedAt: s.delivery[dealId]?.dispatchedAt || dispatchedAt,
          entries: { ...(s.delivery[dealId]?.entries || {}), [weekKey]: { sent: true, sentAt: new Date().toISOString() } },
        },
      },
    }));
    try {
      await fetch('/api/ops/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'delivery', dealId, weekKey, sent: true, dispatchedAt }),
      });
    } catch (err) {
      console.error('[post-delivery] mark sent failed', err);
      load();
    }
  }, [load]);

  // Patches for the two independent flags. Either field can be toggled without
  // touching the other — the checkboxes in the UI are independent per the spec.
  const patchFlags = useCallback(async (
    dealId: string,
    patch: { fitCallDone?: boolean; customerHappy?: boolean; dispatchedAt?: string },
  ) => {
    setState(s => {
      const prev = s.delivery[dealId] || { dealId, entries: {} };
      const next: DeliveryMilestones = { ...prev };
      if (patch.dispatchedAt && !next.dispatchedAt) next.dispatchedAt = patch.dispatchedAt;
      if (patch.fitCallDone !== undefined) {
        next.fitCallDone = patch.fitCallDone;
        // Stamp the fit-call date on first-tick only; unticking clears it.
        if (patch.fitCallDone && !next.fitCallDate) next.fitCallDate = new Date().toISOString();
        if (!patch.fitCallDone) next.fitCallDate = undefined;
      }
      if (patch.customerHappy !== undefined) {
        next.customerHappy = patch.customerHappy;
      }
      return { ...s, delivery: { ...s.delivery, [dealId]: next } };
    });
    try {
      await fetch('/api/ops/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'delivery', dealId, action: 'flags', ...patch }),
      });
    } catch (err) {
      console.error('[post-delivery] patchFlags failed', err);
      load();
    }
  }, [load]);

  const dispatched = state.deals.filter(d => DISPATCHED_STAGES.includes(d.Stage));

  const dealAge = (d: ZohoDeal): { weeks: number; days: number; dispatchedAt: string | null } => {
    const dispatchedAt = state.delivery[d.id]?.dispatchedAt || d.Modified_Time || null;
    return { weeks: weeksSince(dispatchedAt), days: daysSince(dispatchedAt), dispatchedAt };
  };
  const isSent = (d: ZohoDeal, key: DeliveryWeekKey) =>
    state.delivery[d.id]?.entries[key]?.sent === true;

  // "Due now" buckets. week1 uses days, everything else uses weeks.
  const dueWeek1 = dispatched.filter(d => {
    if (isSent(d, 'week1')) return false;
    const { days } = dealAge(d);
    const [min, max] = RANGE_DAYS.week1;
    return days >= min && days <= max;
  });
  const dueBucket = (key: Exclude<DeliveryWeekKey, 'week1'>) => {
    const [min, max] = RANGE_WEEKS[key];
    return dispatched.filter(d => {
      if (isSent(d, key)) return false;
      const { weeks } = dealAge(d);
      return weeks >= min && weeks <= max;
    });
  };
  const dueFit       = dueBucket('week8');
  const dueReview    = dueBucket('week16');
  const dueReferral  = dueBucket('week20');
  const dueFollowUp  = dueBucket('week24');

  // Weeks-past-window helper — negative when still upcoming.
  const weeksLateForPoint = (d: ZohoDeal, key: DeliveryWeekKey): number => {
    const { weeks, days } = dealAge(d);
    if (key === 'week1') {
      const [, maxDays] = RANGE_DAYS.week1;
      return Math.max(0, Math.floor((days - maxDays) / 7));
    }
    const [, maxWeeks] = RANGE_WEEKS[key as Exclude<DeliveryWeekKey, 'week1'>];
    return weeks - maxWeeks;
  };

  // Overdue — past due window AND not sent, up to 4 weeks late. Anything > 4
  // weeks late lands in the Missed section (collapsed).
  interface OverdueRow { deal: ZohoDeal; point: DeliverySchedulePoint; late: number }
  const overdue: OverdueRow[] = [];
  const missed: OverdueRow[] = [];
  for (const d of dispatched) {
    for (const point of DELIVERY_SCHEDULE) {
      if (isSent(d, point.key)) continue;
      const late = weeksLateForPoint(d, point.key);
      if (late <= 0) continue; // still upcoming or currently in due-now window
      const row: OverdueRow = { deal: d, point, late };
      if (late <= OVERDUE_WINDOW_WEEKS) overdue.push(row);
      else missed.push(row);
      // Only surface the first missed milestone per deal
      break;
    }
  }
  overdue.sort((a, b) => b.late - a.late);
  missed.sort((a, b) => b.late - a.late);

  // Completed: all FIVE milestones sent.
  const completed = dispatched.filter(d => {
    const e = state.delivery[d.id]?.entries || {};
    return e.week1?.sent && e.week8?.sent && e.week16?.sent && e.week20?.sent && e.week24?.sent;
  });

  const openMailto = (deal: ZohoDeal, point: DeliverySchedulePoint) => {
    const first = extractFirstName(dealCustomerName(deal));
    const mailto = mailtoHref(deal.Email, point.emailSubject, point.emailBody(first, productName(deal)));
    window.location.href = mailto;
    setConfirmFor({ deal, point });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Post-Delivery Follow-Ups</h1>
          <p className="text-xs text-dim mt-1">
            {state.lastSync ? `Last synced ${state.lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </p>
        </div>
        <button onClick={load} disabled={state.loading} className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-muted hover:text-white hover:border-[#555] disabled:opacity-40 transition-colors">
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-[#1A1A1A] bg-surface p-3 mb-6 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span>Onboarding: <span className="text-white font-semibold tabular-nums">{dueWeek1.length}</span></span>
        <span>Fit: <span className="text-white font-semibold tabular-nums">{dueFit.length}</span></span>
        <span>Review: <span className="text-white font-semibold tabular-nums">{dueReview.length}</span></span>
        <span>Referral: <span className="text-white font-semibold tabular-nums">{dueReferral.length}</span></span>
        <span>Follow-up: <span className="text-white font-semibold tabular-nums">{dueFollowUp.length}</span></span>
        <span className="text-[#333]">·</span>
        <span className="text-red-400">Overdue: <span className="tabular-nums">{overdue.length}</span></span>
        <span className="text-dim">Missed: <span className="tabular-nums">{missed.length}</span></span>
        <span className="text-[#333]">·</span>
        <span className="text-emerald-400">Completed: <span className="tabular-nums">{completed.length}</span></span>
      </div>

      {state.error && (
        <div className="mb-4 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>Sync failed: {state.error}</span>
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      {state.loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-[#1A1A1A]/60 animate-pulse" />)}</div>
      ) : (
        <div className="space-y-6">
          <Section title="Due now — Onboarding" subtitle="Dispatched 3–10 days ago · welcome, confirm delivery, introduce support" count={dueWeek1.length} tone="warn">
            {dueWeek1.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[0]} onSend={openMailto} onPatchFlags={patchFlags} />
            ))}
          </Section>

          <Section title="Due now — Fit Check" subtitle="6–10 weeks in · how's the fit?" count={dueFit.length} tone="warn">
            {dueFit.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[1]} onSend={openMailto} onPatchFlags={patchFlags} />
            ))}
          </Section>

          <Section title="Due now — Review Request" subtitle="15–17 weeks in · ask for a Google review" count={dueReview.length} tone="warn">
            {dueReview.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[2]} onSend={openMailto} onPatchFlags={patchFlags} />
            ))}
          </Section>

          <Section title="Due now — Referral Ask" subtitle="19–21 weeks in · any colleagues interested?" count={dueReferral.length} tone="warn">
            {dueReferral.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[3]} onSend={openMailto} onPatchFlags={patchFlags} />
            ))}
          </Section>

          <Section title="Due now — Review & Referral Follow-Up" subtitle="23–25 weeks in · 6-month check-in" count={dueFollowUp.length} tone="warn">
            {dueFollowUp.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[4]} onSend={openMailto} onPatchFlags={patchFlags} />
            ))}
          </Section>

          <Section title="Overdue" subtitle="Missed the window, up to 4 weeks late — catch these up fast" count={overdue.length} tone="bad">
            {overdue.map(({ deal, point }) => (
              <DeliveryCard key={`${deal.id}-${point.key}`} deal={deal} milestones={state.delivery[deal.id]} point={point} onSend={openMailto} onPatchFlags={patchFlags} />
            ))}
          </Section>

          {/* Missed — collapsed by default */}
          <CollapsibleSection
            title={`Missed (${missed.length})`}
            subtitle="More than 4 weeks past due — collapsed to keep the main view clean"
            open={missedOpen}
            onToggle={() => setMissedOpen(o => !o)}
            tone="dim"
          >
            {missed.length === 0 ? (
              <p className="text-xs text-dim italic py-3">No missed milestones.</p>
            ) : (
              <div className="space-y-2">
                {missed.slice(0, 40).map(({ deal, point, late }) => (
                  <div key={`${deal.id}-${point.key}`} className="text-xs text-muted px-3 py-2 border border-[#1A1A1A] rounded-lg bg-[#111] flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{dealCustomerName(deal)}</span>
                    <span className="text-dim">— {productName(deal)}</span>
                    <span className="text-red-400 tabular-nums">Week {point.week} · {late}w late</span>
                  </div>
                ))}
                {missed.length > 40 && <p className="text-[11px] text-dim italic pt-2">+{missed.length - 40} more.</p>}
              </div>
            )}
          </CollapsibleSection>

          {/* Completed — collapsed by default */}
          <CollapsibleSection
            title={`Completed (${completed.length})`}
            subtitle="All five milestones sent"
            open={completedOpen}
            onToggle={() => setCompletedOpen(o => !o)}
            tone="good"
          >
            {completed.length === 0 ? (
              <p className="text-xs text-dim italic py-3">Nobody has all five milestones done yet.</p>
            ) : (
              <div className="space-y-1">
                {completed.map(d => (
                  <div key={d.id} className="rounded-lg border border-[#1A1A1A] bg-[#111] px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-white font-medium">{dealCustomerName(d)}</span>
                    {d.Country && <span className="text-dim">{d.Country}</span>}
                    <span className="text-dim">— {productName(d)}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>
      )}

      <ConfirmModal
        open={!!confirmFor}
        deal={confirmFor?.deal || null}
        point={confirmFor?.point || null}
        onClose={() => setConfirmFor(null)}
        onConfirm={() => {
          if (confirmFor) {
            const dispatchedAt = state.delivery[confirmFor.deal.id]?.dispatchedAt || confirmFor.deal.Modified_Time || new Date().toISOString();
            markSent(confirmFor.deal.id, confirmFor.point.key, dispatchedAt);
          }
          setConfirmFor(null);
        }}
      />
    </div>
  );
}

// ============================================================================
function Section({ title, subtitle, count, tone, children }: {
  title: string;
  subtitle: string;
  count: number;
  tone: 'warn' | 'good' | 'bad';
  children: React.ReactNode;
}) {
  const accent = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-amber-400';
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accent}`}>{title} ({count})</h2>
      </div>
      <p className="text-[11px] text-dim mb-2">{subtitle}</p>
      {count === 0 ? (
        <p className="text-xs text-dim italic py-4">Nothing here right now.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function CollapsibleSection({
  title, subtitle, open, onToggle, tone, children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  tone: 'good' | 'dim';
  children: React.ReactNode;
}) {
  const accent = tone === 'good' ? 'text-emerald-400' : 'text-dim';
  return (
    <section className="rounded-xl border border-[#1A1A1A] bg-surface overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition">
        <div className="text-left">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accent}`}>{title}</span>
          <p className="text-[11px] text-dim mt-0.5">{subtitle}</p>
        </div>
        <span className="text-dim text-xs">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function DeliveryCard({
  deal, milestones, point, onSend, onPatchFlags,
}: {
  deal: ZohoDeal;
  milestones: DeliveryMilestones | undefined;
  point: DeliverySchedulePoint;
  onSend: (deal: ZohoDeal, point: DeliverySchedulePoint) => void;
  onPatchFlags: (dealId: string, patch: { fitCallDone?: boolean; customerHappy?: boolean; dispatchedAt?: string }) => void;
}) {
  const name = dealCustomerName(deal);
  const dispatchedAt = milestones?.dispatchedAt || deal.Modified_Time;
  const weeks = weeksSince(dispatchedAt);
  const days = daysSince(dispatchedAt);
  const dispatchedOn = dispatchedAt ? new Date(dispatchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';
  const entries = milestones?.entries || {};

  // Max of the current point's window — used to work out "how late".
  const rangeMax = point.key === 'week1' ? Math.ceil(RANGE_DAYS.week1[1] / 7) : RANGE_WEEKS[point.key as Exclude<DeliveryWeekKey, 'week1'>][1];
  const overdueWeeks = Math.max(0, weeks - rangeMax);
  const overdue = overdueWeeks > 0;

  // Independent flag state — both checkboxes render regardless of the other's state.
  const fitCallDone = milestones?.fitCallDone === true;
  const customerHappy = milestones?.customerHappy === true;
  const fitCallOverdue = !fitCallDone && days > 14;
  // A fit issue is "customer is not happy" — treated as amber. No inference
  // about "happiness pending" — the two flags are independent.
  const fitIssue = fitCallDone && milestones?.customerHappy === false;

  return (
    <div className={`rounded-xl bg-[#111] border ${fitIssue ? 'border-amber-400/50' : overdue ? 'border-red-400/40' : 'border-[#1A1A1A]'} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name || 'Unnamed'} <span className="text-dim font-normal">— {productName(deal)} — {deal.Country || '?'}</span></p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {deal.Phone && <WhatsAppLink phone={deal.Phone} />}
            {deal.Email && <span className="text-[11px] text-dim truncate">{deal.Email}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {fitIssue && <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Fit issue</span>}
          {overdue && !fitIssue && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
              {overdueWeeks}w late
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-dim">Dispatched: {dispatchedOn} ({weeks} week{weeks === 1 ? '' : 's'} ago) · Due: <span className="text-amber-300 uppercase font-semibold tracking-wider">{point.label}</span></p>

      {fitCallOverdue && (
        <p className="mt-1 text-[11px] text-amber-400">Fit call not done — {days} days since delivery.</p>
      )}

      {/* Independent checkboxes — both always visible, either can be ticked in any order. */}
      <div className="mt-3 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={fitCallDone}
            onChange={e => onPatchFlags(deal.id, { fitCallDone: e.target.checked, dispatchedAt: dispatchedAt || undefined })}
            className="w-3.5 h-3.5 accent-emerald-400 cursor-pointer"
          />
          <span className={fitCallDone ? 'text-emerald-300' : 'text-muted'}>
            Fit call done
            {fitCallDone && milestones?.fitCallDate && (
              <span className="text-dim ml-1.5">({new Date(milestones.fitCallDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})</span>
            )}
          </span>
        </label>
        <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={customerHappy}
            onChange={e => onPatchFlags(deal.id, { customerHappy: e.target.checked, dispatchedAt: dispatchedAt || undefined })}
            className="w-3.5 h-3.5 accent-emerald-400 cursor-pointer"
          />
          <span className={customerHappy ? 'text-emerald-300' : fitIssue ? 'text-amber-300' : 'text-muted'}>
            Customer happy
            {fitIssue && <span className="text-amber-400 ml-1.5 text-[10px] font-semibold uppercase tracking-wider">Not happy</span>}
          </span>
        </label>
      </div>

      {/* Milestone list */}
      <ul className="mt-3 space-y-0.5">
        {DELIVERY_SCHEDULE.map(m => {
          const entry = entries[m.key];
          const isSentEntry = !!entry?.sent;
          const isCurrent = m.key === point.key && !isSentEntry;
          const sentDate = entry?.sentAt ? new Date(entry.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
          return (
            <li key={m.key} className="flex items-center gap-2 text-[11px]">
              <span className={`w-4 text-center ${isSentEntry ? 'text-emerald-400' : isCurrent ? 'text-amber-400' : 'text-dim'}`}>
                {isSentEntry ? '✓' : isCurrent ? '●' : '○'}
              </span>
              <span className={`flex-1 ${isSentEntry ? 'text-muted line-through' : isCurrent ? 'text-amber-300' : 'text-dim'}`}>
                Week {m.week} — {m.label}
                {sentDate && <span className="text-dim ml-1.5">(sent {sentDate})</span>}
                {isCurrent && <span className="text-amber-400 ml-1.5 font-semibold uppercase text-[9px] tracking-wider">Due now</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => onSend(deal, point)}
          className="px-3 py-1.5 rounded-md bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-400/25 transition-colors"
        >Send {point.label}</button>
        <WhatsAppButton phone={deal.Phone} />
        <CopyButton value={deal.Email} label="Copy email" />
        <CopyButton value={deal.Phone} label="Copy phone" />
      </div>
    </div>
  );
}
