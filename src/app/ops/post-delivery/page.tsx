'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ZohoDeal } from '@/lib/zoho-client';
import { DELIVERY_SCHEDULE, DeliverySchedulePoint, DeliveryMilestones } from '@/lib/ops-schedules';
import WhatsAppLink from '@/components/ops/WhatsAppLink';
import WhatsAppButton from '@/components/ops/WhatsAppButton';
import CopyButton from '@/components/ops/CopyButton';
import { daysSince, dealCustomerName, extractFirstName, mailtoHref, weeksSince } from '@/lib/ops-utils';

const DISPATCHED_STAGES = ['Order Dispatched to Customer', 'Order Arrived'];

// Which schedule point a deal is currently "on" — the earliest week key
// whose milestone hasn't been sent yet, if any.
function currentPoint(entries: Record<string, { sent: boolean }>): DeliverySchedulePoint | null {
  return DELIVERY_SCHEDULE.find(p => !entries[p.key]?.sent) || null;
}

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
// sent before we mark the milestone. Prevents accidental clicks from advancing
// the record.
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

  const load = useCallback(async () => {
    setState(s => ({ ...s, error: null }));
    try {
      const url = `/api/ops/deals?stages=${encodeURIComponent(DISPATCHED_STAGES.join(','))}&withDelivery=1`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Server ${res.status}`);
      setState({ deals: j.deals || [], delivery: j.delivery || {}, lastSync: new Date(), loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const markSent = useCallback(async (dealId: string, weekKey: 'week1' | 'week8' | 'week16' | 'week20', dispatchedAt: string) => {
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

  const patchFlags = useCallback(async (
    dealId: string,
    patch: { fitCallDone?: boolean; customerHappy?: boolean | null; dispatchedAt?: string },
  ) => {
    setState(s => {
      const prev = s.delivery[dealId] || { dealId, entries: {} };
      const next: DeliveryMilestones = { ...prev };
      if (patch.dispatchedAt && !next.dispatchedAt) next.dispatchedAt = patch.dispatchedAt;
      if (patch.fitCallDone !== undefined) {
        if (patch.fitCallDone) {
          next.fitCallDone = true;
          if (!next.fitCallDate) next.fitCallDate = new Date().toISOString();
        } else {
          next.fitCallDone = false;
          next.fitCallDate = undefined;
          next.customerHappy = undefined;
        }
      }
      if (patch.customerHappy !== undefined) {
        next.customerHappy = patch.customerHappy === null ? undefined : !!patch.customerHappy;
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

  // Bucketing math shared across sections. weeks = weeks since dispatch.
  const dealAge = (d: ZohoDeal): { weeks: number; dispatchedAt: string | null } => {
    const dispatchedAt = state.delivery[d.id]?.dispatchedAt || d.Modified_Time || null;
    return { weeks: weeksSince(dispatchedAt), dispatchedAt };
  };
  const isSent = (d: ZohoDeal, key: DeliverySchedulePoint['key']) =>
    state.delivery[d.id]?.entries[key]?.sent === true;

  // "Due now" — dispatched within +/- 1 week of the target milestone AND not sent.
  // Spec: week1 3–10 days, week8 7–9 weeks, week16 15–17 weeks, week20 19–21 weeks.
  const dueWeek1 = dispatched.filter(d => {
    if (isSent(d, 'week1')) return false;
    const days = daysSince(state.delivery[d.id]?.dispatchedAt || d.Modified_Time);
    return days >= 3 && days <= 10;
  });
  const dueBucket = (
    key: DeliverySchedulePoint['key'], min: number, max: number,
  ) => dispatched.filter(d => {
    if (isSent(d, key)) return false;
    const { weeks } = dealAge(d);
    return weeks >= min && weeks <= max;
  });
  const dueFit      = dueBucket('week8', 7, 9);
  const dueReview   = dueBucket('week16', 15, 17);
  const dueReferral = dueBucket('week20', 19, 21);

  // Overdue — past due window AND not sent, up to 4 weeks late. Grouped by
  // milestone key. Anything > 4 weeks late lands in the collapsed "Missed" section.
  interface OverdueRow { deal: ZohoDeal; point: DeliverySchedulePoint; weeks: number; late: number }
  const overdue: OverdueRow[] = [];
  const missed: OverdueRow[] = [];
  const OVERDUE_WINDOW_WEEKS = 4;
  const rangeFor: Record<DeliverySchedulePoint['key'], [number, number]> = {
    week1: [0, 1],
    week8: [7, 9],
    week16: [15, 17],
    week20: [19, 21],
  };
  for (const d of dispatched) {
    const { weeks } = dealAge(d);
    for (const point of DELIVERY_SCHEDULE) {
      if (isSent(d, point.key)) continue;
      const [, max] = rangeFor[point.key];
      if (weeks <= max) continue; // still upcoming or in due-now window
      const late = weeks - max;
      const row: OverdueRow = { deal: d, point, weeks, late };
      if (late <= OVERDUE_WINDOW_WEEKS) overdue.push(row);
      else missed.push(row);
      // Only surface the first missed milestone per deal in each bucket to avoid duplication
      break;
    }
  }
  overdue.sort((a, b) => b.late - a.late);
  missed.sort((a, b) => b.late - a.late);

  // Completed: all four milestones sent
  const completed = dispatched.filter(d => {
    const e = state.delivery[d.id]?.entries || {};
    return e.week1?.sent && e.week8?.sent && e.week16?.sent && e.week20?.sent;
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

          <Section title="Due now — Fit Check" subtitle="7–9 weeks in · how's the fit?" count={dueFit.length} tone="warn">
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
            subtitle="All four milestones sent"
            open={completedOpen}
            onToggle={() => setCompletedOpen(o => !o)}
            tone="good"
          >
            {completed.length === 0 ? (
              <p className="text-xs text-dim italic py-3">Nobody has all four milestones done yet.</p>
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
  onPatchFlags: (dealId: string, patch: { fitCallDone?: boolean; customerHappy?: boolean | null; dispatchedAt?: string }) => void;
}) {
  const name = dealCustomerName(deal);
  const dispatchedAt = milestones?.dispatchedAt || deal.Modified_Time;
  const weeks = weeksSince(dispatchedAt);
  const days = daysSince(dispatchedAt);
  const dispatchedOn = dispatchedAt ? new Date(dispatchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';
  const entries = milestones?.entries || {};

  // Range for the current point — so we can compute "how late" if we're past it.
  const rangeFor: Record<DeliverySchedulePoint['key'], [number, number]> = {
    week1: [0, 1],
    week8: [7, 9],
    week16: [15, 17],
    week20: [19, 21],
  };
  const [, max] = rangeFor[point.key];
  const overdueWeeks = Math.max(0, weeks - max);
  const overdue = overdueWeeks > 0;

  // Fit-call state
  const fitCallDone = milestones?.fitCallDone === true;
  const customerHappy = milestones?.customerHappy;
  const fitCallOverdue = !fitCallDone && days > 14;
  const fitIssue = fitCallDone && customerHappy === false;
  // If VA has done the fit call but hasn't ticked "customer happy", we treat
  // the answer as still pending — surface a soft nudge but not a full FIT ISSUE.
  const fitPending = fitCallDone && customerHappy === undefined;

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
      {fitPending && (
        <p className="mt-1 text-[11px] text-dim">Fit call done — waiting on happiness confirmation.</p>
      )}

      {/* Fit call + customer happy checkboxes */}
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
        {fitCallDone && (
          <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none pl-6">
            <input
              type="checkbox"
              checked={customerHappy === true}
              onChange={e => onPatchFlags(deal.id, { customerHappy: e.target.checked ? true : false })}
              className="w-3.5 h-3.5 accent-emerald-400 cursor-pointer"
            />
            <span className={customerHappy === true ? 'text-emerald-300' : fitIssue ? 'text-amber-300' : 'text-muted'}>
              Customer happy
              {customerHappy === false && <span className="text-amber-400 ml-1.5 text-[10px] font-semibold uppercase tracking-wider">Not happy</span>}
            </span>
          </label>
        )}
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

// silence unused import lint if currentPoint isn't referenced (kept for possible future use)
void currentPoint;
