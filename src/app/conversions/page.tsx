'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface ConversionRecord {
  name: string; email: string; phone: string | null; date: string;
  country: string | null; status: string; stage: string | null;
  value: number | null; dealName: string | null; dealCreated: string | null; daysSince: number;
}

interface ConversionData {
  zohoConnected: boolean; month: string; totalBookings: number;
  ordered: number; demo_done: number; no_show: number; gone_cold: number;
  in_pipeline: number; direct_booking: number; pending: number;
  conversionRate: number; conversionDetail: string; ordersThisMonth: number;
  records: ConversionRecord[];
  sanityCheck: { total: number; sumOfCategories: number; ok: boolean };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ordered: { label: 'Ordered', color: 'text-success', dot: 'bg-success' },
  demo_done: { label: 'Demo Done', color: 'text-[#A78BFA]', dot: 'bg-[#A78BFA]' },
  no_show: { label: 'No Show', color: 'text-danger', dot: 'bg-danger' },
  gone_cold: { label: 'Gone Cold', color: 'text-warning', dot: 'bg-warning' },
  in_pipeline: { label: 'In Pipeline', color: 'text-data-blue', dot: 'bg-data-blue' },
  direct_booking: { label: 'Direct', color: 'text-muted', dot: 'bg-muted' },
  pending: { label: 'Pending', color: 'text-dim', dot: 'bg-dim' },
};

function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() });
  }
  return opts;
}

export default function ConversionsPage() {
  const months = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const m = months[selectedMonth];
    try {
      const res = await fetch(`/api/conversions?year=${m.year}&month=${m.month}`);
      const d = await res.json();
      if (!d.error) setData(d);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [selectedMonth, months]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = (status: string) => data?.records?.filter(r => r.status === status) || [];

  const funnelItems = [
    { key: 'totalBookings', label: 'Total Bookings', val: data?.totalBookings, color: 'text-white' },
    { key: 'ordered', label: 'Ordered', val: data?.ordered, color: 'text-success' },
    { key: 'demo_done', label: 'Demo Done', val: data?.demo_done, color: 'text-[#A78BFA]' },
    { key: 'in_pipeline', label: 'In Pipeline', val: data?.in_pipeline, color: 'text-data-blue' },
    { key: 'no_show', label: 'No Show', val: data?.no_show, color: 'text-danger' },
    { key: 'gone_cold', label: 'Gone Cold', val: data?.gone_cold, color: 'text-warning' },
    { key: 'direct_booking', label: 'Direct (No CRM)', val: data?.direct_booking, color: 'text-muted' },
    { key: 'pending', label: 'Pending', val: data?.pending, color: 'text-dim' },
  ];

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Month selector */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {months.map((m, i) => (
          <button key={i} onClick={() => setSelectedMonth(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              i === selectedMonth ? 'bg-white text-black' : 'text-dim hover:text-muted'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Clickable funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        {funnelItems.map(item => {
          const isOpen = expanded === item.key;
          return (
            <button key={item.key}
              onClick={() => setExpanded(isOpen ? null : item.key)}
              className={`rounded-2xl border ${isOpen ? 'border-[#333]' : 'border-[#1A1A1A]'} bg-surface p-4 text-center hover:bg-surface-hover transition-all text-left`}>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] mb-1">{item.label}</p>
              <p className={`text-2xl font-light tabular-nums ${item.color}`}>{loading ? '--' : item.val ?? 0}</p>
            </button>
          );
        })}
      </div>

      {/* Conversion rate + sanity check */}
      {data && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
            <span className="text-dim">Conversion rate</span>{' '}
            <span className="text-white font-semibold">{data.conversionRate}%</span>
            <span className="text-dim ml-1">({data.conversionDetail})</span>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
            <span className="text-dim">Orders this month</span>{' '}
            <span className="text-white font-semibold">{data.ordersThisMonth}</span>
          </span>
          {!data.sanityCheck.ok && (
            <span className="px-3 py-1.5 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger">
              Sanity check failed: {data.sanityCheck.total} bookings but {data.sanityCheck.sumOfCategories} categorized
            </span>
          )}
        </div>
      )}

      {/* Direct bookings alert */}
      {data && data.direct_booking > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-surface p-4 mb-6">
          <p className="text-xs text-warning font-medium mb-1">{data.direct_booking} leads booked demos but are NOT in Zoho CRM</p>
          <p className="text-[11px] text-dim">These people booked via Calendly/Cal.com without registering. Consider adding them to CRM.</p>
        </div>
      )}

      {/* Expanded drill-down */}
      {expanded && data && (
        <div className="rounded-2xl border border-[#222] bg-surface mb-6 overflow-hidden">
          <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">
              {expanded === 'totalBookings' ? `All Bookings (${data.totalBookings})` :
               `${STATUS_CONFIG[expanded]?.label || expanded} (${filtered(expanded).length})`}
            </h3>
            <button onClick={() => setExpanded(null)} className="text-xs text-dim hover:text-muted">Close</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left border-b border-[#1A1A1A]">
                  <th className="py-2 pl-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">#</th>
                  <th className="py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Name</th>
                  <th className="py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Phone</th>
                  <th className="py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Date</th>
                  <th className="py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Status</th>
                  <th className="py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] hidden md:table-cell">Stage</th>
                  <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] hidden sm:table-cell">Value</th>
                </tr>
              </thead>
              <tbody>
                {(expanded === 'totalBookings' ? data.records : filtered(expanded)).map((r, i) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                  return (
                    <tr key={i} className="border-b border-[#1A1A1A]/40 last:border-0 hover:bg-white/[0.02]">
                      <td className="py-2 pl-4 text-dim tabular-nums">{i + 1}</td>
                      <td className="py-2">
                        <p className="text-white">{r.name}</p>
                        <p className="text-[10px] text-dim">{r.email}</p>
                      </td>
                      <td className="py-2 text-muted font-mono tabular-nums">{r.phone || '--'}</td>
                      <td className="py-2 text-muted">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        <span className="text-dim ml-1">{r.daysSince}d</span>
                      </td>
                      <td className="py-2">
                        <span className={`inline-flex items-center gap-1 ${cfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-2 text-dim hidden md:table-cell">{r.stage || '--'}</td>
                      <td className="py-2 pr-4 text-muted tabular-nums hidden sm:table-cell">
                        {r.value ? `£${Math.round(r.value).toLocaleString()}` : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary table — all bookings with status */}
      {!expanded && (
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface">
          {loading ? (
            <div className="p-6 space-y-0">{[...Array(8)].map((_, i) => <div key={i} className="h-11 skeleton" style={{ animationDelay: `${i * 40}ms` }} />)}</div>
          ) : !data || data.records.length === 0 ? (
            <div className="p-12 text-center text-dim text-sm">No bookings for this month</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[#1A1A1A]">
                  <th className="py-3 pl-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Name</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Date</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">CRM Status</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden md:table-cell">Stage</th>
                  <th className="py-3 pr-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden sm:table-cell">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                  return (
                    <tr key={i} className="fade-in-row border-b border-[#1A1A1A]/50 last:border-0 hover:bg-white/[0.02]" style={{ animationDelay: `${i * 20}ms` }}>
                      <td className="py-3 pl-6">
                        <p className="text-white font-medium">{r.name}</p>
                        <p className="text-[11px] text-dim">{r.email}</p>
                      </td>
                      <td className="py-3 text-xs text-muted">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.03] ${cfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-dim hidden md:table-cell">{r.stage || '--'}</td>
                      <td className="py-3 pr-6 text-xs text-muted tabular-nums hidden sm:table-cell">
                        {r.value ? `£${Math.round(r.value).toLocaleString()}` : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Equation */}
      {data && (
        <p className="text-[10px] text-dim mt-4 text-center tabular-nums">
          {data.totalBookings} = {data.ordered} ordered + {data.demo_done} demo done + {data.no_show} no show + {data.gone_cold} cold + {data.in_pipeline} pipeline + {data.direct_booking} direct + {data.pending} pending
          {data.sanityCheck.ok ? ' ✓' : ' ✗'}
        </p>
      )}

      <footer className="border-t border-[#1A1A1A] mt-8 pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
