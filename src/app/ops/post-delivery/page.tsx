'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ZohoDeal } from '@/lib/zoho-client';
import { DELIVERY_SCHEDULE, DeliverySchedulePoint, DeliveryMilestones } from '@/lib/ops-schedules';
import WhatsAppLink from '@/components/ops/WhatsAppLink';
import CopyButton from '@/components/ops/CopyButton';
import { dealCustomerName, extractFirstName, mailtoHref, weeksSince } from '@/lib/ops-utils';

const DISPATCHED_STAGES = ['Order Dispatched to Customer', 'Order Arrived'];

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

// Modal shown after the VA clicks a send button. Confirms whether the email
// was actually sent before we mark the milestone. Prevents accidental clicks
// from advancing the record.
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
          dealId,
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

  // Bucket dispatched deals by which milestone is due, using the KV-stored
  // dispatchedAt if present or falling back to Modified_Time (when the stage
  // transitioned to Dispatched). Ranges match the spec exactly.
  const dispatched = state.deals.filter(d => DISPATCHED_STAGES.includes(d.Stage));
  const bucketFor = (key: 'week1' | 'week8' | 'week16' | 'week20', fromWeek: number, toWeek: number) =>
    dispatched.filter(d => {
      const dispatchedAt = state.delivery[d.id]?.dispatchedAt || d.Modified_Time;
      const weeks = weeksSince(dispatchedAt);
      const done = state.delivery[d.id]?.entries[key]?.sent === true;
      return weeks >= fromWeek && weeks <= toWeek && !done;
    })
      .sort((a, b) => weeksSince(state.delivery[b.id]?.dispatchedAt || b.Modified_Time) - weeksSince(state.delivery[a.id]?.dispatchedAt || a.Modified_Time));

  const dueDelivery = bucketFor('week1', 0, 2);   // dispatched ~5–14 days ago
  const dueFit      = bucketFor('week8', 6, 10);
  const dueReview   = bucketFor('week16', 14, 18);
  const dueReferral = bucketFor('week20', 19, 24);

  // Completed: all four milestones sent
  const completed = dispatched.filter(d => {
    const e = state.delivery[d.id]?.entries || {};
    return e.week1?.sent && e.week8?.sent && e.week16?.sent && e.week20?.sent;
  });

  const openMailto = (deal: ZohoDeal, point: DeliverySchedulePoint) => {
    const first = extractFirstName(dealCustomerName(deal));
    const mailto = mailtoHref(deal.Email, point.emailSubject, point.emailBody(first, productName(deal)));
    // Fire the mailto and then queue the confirm modal so the user can mark it done
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
        <span>Delivery: <span className="text-white font-semibold tabular-nums">{dueDelivery.length}</span></span>
        <span>Fit: <span className="text-white font-semibold tabular-nums">{dueFit.length}</span></span>
        <span>Review: <span className="text-white font-semibold tabular-nums">{dueReview.length}</span></span>
        <span>Referral: <span className="text-white font-semibold tabular-nums">{dueReferral.length}</span></span>
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
          <Section title="Due now — Delivery check" subtitle="Dispatched 5–14 days ago · check they arrived safely" count={dueDelivery.length} tone="warn">
            {dueDelivery.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[0]} openMailto={openMailto} />
            ))}
          </Section>

          <Section title="Due now — Fit check" subtitle="6–10 weeks in · how's the fit?" count={dueFit.length} tone="warn">
            {dueFit.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[1]} openMailto={openMailto} />
            ))}
          </Section>

          <Section title="Due now — Review request" subtitle="14–18 weeks in · ask for a Google review" count={dueReview.length} tone="warn">
            {dueReview.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[2]} openMailto={openMailto} />
            ))}
          </Section>

          <Section title="Due now — Referral ask" subtitle="19–24 weeks in · any colleagues interested?" count={dueReferral.length} tone="warn">
            {dueReferral.map(d => (
              <DeliveryCard key={d.id} deal={d} milestones={state.delivery[d.id]} point={DELIVERY_SCHEDULE[3]} openMailto={openMailto} />
            ))}
          </Section>

          <Section title="Completed" subtitle="All four milestones sent" count={completed.length} tone="good">
            {completed.map(d => (
              <div key={d.id} className="rounded-lg border border-[#1A1A1A] bg-[#111] px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
                <span className="text-emerald-400">✓</span>
                <span className="text-white font-medium">{dealCustomerName(d)}</span>
                {d.Country && <span className="text-dim">{d.Country}</span>}
                <span className="text-dim">— {productName(d)}</span>
              </div>
            ))}
          </Section>
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
  tone: 'warn' | 'good';
  children: React.ReactNode;
}) {
  const accent = tone === 'good' ? 'text-emerald-400' : 'text-amber-400';
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

function DeliveryCard({
  deal, milestones, point, openMailto,
}: {
  deal: ZohoDeal;
  milestones: DeliveryMilestones | undefined;
  point: DeliverySchedulePoint;
  openMailto: (deal: ZohoDeal, point: DeliverySchedulePoint) => void;
}) {
  const name = dealCustomerName(deal);
  const dispatchedAt = milestones?.dispatchedAt || deal.Modified_Time;
  const weeks = weeksSince(dispatchedAt);
  const dispatchedOn = dispatchedAt ? new Date(dispatchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';
  const overdue = weeks - point.week > 2;
  const entries = milestones?.entries || {};

  return (
    <div className={`rounded-xl bg-[#111] border ${overdue ? 'border-red-400/40' : 'border-[#1A1A1A]'} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name || 'Unnamed'} <span className="text-dim font-normal">— {productName(deal)} — {deal.Country || '?'}</span></p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {deal.Phone && <WhatsAppLink phone={deal.Phone} />}
            {deal.Email && <span className="text-[11px] text-dim truncate">{deal.Email}</span>}
          </div>
        </div>
        {overdue && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
            Overdue — {weeks - point.week}w late
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-dim">Dispatched: {dispatchedOn} ({weeks} week{weeks === 1 ? '' : 's'} ago) · Due: <span className="text-amber-300 uppercase font-semibold tracking-wider">{point.label}</span></p>

      {/* Milestone list */}
      <ul className="mt-3 space-y-0.5">
        {DELIVERY_SCHEDULE.map(m => {
          const entry = entries[m.key];
          const isSent = !!entry?.sent;
          const isCurrent = m.key === point.key && !isSent;
          const sentDate = entry?.sentAt ? new Date(entry.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
          return (
            <li key={m.key} className="flex items-center gap-2 text-[11px]">
              <span className={`w-4 text-center ${isSent ? 'text-emerald-400' : isCurrent ? 'text-amber-400' : 'text-dim'}`}>
                {isSent ? '✓' : isCurrent ? '●' : '○'}
              </span>
              <span className={`flex-1 ${isSent ? 'text-muted line-through' : isCurrent ? 'text-amber-300' : 'text-dim'}`}>
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
          onClick={() => openMailto(deal, point)}
          className="px-3 py-1.5 rounded-md bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-400/25 transition-colors"
        >Send {point.label}</button>
        <CopyButton value={deal.Email} label="Copy email" />
        <CopyButton value={deal.Phone} label="Copy phone" />
      </div>
    </div>
  );
}
