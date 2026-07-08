'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ZohoDeal } from '@/lib/zoho-client';
import WhatsAppLink from '@/components/ops/WhatsAppLink';
import CopyButton from '@/components/ops/CopyButton';
import { daysSince, dealCustomerName, extractFirstName, mailtoHref } from '@/lib/ops-utils';

const AWAITING = 'Awaiting Measurements';
const FINAL_CHECKS_STAGES = ['Measurements Final Checks', 'Measurement Final Checks'];
const OPS_STAGES = [AWAITING, ...FINAL_CHECKS_STAGES];

type SortKey = 'days' | 'name' | 'country' | 'date';

interface State {
  deals: ZohoDeal[];
  lastSync: Date | null;
  loading: boolean;
  error: string | null;
}

function reminderMailto(deal: ZohoDeal): string {
  const first = extractFirstName(dealCustomerName(deal));
  const body = `Hi ${first},

Just a quick reminder to complete your measurements via the Bryant Dental AI app. It takes about 10 minutes, and your custom loupes can't start production until it's done.

Need help? Just reply and we'll walk you through it.

Best wishes,
The Bryant Dental Team`;
  return mailtoHref(deal.Email, 'Your Bryant Dental measurements', body);
}

function finalChecksMailto(deal: ZohoDeal): string {
  const first = extractFirstName(dealCustomerName(deal));
  const body = `Hi ${first},

Your measurements are in and going through final checks now. If we spot anything that needs a small tweak we'll be in touch — otherwise we'll move you straight into production.

Best wishes,
The Bryant Dental Team`;
  return mailtoHref(deal.Email, 'Your measurements are in final checks', body);
}

// Days-waiting bucket for the progress bar. Uses Modified_Time as a proxy for
// "how long they've been in this stage" — Zoho updates that whenever the deal
// stage changes, so it's a reliable stage-age signal.
function measurementProgress(deal: ZohoDeal): { pct: number; color: string; label: string; overdue: boolean } {
  const d = daysSince(deal.Modified_Time);
  const pct = Math.min(100, (d / 14) * 100);
  if (d > 14)      return { pct: 100, color: 'bg-red-500',    label: `OVERDUE — ${d} days waiting`, overdue: true };
  if (d >= 11)     return { pct,      color: 'bg-red-400',    label: `Day ${d} of 14 — overdue`, overdue: true };
  if (d >= 8)      return { pct,      color: 'bg-amber-400',  label: `Day ${d} of 14 — needs a nudge`, overdue: false };
  return              { pct,      color: 'bg-emerald-400', label: `Day ${d} of 14 — on track`, overdue: false };
}

export default function MeasurementsPage() {
  const [state, setState] = useState<State>({ deals: [], lastSync: null, loading: true, error: null });
  const [sortKey, setSortKey] = useState<SortKey>('days');

  const load = useCallback(async () => {
    setState(s => ({ ...s, error: null }));
    try {
      const url = `/api/ops/deals?stages=${encodeURIComponent(OPS_STAGES.join(','))}`;
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Server ${res.status}`);
      setState({ deals: j.deals || [], lastSync: new Date(), loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Failed' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const awaiting = state.deals.filter(d => d.Stage === AWAITING);
  const finalChecks = state.deals.filter(d => FINAL_CHECKS_STAGES.includes(d.Stage));

  const sort = <T extends ZohoDeal>(list: T[]): T[] => {
    const copy = [...list];
    switch (sortKey) {
      case 'name':    copy.sort((a, b) => dealCustomerName(a).localeCompare(dealCustomerName(b))); break;
      case 'country': copy.sort((a, b) => (a.Country || '').localeCompare(b.Country || '')); break;
      case 'date':    copy.sort((a, b) => (a.Modified_Time || '').localeCompare(b.Modified_Time || '')); break;
      case 'days':
      default:        copy.sort((a, b) => daysSince(b.Modified_Time) - daysSince(a.Modified_Time)); break;
    }
    return copy;
  };

  const awaitingOnTrack = awaiting.filter(d => daysSince(d.Modified_Time) <= 7).length;
  const awaitingNudge   = awaiting.filter(d => { const dd = daysSince(d.Modified_Time); return dd > 7 && dd <= 14; }).length;
  const awaitingOverdue = awaiting.filter(d => daysSince(d.Modified_Time) > 14).length;
  const finalOverdue    = finalChecks.filter(d => daysSince(d.Modified_Time) > 14).length;

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Measurements</h1>
          <p className="text-xs text-dim mt-1">
            {state.lastSync ? `Last synced ${state.lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-dim">Sort:</span>
          {(['days', 'name', 'country', 'date'] as SortKey[]).map(k => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                sortKey === k ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/40' : 'text-muted border-[#333] hover:text-white'
              }`}
            >{k}</button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border border-[#1A1A1A] bg-surface p-3 mb-6 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span>Awaiting: <span className="text-white font-semibold tabular-nums">{awaiting.length}</span></span>
        <span className="text-[#333]">·</span>
        <span className="text-emerald-400">On track: <span className="tabular-nums">{awaitingOnTrack}</span></span>
        <span className="text-amber-400">Needs nudge: <span className="tabular-nums">{awaitingNudge}</span></span>
        <span className="text-red-400">Overdue: <span className="tabular-nums">{awaitingOverdue}</span></span>
        <span className="text-[#333]">·</span>
        <span>Final Checks: <span className="text-white font-semibold tabular-nums">{finalChecks.length}</span></span>
        {finalOverdue > 0 && <span className="text-red-400">({finalOverdue} flagged)</span>}
      </div>

      {state.error && (
        <div className="mb-4 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>Sync failed: {state.error}</span>
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Column title="Awaiting Measurements" count={awaiting.length}>
          {state.loading ? (
            <SkeletonList />
          ) : awaiting.length === 0 ? (
            <Empty message="Nothing waiting." />
          ) : sort(awaiting).map(d => (
            <MeasurementCard key={d.id} deal={d} action="reminder" />
          ))}
        </Column>

        <Column title="Measurement Final Checks" count={finalChecks.length}>
          {state.loading ? (
            <SkeletonList />
          ) : finalChecks.length === 0 ? (
            <Empty message="Nothing in final checks." />
          ) : sort(finalChecks).map(d => (
            <MeasurementCard key={d.id} deal={d} action="finalChecks" />
          ))}
        </Column>
      </div>
    </div>
  );
}

// ============================================================================
function Column({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1A1A1A]">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">{title}</h2>
        <span className="text-[11px] text-dim tabular-nums">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-[#1A1A1A]/60 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-xs text-dim italic text-center py-8">{message}</p>;
}

function MeasurementCard({ deal, action }: { deal: ZohoDeal; action: 'reminder' | 'finalChecks' }) {
  const name = dealCustomerName(deal);
  const progress = measurementProgress(deal);
  const mailto = action === 'reminder' ? reminderMailto(deal) : finalChecksMailto(deal);
  const actionLabel = action === 'reminder' ? 'Send Reminder' : 'Send Update';

  return (
    <div className={`rounded-xl bg-[#111] border p-4 transition-colors ${progress.overdue ? 'border-red-400/30' : 'border-[#1A1A1A]'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name || 'Unnamed order'}</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {deal.Phone && <WhatsAppLink phone={deal.Phone} />}
            {deal.Country && <span className="text-[11px] text-dim">{deal.Country}</span>}
          </div>
          {deal.Email && <p className="mt-1 text-[11px] text-dim truncate">{deal.Email}</p>}
        </div>
        {progress.overdue && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Overdue</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
          <div className={`h-full ${progress.color} transition-all`} style={{ width: `${progress.pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-dim">{progress.label}</p>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a
          href={mailto}
          onClick={e => e.stopPropagation()}
          className="px-3 py-1.5 rounded-md bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-400/25 transition-colors"
        >{actionLabel}</a>
        <CopyButton value={deal.Email} label="Copy email" />
        <CopyButton value={deal.Phone} label="Copy phone" />
      </div>
    </div>
  );
}
