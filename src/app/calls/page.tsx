'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface CalendarCall {
  contactName: string;
  phone: string | null;
  country: string | null;
  start: string;
  summary: string;
  description?: string;
  attendeeStatus: string;
}

function getMonthOptions() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
    });
  }
  return months;
}

export default function CallsPage() {
  const months = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [calls, setCalls] = useState<CalendarCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const m = months[selectedMonth];
      const res = await fetch(`/api/calendar?timeMin=${m.start}&timeMax=${m.end}&salesOnly=true`);
      const data = await res.json();
      setCalls(data.events || []);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, months]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const filtered = calls.filter(c =>
    !search || c.contactName?.toLowerCase().includes(search.toLowerCase()) ||
    c.summary?.toLowerCase().includes(search.toLowerCase())
  );

  const copyToClipboard = () => {
    const text = filtered.map((c, i) =>
      `${i + 1}. ${c.contactName} | ${c.phone || 'No phone'} | ${new Date(c.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
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

      {/* Count + search + export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-white tabular-nums">{loading ? '--' : filtered.length}</span>
          <span className="text-sm text-muted">calls</span>
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
                <th className="py-3 pr-6 text-xs font-medium uppercase tracking-heading text-dim hidden sm:table-cell">Country</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((call, i) => (
                <>
                  <tr
                    key={i}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    className={`cursor-pointer transition-colors hover:bg-surface-hover ${
                      i % 2 === 0 ? '' : 'bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3 pl-6 pr-2 text-dim tabular-nums">{i + 1}</td>
                    <td className="py-3 text-white font-medium">{call.contactName}</td>
                    <td className="py-3 text-muted tabular-nums text-xs">{call.phone || '--'}</td>
                    <td className="py-3 text-muted">
                      {new Date(call.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', weekday: 'short' })}
                    </td>
                    <td className="py-3 pr-6 text-dim hidden sm:table-cell">{call.country || '--'}</td>
                  </tr>
                  {expandedRow === i && (
                    <tr key={`detail-${i}`}>
                      <td colSpan={5} className="px-6 pb-4">
                        <div className="rounded-xl bg-black/30 p-4 text-xs space-y-2">
                          <p className="text-muted"><span className="text-dim">Event:</span> {call.summary}</p>
                          <p className="text-muted"><span className="text-dim">Status:</span>{' '}
                            <span className={`inline-flex items-center gap-1.5 ${
                              call.attendeeStatus === 'accepted' ? 'text-success' :
                              call.attendeeStatus === 'declined' ? 'text-danger' :
                              'text-warning'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                call.attendeeStatus === 'accepted' ? 'bg-success' :
                                call.attendeeStatus === 'declined' ? 'bg-danger' :
                                'bg-warning'
                              }`} />
                              {call.attendeeStatus || 'unknown'}
                            </span>
                          </p>
                          {call.description && (
                            <p className="text-muted whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                              <span className="text-dim">Notes:</span> {call.description.substring(0, 500)}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
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
    </div>
  );
}
