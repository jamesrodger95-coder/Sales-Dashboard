'use client';

import { useState, useEffect, useCallback } from 'react';

interface Debrief {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  callDate: string;
  frame: string | null;
  magnification: string | null;
  px: boolean;
  headlight: string | null;
  outcome: string | null;
  notes: string;
  followUpDate: string | null;
  followUpDone: boolean;
  createdAt: string;
}

interface Buckets {
  overdue: Debrief[];
  today: Debrief[];
  thisWeek: Debrief[];
  nextWeek: Debrief[];
  later: Debrief[];
}

interface Props {
  refreshSignal?: number;
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function daysOverdue(dateStr: string | null): number {
  if (!dateStr) return 0;
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dateStr);
  return Math.max(0, Math.floor((t.getTime() - due.getTime()) / 86400000));
}

function formatConfig(d: Debrief): string {
  const parts: string[] = [];
  if (d.frame) parts.push(d.frame);
  if (d.magnification) parts.push(d.magnification);
  if (d.px) parts.push('PX');
  if (d.headlight && d.headlight !== 'None') parts.push(d.headlight);
  if (d.outcome) parts.push(d.outcome);
  return parts.join(' · ') || '—';
}

export default function FollowUpList({ refreshSignal = 0 }: Props) {
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  const [loading, setLoading] = useState(true);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [reschedule, setReschedule] = useState<{ id: string; date: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/debriefs/follow-ups').then(r => r.json());
      setBuckets(data.buckets);
    } catch {
      setBuckets(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshSignal]);

  const markDone = async (id: string) => {
    setDoneIds(prev => new Set(prev).add(id));
    await fetch(`/api/debriefs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followUpDone: true }),
    });
    setTimeout(() => load(), 500);
  };

  const saveReschedule = async () => {
    if (!reschedule) return;
    await fetch(`/api/debriefs/${reschedule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followUpDate: reschedule.date, followUpType: 'Custom' }),
    });
    setReschedule(null);
    await load();
  };

  const Row = ({ d, severity }: { d: Debrief; severity: 'overdue' | 'today' | 'week' | 'next' }) => {
    const isDone = doneIds.has(d.id);
    const dotColor =
      severity === 'overdue' ? 'bg-red-500' :
      severity === 'today' ? 'bg-red-400' :
      severity === 'week' ? 'bg-amber-400' :
      'bg-gray-500';
    const overdueDays = severity === 'overdue' ? daysOverdue(d.followUpDate) : 0;

    return (
      <div className={`group rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] p-3 transition-all ${isDone ? 'opacity-30 line-through' : 'hover:border-[#222]'}`}>
        <div className="flex items-start gap-3">
          <span className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">{d.name}</span>
              {d.country && <span className="text-[11px] text-dim">{d.country}</span>}
              {overdueDays > 0 && (
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                  {overdueDays} {overdueDays === 1 ? 'day' : 'days'} overdue
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-0.5">{formatConfig(d)}</p>
            {d.notes && (
              <p className="text-[11px] text-dim mt-1 italic">
                &ldquo;{d.notes}&rdquo; · logged {daysAgo(d.createdAt)}
              </p>
            )}
            {!d.notes && (
              <p className="text-[11px] text-dim mt-1">Logged {daysAgo(d.createdAt)}</p>
            )}
            {reschedule?.id === d.id ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={reschedule.date}
                  onChange={e => setReschedule({ id: d.id, date: e.target.value })}
                  className="bg-[#111] border border-[#222] rounded-lg px-2 py-1 text-xs text-white outline-none"
                />
                <button onClick={saveReschedule} className="text-[11px] px-2 py-1 rounded-lg bg-white text-black font-medium">Save</button>
                <button onClick={() => setReschedule(null)} className="text-[11px] px-2 py-1 rounded-lg text-dim hover:text-white">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => markDone(d.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={() => setReschedule({ id: d.id, date: d.followUpDate || '' })}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-[#222] text-muted hover:text-white hover:border-[#333] transition-colors"
                >
                  Reschedule
                </button>
                {d.phone && (
                  <a
                    href={`tel:${d.phone.replace(/\s/g, '')}`}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 transition-colors"
                  >
                    Call
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, items, severity, accent }: { title: string; items: Debrief[]; severity: 'overdue' | 'today' | 'week' | 'next'; accent: string }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h3 className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-2 ${accent}`}>{title} ({items.length})</h3>
        <div className="space-y-2">
          {items.map(d => <Row key={d.id} d={d} severity={severity} />)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-4">
        <div className="h-4 w-24 bg-[#1A1A1A] rounded mb-3 animate-pulse" />
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-[#1A1A1A]/40 rounded-xl animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />)}
        </div>
      </div>
    );
  }

  const total = (buckets?.overdue.length ?? 0) + (buckets?.today.length ?? 0) + (buckets?.thisWeek.length ?? 0) + (buckets?.nextWeek.length ?? 0);
  const urgentCount = (buckets?.overdue.length ?? 0) + (buckets?.today.length ?? 0);
  const isUrgent = urgentCount > 0;

  return (
    <div className={`rounded-2xl border bg-surface p-4 transition-all ${isUrgent ? 'border-red-500/40 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]' : 'border-[#1A1A1A]'}`}>
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#1A1A1A]">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Follow-ups</h2>
          {isUrgent && (
            <span className="text-[10px] font-semibold text-red-400">
              {buckets!.today.length > 0 && `${buckets!.today.length} due today`}
              {buckets!.today.length > 0 && buckets!.overdue.length > 0 && ', '}
              {buckets!.overdue.length > 0 && `${buckets!.overdue.length} overdue`}
            </span>
          )}
        </div>
        <span className="text-[10px] text-dim tabular-nums">{total} total</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-dim py-6 text-center">No follow-ups. Log a call above to get started.</p>
      ) : (
        <div className="space-y-4">
          <Section title="Overdue" items={buckets!.overdue} severity="overdue" accent="text-red-400" />
          <Section title="Today" items={buckets!.today} severity="today" accent="text-red-300" />
          <Section title="This Week" items={buckets!.thisWeek} severity="week" accent="text-amber-400" />
          <Section title="Next Week" items={buckets!.nextWeek} severity="next" accent="text-gray-400" />
        </div>
      )}
    </div>
  );
}
