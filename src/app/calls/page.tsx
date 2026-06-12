'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DebriefForm from '@/components/DebriefForm';
import AddToBoardButton from '@/components/AddToBoardButton';
import Toast from '@/components/Toast';

type Status = 'ordered' | 'demo_done' | 'no_show' | 'gone_cold' | 'in_pipeline' | 'direct_booking' | 'pending';

interface CallRecord {
  name: string;
  email: string;
  phone: string | null;
  date: string;
  country: string | null;
  status: Status;
  stage: string | null;
  value: number | null;
  dealName: string | null;
  platform: string | null;
  leadSource: string | null;
}

const STATUS_PILLS: Record<Status, { label: string; color: string; bg: string }> = {
  ordered:        { label: 'Ordered',     color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  demo_done:      { label: 'Demo Done',   color: 'text-purple-400',  bg: 'bg-purple-400/10 border-purple-400/20' },
  no_show:        { label: 'No Show',     color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20' },
  gone_cold:      { label: 'No Contact',  color: 'text-orange-400',  bg: 'bg-orange-400/10 border-orange-400/20' },
  in_pipeline:    { label: 'In Pipeline', color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
  direct_booking: { label: 'Direct',      color: 'text-gray-400',    bg: 'bg-gray-400/10 border-gray-400/20' },
  pending:        { label: 'Pending',     color: 'text-gray-500',    bg: 'bg-gray-500/10 border-gray-500/20' },
};

function getMonthOptions() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return months;
}

export default function CallsPage() {
  const months = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [debriefsByEmail, setDebriefsByEmail] = useState<Record<string, { id: string; frame: string | null; magnification: string | string[] | null; px: boolean; headlight: string | null; outcome: string | null; notes: string }>>({});
  const [boardEmails, setBoardEmails] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    const myId = ++requestIdRef.current;
    try {
      const m = months[selectedMonth];
      // Run independently — debriefs may not exist on first load and we don't want
      // a debriefs failure to wipe the calls list (the original "zero" bug).
      const [convResSettled, debResSettled, boardResSettled] = await Promise.allSettled([
        fetch(`/api/conversions?year=${m.year}&month=${m.month}`).then(r => r.json()),
        fetch('/api/debriefs').then(r => r.json()),
        fetch('/api/board').then(r => r.json()),
      ]);
      // Cancellation guard: discard if a newer fetch is in flight
      if (myId !== requestIdRef.current) return;

      if (convResSettled.status === 'fulfilled' && Array.isArray(convResSettled.value?.records)) {
        setCalls(convResSettled.value.records);
      } else {
        setCalls([]);
        setError('Could not load calls — calendar/CRM connection may be down.');
      }

      const map: typeof debriefsByEmail = {};
      if (debResSettled.status === 'fulfilled') {
        (debResSettled.value.debriefs || []).forEach((d: { email?: string | null; id: string; frame: string | null; magnification: string | string[] | null; px: boolean; headlight: string | null; outcome: string | null; notes: string }) => {
          if (d.email) map[d.email.toLowerCase()] = { id: d.id, frame: d.frame, magnification: d.magnification, px: d.px, headlight: d.headlight, outcome: d.outcome, notes: d.notes };
        });
      }
      setDebriefsByEmail(map);

      if (boardResSettled.status === 'fulfilled') {
        const cards = boardResSettled.value?.cards || [];
        const emails = new Set<string>();
        for (const c of cards) if (c.email) emails.add(String(c.email).toLowerCase());
        setBoardEmails(emails);
      }
    } catch {
      if (myId === requestIdRef.current) {
        setCalls([]);
        setError('Could not load calls.');
      }
    } finally {
      if (myId === requestIdRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, months]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const filtered = calls.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const copyToClipboard = () => {
    const text = filtered.map((c, i) =>
      `${i + 1}. ${c.name} | ${c.phone || 'No phone'} | ${new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} | ${c.stage || c.status}`
    ).join('\n');
    const header = `${months[selectedMonth].label} — ${filtered.length} calls\n${'—'.repeat(40)}\n`;
    navigator.clipboard.writeText(header + text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Month tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {months.map((m, i) => (
          <button
            key={i}
            onClick={() => setSelectedMonth(i)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              i === selectedMonth
                ? 'bg-white text-black'
                : 'text-muted hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && !loading && (
        <div className="mb-4 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadCalls} className="text-red-300 hover:text-white underline">Retry</button>
        </div>
      )}

      {/* Count + search + export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-white tabular-nums">{loading ? '--' : filtered.length}</span>
          <span className="text-sm text-muted">calls</span>
          {!loading && (() => {
            const uniqueEmails = new Set(filtered.map(c => c.email?.toLowerCase()).filter(Boolean));
            return uniqueEmails.size < filtered.length ? (
              <span className="text-xs text-dim">({uniqueEmails.size} unique leads)</span>
            ) : null;
          })()}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-surface border border-subtle rounded-xl px-4 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-subtle-hover w-48 transition-colors"
          />
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-subtle text-muted hover:text-white hover:border-subtle-hover transition-all"
          >
            {copied ? 'Copied' : 'Copy list'}
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      {!loading && calls.length > 0 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              statusFilter === 'all' ? 'bg-white text-black border-white' : 'text-muted border-subtle hover:text-white hover:border-subtle-hover'
            }`}
          >
            All ({calls.length})
          </button>
          {(Object.keys(STATUS_PILLS) as Status[]).map(s => {
            const count = calls.filter(c => c.status === s).length;
            if (count === 0) return null;
            const pill = STATUS_PILLS[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  statusFilter === s ? `${pill.bg} ${pill.color} border-current` : 'text-muted border-subtle hover:text-white hover:border-subtle-hover'
                }`}
              >
                {pill.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-card border border-subtle bg-surface">
        {loading ? (
          <div className="p-6 space-y-0">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-subtle/40 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-dim text-sm">
            {search ? 'No matching calls found' : 'No calls for this month'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-subtle">
                <th className="py-3 pl-6 pr-2 text-xs font-medium uppercase tracking-heading text-dim w-10">#</th>
                <th className="py-3 text-xs font-medium uppercase tracking-heading text-dim">Name</th>
                <th className="py-3 text-xs font-medium uppercase tracking-heading text-dim">Phone</th>
                <th className="py-3 text-xs font-medium uppercase tracking-heading text-dim">Date</th>
                <th className="py-3 text-xs font-medium uppercase tracking-heading text-dim hidden sm:table-cell">Country</th>
                <th className="py-3 text-xs font-medium uppercase tracking-heading text-dim hidden md:table-cell">CRM Status</th>
                <th className="py-3 pr-6 text-xs font-medium uppercase tracking-heading text-dim hidden md:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((call, i) => {
                const pill = STATUS_PILLS[call.status];
                const pillLabel = call.stage || pill.label;
                const debrief = call.email ? debriefsByEmail[call.email.toLowerCase()] : null;
                return (
                <>
                  <tr
                    key={i}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    className={`cursor-pointer transition-colors hover:bg-surface-hover ${
                      i % 2 === 0 ? '' : 'bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3 pl-6 pr-2 text-dim tabular-nums">{i + 1}</td>
                    <td className="py-3 text-white font-medium">{call.name}</td>
                    <td className="py-3 font-mono tabular-nums text-xs">{call.phone ? <a href={`tel:${call.phone.replace(/\s/g, '')}`} className="text-muted hover:text-white transition-colors">{call.phone}</a> : <span className="text-dim">—</span>}</td>
                    <td className="py-3 text-muted">
                      {new Date(call.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', weekday: 'short' })}
                    </td>
                    <td className="py-3 text-dim hidden sm:table-cell">{call.country || '--'}</td>
                    <td className="py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${pill.bg} ${pill.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full bg-current`} />
                          {pillLabel}
                        </span>
                        <AddToBoardButton
                          call={{ name: call.name, email: call.email, phone: call.phone, country: call.country }}
                          isOnBoard={!!call.email && boardEmails.has(call.email.toLowerCase())}
                          onAdded={c => {
                            if (c.email) setBoardEmails(prev => new Set(prev).add(c.email!.toLowerCase()));
                            setToast(`Added ${c.name} to Closing Board`);
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-3 pr-6 hidden md:table-cell">
                      {debrief ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-400/10 text-emerald-400 border-emerald-400/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          Notes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-gray-500/10 text-gray-500 border-gray-500/20">
                          No notes
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedRow === i && (
                    <tr key={`detail-${i}`}>
                      <td colSpan={7} className="px-6 pb-4">
                        <div className="rounded-xl bg-black/30 p-4 text-xs space-y-3">
                          <div className="flex flex-wrap gap-x-6 gap-y-1">
                            <p className="text-muted"><span className="text-dim">Email:</span> {call.email || '—'}</p>
                            <p className="text-muted"><span className="text-dim">Platform:</span> {call.platform || '—'}</p>
                            <p className="text-muted"><span className="text-dim">Source:</span> {call.leadSource || '—'}</p>
                            {call.value && <p className="text-muted"><span className="text-dim">Value:</span> ${call.value.toLocaleString()}</p>}
                            {call.dealName && <p className="text-muted"><span className="text-dim">Deal:</span> {call.dealName}</p>}
                          </div>
                          <div className="md:hidden">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${pill.bg} ${pill.color}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {pillLabel}
                            </span>
                          </div>
                          {debrief ? (
                            <div className="pt-2 border-t border-[#1A1A1A]">
                              <p className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1">Call notes logged</p>
                              <p className="text-muted">
                                {[debrief.frame, Array.isArray(debrief.magnification) ? (debrief.magnification.length ? debrief.magnification.join(' / ') : null) : debrief.magnification, debrief.px ? 'PX' : null, debrief.headlight, debrief.outcome].filter(Boolean).join(' · ') || '—'}
                              </p>
                              {debrief.notes && <p className="text-dim italic mt-1">&ldquo;{debrief.notes}&rdquo;</p>}
                            </div>
                          ) : (
                            <div className="pt-2 border-t border-[#1A1A1A]">
                              <p className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2">Log debrief</p>
                              <DebriefForm
                                defaultName={call.name}
                                defaultEmail={call.email}
                                defaultPhone={call.phone}
                                defaultCountry={call.country}
                                callDate={call.date}
                                lockName={true}
                                compact={true}
                                onSaved={() => loadCalls()}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom total */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-xs text-dim">
          <span>Total: {filtered.length} calls</span>
          <span>{months[selectedMonth].label}</span>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
