'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ZohoDeal } from '@/lib/zoho-client';
import type { MfgMilestones, MfgSchedulePoint } from '@/lib/ops-schedules';
import { REFRACTIVE_SCHEDULE, MAGNIFLEX_SCHEDULE } from '@/lib/ops-schedules';
import WhatsAppLink from '@/components/ops/WhatsAppLink';
import CopyButton from '@/components/ops/CopyButton';
import { daysSince, dealCustomerName, extractFirstName, mailtoHref, weeksSince } from '@/lib/ops-utils';

const MANUFACTURING = 'In Manufacturing';
const READY_STAGES = ['Order Assembled', 'Address Confirmed', 'Order Ready to Send'];
const DISPATCHED_STAGES = ['Order Dispatched to Customer', 'Order Arrived'];
const ALL = [MANUFACTURING, ...READY_STAGES, ...DISPATCHED_STAGES];

type Tab = 'manufacturing' | 'ready' | 'dispatched';

interface State {
  deals: ZohoDeal[];
  mfg: Record<string, MfgMilestones>;
  lastSync: Date | null;
  loading: boolean;
  error: string | null;
}

function isMagniFlex(d: ZohoDeal) {
  return (d.Refractive_Magnification || '').toLowerCase() === 'magniflex';
}
function targetWeeks(d: ZohoDeal) {
  return isMagniFlex(d) ? 20 : 12;
}
function scheduleFor(d: ZohoDeal): MfgSchedulePoint[] {
  return isMagniFlex(d) ? MAGNIFLEX_SCHEDULE : REFRACTIVE_SCHEDULE;
}
function productName(d: ZohoDeal) {
  const mag = d.Refractive_Magnification;
  if (!mag || mag === '-None-') return 'Bryant Dental loupes';
  if (mag === 'MagniFlex') return 'MagniFlex';
  return `${mag} Refractive`;
}
function mfgWeeksElapsed(d: ZohoDeal) {
  return weeksSince(d.Payment_Authorisation_Date || d.Created_Time);
}
function mfgStatus(d: ZohoDeal): 'on_track' | 'approaching' | 'overdue' {
  const target = targetWeeks(d);
  const elapsed = mfgWeeksElapsed(d);
  if (elapsed >= target) return 'overdue';
  if (elapsed >= target - 1) return 'approaching';
  return 'on_track';
}

export default function ProductionPage() {
  const [state, setState] = useState<State>({ deals: [], mfg: {}, lastSync: null, loading: true, error: null });
  const [tab, setTab] = useState<Tab>('manufacturing');

  const load = useCallback(async () => {
    setState(s => ({ ...s, error: null }));
    try {
      const url = `/api/ops/deals?stages=${encodeURIComponent(ALL.join(','))}&withMfg=1`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Server ${res.status}`);
      setState({ deals: j.deals || [], mfg: j.mfg || {}, lastSync: new Date(), loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const markSent = useCallback(async (dealId: string, weekKey: string) => {
    // Optimistic
    setState(s => ({
      ...s,
      mfg: {
        ...s.mfg,
        [dealId]: {
          dealId,
          entries: { ...(s.mfg[dealId]?.entries || {}), [weekKey]: { sent: true, sentAt: new Date().toISOString() } },
        },
      },
    }));
    try {
      const res = await fetch('/api/ops/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mfg', dealId, weekKey, sent: true }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      console.error('[production] mark sent failed', err);
      load();
    }
  }, [load]);

  const manufacturing = useMemo(() => state.deals.filter(d => d.Stage === MANUFACTURING), [state.deals]);
  const ready         = useMemo(() => state.deals.filter(d => READY_STAGES.includes(d.Stage)), [state.deals]);
  const dispatched    = useMemo(() =>
    state.deals
      .filter(d => DISPATCHED_STAGES.includes(d.Stage))
      .filter(d => daysSince(d.Modified_Time) <= 30) // last 30 days only
      .sort((a, b) => (b.Modified_Time || '').localeCompare(a.Modified_Time || '')),
    [state.deals]);

  const mfgOnTrack     = manufacturing.filter(d => mfgStatus(d) === 'on_track').length;
  const mfgApproaching = manufacturing.filter(d => mfgStatus(d) === 'approaching').length;
  const mfgOverdue     = manufacturing.filter(d => mfgStatus(d) === 'overdue').length;

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Production</h1>
          <p className="text-xs text-dim mt-1">
            {state.lastSync ? `Last synced ${state.lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </p>
        </div>
        <button onClick={load} disabled={state.loading} className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-muted hover:text-white hover:border-[#555] disabled:opacity-40 transition-colors">
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border border-[#1A1A1A] bg-surface p-3 mb-4 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span>Manufacturing: <span className="text-white font-semibold tabular-nums">{manufacturing.length}</span></span>
        <span className="text-emerald-400">On track: <span className="tabular-nums">{mfgOnTrack}</span></span>
        <span className="text-amber-400">Approaching: <span className="tabular-nums">{mfgApproaching}</span></span>
        <span className="text-red-400">Overdue: <span className="tabular-nums">{mfgOverdue}</span></span>
        <span className="text-[#333]">·</span>
        <span>Ready to Ship: <span className="text-white font-semibold tabular-nums">{ready.length}</span></span>
        <span className="text-[#333]">·</span>
        <span>Dispatched (30d): <span className="text-white font-semibold tabular-nums">{dispatched.length}</span></span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(['manufacturing', 'ready', 'dispatched'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              tab === t ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/40' : 'text-muted border-[#333] hover:text-white'
            }`}
          >
            {t === 'manufacturing' && `In Manufacturing (${manufacturing.length})`}
            {t === 'ready' && `Ready to Ship (${ready.length})`}
            {t === 'dispatched' && `Dispatched (${dispatched.length})`}
          </button>
        ))}
      </div>

      {state.error && (
        <div className="mb-4 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>Sync failed: {state.error}</span>
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      {state.loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-[#1A1A1A]/60 animate-pulse" />)}</div>
      ) : tab === 'manufacturing' ? (
        manufacturing.length === 0
          ? <Empty message="Nothing in manufacturing." />
          : (
              <div className="space-y-3">
                {[...manufacturing]
                  .sort((a, b) => mfgWeeksElapsed(b) - mfgWeeksElapsed(a))
                  .map(d => (
                    <ManufacturingCard key={d.id} deal={d} milestones={state.mfg[d.id]} onSent={markSent} />
                  ))}
              </div>
            )
      ) : tab === 'ready' ? (
        ready.length === 0
          ? <Empty message="Nothing ready to ship." />
          : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ready.map(d => <ReadyCard key={d.id} deal={d} />)}
              </div>
            )
      ) : (
        dispatched.length === 0
          ? <Empty message="No dispatches in the last 30 days." />
          : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dispatched.map(d => <DispatchedCard key={d.id} deal={d} />)}
              </div>
            )
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-xs text-dim italic text-center py-10">{message}</p>;
}

// ============================================================================
// Manufacturing card — the big one, with milestone tracking
// ============================================================================
function ManufacturingCard({ deal, milestones, onSent }: { deal: ZohoDeal; milestones: MfgMilestones | undefined; onSent: (dealId: string, weekKey: string) => void }) {
  const schedule = scheduleFor(deal);
  const elapsed = mfgWeeksElapsed(deal);
  const target = targetWeeks(deal);
  const status = mfgStatus(deal);
  const pct = Math.min(100, (elapsed / target) * 100);
  const barColor = status === 'overdue' ? 'bg-red-500' : status === 'approaching' ? 'bg-amber-400' : 'bg-emerald-400';
  const borderCls = status === 'overdue' ? 'border-red-400/40' : status === 'approaching' ? 'border-amber-400/30' : 'border-[#1A1A1A]';

  const entries = milestones?.entries || {};
  const dueNow = schedule.find(m => elapsed >= m.week && !entries[`week${m.week}`]?.sent);
  const name = dealCustomerName(deal);

  return (
    <div className={`rounded-xl bg-[#111] border ${borderCls} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name || 'Unnamed order'} <span className="text-dim font-normal">— {productName(deal)}</span></p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {deal.Phone && <WhatsAppLink phone={deal.Phone} />}
            {deal.Country && <span className="text-[11px] text-dim">{deal.Country}</span>}
            {deal.Email && <span className="text-[11px] text-dim truncate">{deal.Email}</span>}
          </div>
        </div>
        <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          status === 'overdue' ? 'text-red-400 bg-red-500/10'
          : status === 'approaching' ? 'text-amber-400 bg-amber-500/10'
          : 'text-emerald-400 bg-emerald-500/10'
        }`}>
          {status === 'overdue' ? 'Overdue' : status === 'approaching' ? 'Approaching' : 'On track'}
        </span>
      </div>

      {/* Progress */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-dim mb-1">
          <span>Week {elapsed} of {target}</span>
          {status === 'overdue' && <span className="text-red-400 font-semibold">{elapsed - target} week{elapsed - target === 1 ? '' : 's'} overdue</span>}
        </div>
        <div className="h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Milestones */}
      <ul className="mt-3 space-y-1">
        {schedule.map(m => {
          const entry = entries[`week${m.week}`];
          const isSent = !!entry?.sent;
          const isDue = !isSent && elapsed >= m.week;
          const sentDate = entry?.sentAt ? new Date(entry.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
          return (
            <li key={m.week} className="flex items-center gap-2 text-[11px]">
              <span className={`w-4 text-center ${isSent ? 'text-emerald-400' : isDue ? 'text-amber-400' : 'text-dim'}`}>
                {isSent ? '✓' : isDue ? '●' : '○'}
              </span>
              <span className={`flex-1 ${isSent ? 'text-muted line-through' : isDue ? 'text-amber-300' : 'text-dim'}`}>
                Week {m.week} — {m.label}
                {sentDate && <span className="text-dim ml-1.5">(sent {sentDate})</span>}
                {isDue && !isSent && <span className="text-amber-400 ml-1.5 font-semibold uppercase text-[9px] tracking-wider">Due</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Action row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {dueNow ? (
          <SendMilestoneButton deal={deal} point={dueNow} onSent={() => onSent(deal.id, `week${dueNow.week}`)} />
        ) : (
          <span className="text-[10px] text-dim italic px-2">No milestone due yet.</span>
        )}
        <CopyButton value={deal.Email} label="Copy email" />
        <CopyButton value={deal.Phone} label="Copy phone" />
      </div>
    </div>
  );
}

// Anchor-style button that opens mailto AND marks the milestone as sent.
// We fire the "mark sent" API in the same click handler so the milestone
// updates even if the user cancels their mail client — this matches spec.
function SendMilestoneButton({ deal, point, onSent }: { deal: ZohoDeal; point: MfgSchedulePoint; onSent: () => void }) {
  const first = extractFirstName(dealCustomerName(deal));
  const product = productName(deal);
  const mailto = mailtoHref(deal.Email, point.emailSubject, point.emailBody(first, product));
  return (
    <a
      href={mailto}
      onClick={e => { e.stopPropagation(); onSent(); }}
      className="px-3 py-1.5 rounded-md bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-400/25 transition-colors"
    >
      Send Week {point.week} Update
    </a>
  );
}

// ============================================================================
function ReadyCard({ deal }: { deal: ZohoDeal }) {
  const name = dealCustomerName(deal);
  const first = extractFirstName(name);
  const body = `Hi ${first},

Great news — your ${productName(deal)} is ready to ship! Could you confirm your delivery address so we can get it out to you?

If your address hasn't changed, just reply "same address" and we'll dispatch straight away.

Best wishes,
The Bryant Dental Team`;
  const mailto = mailtoHref(deal.Email, 'Confirming your delivery address', body);
  return (
    <div className="rounded-xl bg-[#111] border border-[#1A1A1A] p-4">
      <p className="text-sm font-semibold text-white truncate">{name || 'Unnamed order'} <span className="text-dim font-normal">— {productName(deal)}</span></p>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        {deal.Phone && <WhatsAppLink phone={deal.Phone} />}
        {deal.Country && <span className="text-[11px] text-dim">{deal.Country}</span>}
      </div>
      {deal.Email && <p className="mt-1 text-[11px] text-dim truncate">{deal.Email}</p>}
      <p className="mt-2 text-[11px] text-emerald-300">Stage: {deal.Stage}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a href={mailto} onClick={e => e.stopPropagation()} className="px-3 py-1.5 rounded-md bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-400/25 transition-colors">
          Confirm Address
        </a>
        <CopyButton value={deal.Email} label="Copy email" />
      </div>
    </div>
  );
}

// ============================================================================
function DispatchedCard({ deal }: { deal: ZohoDeal }) {
  const name = dealCustomerName(deal);
  const first = extractFirstName(name);
  const days = daysSince(deal.Modified_Time);
  const dispatchedOn = deal.Modified_Time ? new Date(deal.Modified_Time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date';
  const body = `Hi ${first},

Just checking your ${productName(deal)} has arrived safely! If you've received them, no need to reply — I'll take that as a yes. If not, let us know and we'll chase the courier.

Best wishes,
The Bryant Dental Team`;
  const mailto = mailtoHref(deal.Email, 'Delivery confirmation for your loupes', body);
  return (
    <div className="rounded-xl bg-[#111] border border-[#1A1A1A] p-4">
      <p className="text-sm font-semibold text-white truncate">{name || 'Unnamed order'} <span className="text-dim font-normal">— {productName(deal)}</span></p>
      <p className="mt-1 text-[11px] text-dim">Dispatched: {dispatchedOn} · {days} day{days === 1 ? '' : 's'} ago</p>
      <p className="mt-0.5 text-[11px] text-dim">Expected arrival: ~3–14 days</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a href={mailto} onClick={e => e.stopPropagation()} className="px-3 py-1.5 rounded-md bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-400/25 transition-colors">
          Confirm Delivery
        </a>
        <CopyButton value={deal.Email} label="Copy email" />
      </div>
    </div>
  );
}
