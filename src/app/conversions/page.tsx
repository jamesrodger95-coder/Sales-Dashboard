'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface Record { name: string; email: string; phone: string | null; date: string; country: string | null; status: string; stage: string | null; value: number | null; dealName: string | null }

interface Data {
  zohoConnected: boolean; month: string; totalCalls: number;
  ordered: number; demo_done: number; no_show: number; gone_cold: number;
  in_pipeline: number; direct_booking: number; pending: number;
  showedUp: number; convRate: number; convRateDetail: string; showRate: number; noShowRate: number;
  records: Record[];
  byCountry: { [k: string]: { calls: number; ordered: number } };
  sanity: { total: number; sum: number; ok: boolean };
}

const S: { [k: string]: { label: string; color: string; dot: string } } = {
  ordered: { label: 'Ordered', color: 'text-success', dot: 'bg-success' },
  demo_done: { label: 'Demo Done', color: 'text-[#A78BFA]', dot: 'bg-[#A78BFA]' },
  no_show: { label: 'No Show', color: 'text-danger', dot: 'bg-danger' },
  gone_cold: { label: 'Gone Cold', color: 'text-warning', dot: 'bg-warning' },
  in_pipeline: { label: 'In Pipeline', color: 'text-data-blue', dot: 'bg-data-blue' },
  direct_booking: { label: 'Direct', color: 'text-muted', dot: 'bg-muted' },
  pending: { label: 'Pending', color: 'text-dim', dot: 'bg-dim' },
};

function months() {
  const o = [];
  const n = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
    o.push({ label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() });
  }
  return o;
}

export default function ConversionsPage() {
  const mo = useMemo(() => months(), []);
  const [sel, setSel] = useState(0);
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const m = mo[sel];
    try {
      const r = await fetch(`/api/conversions?year=${m.year}&month=${m.month}`);
      const j = await r.json();
      if (!j.error) setD(j);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [sel, mo]);

  useEffect(() => { load(); }, [load]);

  const byStatus = (s: string) => d?.records?.filter(r => r.status === s) || [];
  const shown = filter === 'all' ? (d?.records || []) : byStatus(filter);

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Month tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {mo.map((m, i) => (
          <button key={i} onClick={() => { setSel(i); setExpanded(null); setFilter('all'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${i === sel ? 'bg-white text-black' : 'text-dim hover:text-muted'}`}>{m.label}</button>
        ))}
      </div>

      {/* KPI cards — clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          { key: 'totalCalls', label: 'Total Calls', val: d?.totalCalls, color: 'text-white' },
          { key: 'showedUp', label: 'Showed Up', val: d?.showedUp, color: 'text-white' },
          { key: 'ordered', label: 'Ordered', val: d?.ordered, color: 'text-success' },
          { key: 'no_show', label: 'No Show', val: d?.no_show, color: 'text-danger' },
          { key: 'direct_booking', label: 'Direct (No CRM)', val: d?.direct_booking, color: 'text-muted' },
          { key: 'convRate', label: 'Conv. Rate', val: d ? `${d.convRate}%` : '--', color: 'text-white' },
        ].map(k => (
          <button key={k.key} onClick={() => {
            if (k.key === 'totalCalls') { setFilter('all'); setExpanded(null); }
            else if (k.key === 'showedUp') { setExpanded('showedUp'); }
            else if (k.key === 'convRate') { setExpanded(null); }
            else { setExpanded(k.key); }
          }}
            className="rounded-2xl border border-[#1A1A1A] bg-surface p-4 text-left hover:bg-surface-hover transition-all">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] mb-1">{k.label}</p>
            <p className={`text-2xl font-light tabular-nums ${k.color}`}>{loading ? '--' : k.val ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Rates row */}
      {d && (
        <div className="flex flex-wrap gap-3 mb-6">
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
            <span className="text-dim">Conv. rate</span> <span className="text-white font-semibold">{d.convRate}%</span>
            <span className="text-dim ml-1">({d.convRateDetail})</span>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
            <span className="text-dim">Show rate</span> <span className="text-white font-semibold">{d.showRate}%</span>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
            <span className="text-dim">No-show rate</span> <span className="text-danger font-semibold">{d.noShowRate}%</span>
          </span>
        </div>
      )}

      {/* Funnel visual */}
      {d && !loading && (
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6 mb-6">
          <div className="space-y-3">
            {[
              { label: 'Booked', val: d.totalCalls, pct: 100, color: 'bg-white/20' },
              { label: 'Showed Up', val: d.showedUp, pct: d.totalCalls > 0 ? Math.round((d.showedUp / d.totalCalls) * 100) : 0, color: 'bg-data-blue/60' },
              { label: 'Ordered', val: d.ordered, pct: d.showedUp > 0 ? Math.round((d.ordered / d.showedUp) * 100) : 0, color: 'bg-success/60' },
            ].map((f, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted">{f.label}</span>
                  <span className="text-xs text-white tabular-nums">{f.val} <span className="text-dim">({f.pct}%)</span></span>
                </div>
                <div className="h-6 bg-[#0A0A0A] rounded-lg overflow-hidden">
                  <div className={`h-full rounded-lg ${f.color} transition-all duration-700`}
                    style={{ width: `${Math.max(f.pct, 2)}%` }} />
                </div>
              </div>
            ))}
            <div className="flex gap-4 pt-2 text-xs">
              <span className="text-danger">No Show: {d.no_show} ({d.noShowRate}%)</span>
              <span className="text-muted">Direct: {d.direct_booking}</span>
              <span className="text-warning">Cold: {d.gone_cold}</span>
              <span className="text-data-blue">Pipeline: {d.in_pipeline}</span>
            </div>
          </div>
        </div>
      )}

      {/* Direct bookings alert */}
      {d && d.direct_booking > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-surface p-4 mb-6">
          <p className="text-xs text-warning font-medium">{d.direct_booking} leads booked but are NOT in Zoho CRM</p>
          <p className="text-[11px] text-dim mt-1">Booked via Calendly/Cal.com without registering. Consider adding them.</p>
        </div>
      )}

      {/* Expanded drill-down */}
      {expanded && d && (
        <div className="rounded-2xl border border-[#222] bg-surface mb-6 overflow-hidden">
          <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">
              {expanded === 'showedUp' ? `Showed Up (${d.showedUp})` :
               expanded === 'totalCalls' ? `All Calls (${d.totalCalls})` :
               `${S[expanded]?.label || expanded} (${byStatus(expanded).length})`}
            </h3>
            <button onClick={() => setExpanded(null)} className="text-xs text-dim hover:text-muted">Close</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface"><tr className="border-b border-[#1A1A1A]">
                <th className="py-2 pl-4 text-[10px] text-[#555] text-left">#</th>
                <th className="py-2 text-[10px] text-[#555] text-left">Name</th>
                <th className="py-2 text-[10px] text-[#555] text-left">Phone</th>
                <th className="py-2 text-[10px] text-[#555] text-left">Date</th>
                <th className="py-2 text-[10px] text-[#555] text-left">Status</th>
                <th className="py-2 pr-4 text-[10px] text-[#555] text-left hidden sm:table-cell">Stage/Value</th>
              </tr></thead>
              <tbody>
                {(expanded === 'showedUp' ? [...byStatus('ordered'), ...byStatus('demo_done')] :
                  expanded === 'totalCalls' ? d.records : byStatus(expanded)
                ).map((r, i) => {
                  const cfg = S[r.status] || S.pending;
                  return (
                    <tr key={i} className="border-b border-[#1A1A1A]/40 hover:bg-white/[0.02]">
                      <td className="py-2 pl-4 text-dim">{i + 1}</td>
                      <td className="py-2"><p className="text-white">{r.name}</p><p className="text-[10px] text-dim">{r.email}</p></td>
                      <td className="py-2 text-muted font-mono">{r.phone || '--'}</td>
                      <td className="py-2 text-muted">{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      <td className="py-2"><span className={`inline-flex items-center gap-1 ${cfg.color}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span></td>
                      <td className="py-2 pr-4 text-dim hidden sm:table-cell">{r.value ? `$${Math.round(r.value).toLocaleString()}` : r.stage || '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter tabs + main table */}
      {!expanded && (
        <>
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {['all', 'ordered', 'demo_done', 'no_show', 'gone_cold', 'in_pipeline', 'direct_booking'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === f ? 'bg-white text-black' : 'text-dim hover:text-muted'}`}>
                {f === 'all' ? 'All' : S[f]?.label || f}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[#1A1A1A] bg-surface mb-6">
            {loading ? (
              <div className="p-6 space-y-0">{[...Array(8)].map((_, i) => <div key={i} className="h-11 skeleton" style={{ animationDelay: `${i * 40}ms` }} />)}</div>
            ) : shown.length === 0 ? (
              <div className="p-12 text-center text-dim text-sm">No records</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b border-[#1A1A1A]">
                  <th className="py-3 pl-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">#</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Name</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Date</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">CRM Status</th>
                  <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden md:table-cell">Stage</th>
                  <th className="py-3 pr-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden sm:table-cell">Value</th>
                </tr></thead>
                <tbody>
                  {shown.map((r, i) => {
                    const cfg = S[r.status] || S.pending;
                    return (
                      <tr key={i} className="fade-in-row border-b border-[#1A1A1A]/50 last:border-0 hover:bg-white/[0.02]" style={{ animationDelay: `${i * 20}ms` }}>
                        <td className="py-3 pl-6 text-dim tabular-nums">{i + 1}</td>
                        <td className="py-3"><p className="text-white font-medium">{r.name}</p><p className="text-[11px] text-dim">{r.email}</p></td>
                        <td className="py-3 text-xs text-muted">{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.03] ${cfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-dim hidden md:table-cell">{r.stage || '--'}</td>
                        <td className="py-3 pr-6 text-xs text-muted tabular-nums hidden sm:table-cell">{r.value ? `$${Math.round(r.value).toLocaleString()}` : '--'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Country breakdown */}
      {d && d.byCountry && Object.keys(d.byCountry).length > 0 && (
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5 mb-6">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-3 pb-2 border-b border-[#1A1A1A]">By Country — {d.month}</h3>
          <div className="space-y-1.5">
            {Object.entries(d.byCountry).sort(([, a], [, b]) => b.ordered - a.ordered || b.calls - a.calls).slice(0, 12).map(([co, v]) => (
              <div key={co} className="flex items-center gap-3 text-xs py-1">
                <span className="text-white w-32 truncate">{co}</span>
                <span className="text-muted tabular-nums w-12">{v.calls} calls</span>
                <span className="text-success tabular-nums w-16">{v.ordered} orders</span>
                <span className="text-dim tabular-nums">{v.calls > 0 ? Math.round((v.ordered / v.calls) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equation */}
      {d && (
        <p className="text-[10px] text-dim text-center tabular-nums mb-4">
          {d.totalCalls} total = {d.ordered} ordered + {d.demo_done} demo done + {d.no_show} no show + {d.gone_cold} cold + {d.in_pipeline} pipeline + {d.direct_booking} direct + {d.pending} pending
          {d.sanity?.ok ? ' ✓' : ' ✗ MISMATCH'}
        </p>
      )}

      <footer className="border-t border-[#1A1A1A] pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
