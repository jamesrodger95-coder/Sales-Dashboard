'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface ReportData {
  configured: boolean;
  month: string;
  year: number;
  monthIndex: number;
  demoToOrderRate: number;
  trendLabels: string[];
  trends: Record<string, number[]>;
  reports: Record<string, {
    title: string;
    type?: 'monthly' | 'snapshot';
    count?: number;
    thisMonthCount?: number;
    currentCount?: number;
    totalCount?: number;
    crmCount?: number;
    directCount?: number;
    totalCountNum?: number;
    dispatchedCount?: number;
    revenueDispatched?: number;
    noShowRate?: number;
    totalPending?: number;
    calendarTotal?: number;
    staleCount?: number;
    enteredThisMonth?: number;
    arrivedCount?: number;
    breakdown?: Record<string, number>;
    byStatus?: Record<string, number>;
    data?: Record<string, unknown>[];
    crmData?: Record<string, unknown>[];
    directData?: Record<string, unknown>[];
  }>;
  error?: string;
}

function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() });
  }
  return opts;
}

const REPORT_META = [
  { key: 'report1', icon: 'user-plus',    group: 'lead',  countKey: 'count' },
  { key: 'report2', icon: 'calendar',     group: 'lead',  countKey: 'calendarTotal' },
  { key: 'report3', icon: 'user-x',       group: 'lead',  countKey: 'thisMonthCount' },
  { key: 'report4', icon: 'check-circle', group: 'lead',  countKey: 'thisMonthCount' },
  { key: 'report5', icon: 'alert-circle', group: 'lead',  countKey: 'thisMonthCount' },
  { key: 'report6', icon: 'ruler',        group: 'order', countKey: 'currentCount' },
  { key: 'report7', icon: 'search',       group: 'order', countKey: 'currentCount' },
  { key: 'report8', icon: 'settings',     group: 'order', countKey: 'totalCount' },
  { key: 'report9', icon: 'truck',        group: 'order', countKey: 'dispatchedCount' },
];

const URGENCY_COLORS: Record<string, string> = {
  red: 'text-danger', amber: 'text-warning', green: 'text-success',
  at_risk: 'text-danger', follow_up: 'text-warning', ok: 'text-success', ordered: 'text-success',
};

export default function ReportsPage() {
  const months = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const m = months[selectedMonth];
    try {
      const res = await fetch(`/api/reports?year=${m.year}&month=${m.month}`);
      const d = await res.json();
      if (!d.error) setData(d);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [selectedMonth, months]);

  useEffect(() => { loadData(); }, [loadData]);

  function getCount(report: ReportData['reports'][string], meta: typeof REPORT_META[number]): number {
    return (report as Record<string, unknown>)[meta.countKey] as number || 0;
  }

  const monthLabel = data?.month || months[selectedMonth].label;
  function TypeBadge({ type }: { type?: 'monthly' | 'snapshot' }) {
    if (type === 'snapshot') {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-[#1A1A1A] text-dim border border-[#222]">
          Current
        </span>
      );
    }
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-data-blue/10 text-data-blue border border-data-blue/20">
        {monthLabel}
      </span>
    );
  }

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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : !data?.configured ? (
        <div className="text-center py-20 text-muted">Zoho CRM not connected</div>
      ) : (
        <>
          {/* Lead Reports */}
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Lead Activity — {data.month}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {REPORT_META.filter(m => m.group === 'lead').map(meta => {
              const report = data.reports[meta.key];
              if (!report) return null;
              const count = getCount(report, meta);
              const isOpen = expanded === meta.key;
              return (
                <div key={meta.key} className="rounded-2xl border border-[#1A1A1A] bg-surface overflow-hidden">
                  <button onClick={() => setExpanded(isOpen ? null : meta.key)}
                    className="w-full p-5 text-left hover:bg-surface-hover transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{report.title}</p>
                        <TypeBadge type={report.type} />
                      </div>
                      <p className="text-2xl font-light text-white tabular-nums">{count}</p>
                    </div>
                    {report.staleCount !== undefined && report.staleCount > 0 && (
                      <p className="text-[11px] text-danger mt-1">{report.staleCount} over 24h without contact</p>
                    )}
                    {meta.key === 'report1' && report.byStatus && Object.keys(report.byStatus).length > 0 && (
                      <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
                        {Object.entries(report.byStatus)
                          .sort(([, a], [, b]) => b - a)
                          .map(([status, n]) => (
                            <span key={status} className="text-[10px] text-dim">
                              <span className="text-muted">{status.replace('Virtual Demo ', 'VD ').replace(' From Customer', '')}</span>
                              <span className="text-white ml-1 tabular-nums">{n}</span>
                            </span>
                          ))}
                      </div>
                    )}
                    {report.noShowRate !== undefined && (
                      <p className="text-[11px] text-dim mt-1">No-show rate: {report.noShowRate}%</p>
                    )}
                    {meta.key === 'report2' && report.directCount !== undefined && (
                      <p className="text-[11px] text-dim mt-1">CRM: {report.crmCount} | Direct: {report.directCount}</p>
                    )}
                    {meta.key === 'report4' && data.demoToOrderRate !== undefined && (
                      <p className="text-[11px] text-dim mt-1">Demo→Order rate: {data.demoToOrderRate}%</p>
                    )}
                  </button>
                  {isOpen && report.data && (
                    <div className="border-t border-[#1A1A1A] p-4 max-h-80 overflow-y-auto">
                      {report.data.length === 0 ? <p className="text-xs text-dim">No records</p> : (
                        <div className="space-y-2">
                          {(report.data as Record<string, unknown>[]).slice(0, 30).map((row, i) => {
                            const created = row.created ? new Date(String(row.created)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
                            const noShowDate = row.noShowDate ? new Date(String(row.noShowDate)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
                            const demoDate = row.demoDate ? new Date(String(row.demoDate)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
                            return (
                              <div key={i} className="flex items-center gap-3 py-1.5 text-xs border-b border-[#1A1A1A]/50 last:border-0">
                                <span className="text-white flex-1 truncate">{String(row.name || '')}</span>
                                {created && <span className="text-dim tabular-nums">{created}</span>}
                                {noShowDate && !created && <span className="text-dim tabular-nums">{noShowDate}</span>}
                                {demoDate && !created && !noShowDate && <span className="text-dim tabular-nums">{demoDate}</span>}
                                {row.status ? <span className="text-muted text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">{String(row.status)}</span> : null}
                                {row.country ? <span className="text-dim">{String(row.country)}</span> : null}
                                {row.daysSince !== undefined && <span className="text-muted tabular-nums">{String(row.daysSince)}d</span>}
                                {row.daysSinceDemo !== undefined && <span className="text-muted tabular-nums">{String(row.daysSinceDemo)}d</span>}
                                {row.urgency ? <span className={`${URGENCY_COLORS[String(row.urgency)] || 'text-dim'}`}>{String(row.urgency)}</span> : null}
                                {row.stale === true && <span className="text-danger">stale</span>}
                                {row.rebooked === false && <span className="text-danger">needs rebook</span>}
                                {row.rebooked === true && <span className="text-success">rebooked</span>}
                                {row.recentlyCold === true && <span className="text-warning">recent</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {report.crmData && (report.crmData as Record<string, unknown>[]).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#1A1A1A]">
                          <p className="text-[10px] text-dim mb-2">CRM Bookings</p>
                          {(report.crmData as Record<string, unknown>[]).slice(0, 10).map((row, i) => (
                            <div key={i} className="flex items-center gap-2 py-1 text-xs">
                              <span className="text-white flex-1 truncate">{String(row.name)}</span>
                              <span className="text-data-blue text-[10px]">CRM</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {report.directData && (report.directData as Record<string, unknown>[]).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#1A1A1A]">
                          <p className="text-[10px] text-dim mb-2">Direct Bookings (not in CRM)</p>
                          {(report.directData as Record<string, unknown>[]).slice(0, 10).map((row, i) => (
                            <div key={i} className="flex items-center gap-2 py-1 text-xs">
                              <span className="text-white flex-1 truncate">{String(row.name)}</span>
                              <span className="text-warning text-[10px]">Direct</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Order Reports — mix of current snapshots and monthly activity. Each card is tagged. */}
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-2">Orders</h2>
          <p className="text-[11px] text-dim mb-4">Cards tagged <span className="text-data-blue">{data.month}</span> show monthly activity. Cards tagged <span className="text-muted">Current</span> are live snapshots that don&apos;t change with the month tab.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {REPORT_META.filter(m => m.group === 'order').map(meta => {
              const report = data.reports[meta.key];
              if (!report) return null;
              const count = getCount(report, meta);
              const isOpen = expanded === meta.key;
              return (
                <div key={meta.key} className="rounded-2xl border border-[#1A1A1A] bg-surface overflow-hidden">
                  <button onClick={() => setExpanded(isOpen ? null : meta.key)}
                    className="w-full p-5 text-left hover:bg-surface-hover transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{report.title}</p>
                        <TypeBadge type={report.type} />
                      </div>
                      <p className="text-2xl font-light text-white tabular-nums">{count}</p>
                    </div>
                    {report.breakdown && (
                      <div className="flex gap-3 mt-2 text-[11px] text-dim">
                        {Object.entries(report.breakdown).map(([k, v]) => (
                          <span key={k}>{k}: <span className="text-muted">{v}</span></span>
                        ))}
                      </div>
                    )}
                    {report.revenueDispatched !== undefined && report.revenueDispatched > 0 && (
                      <p className="text-[11px] text-success mt-1">${report.revenueDispatched.toLocaleString()} dispatched</p>
                    )}
                    {report.enteredThisMonth !== undefined && (
                      <p className="text-[11px] text-dim mt-1">{report.enteredThisMonth} entered this month</p>
                    )}
                  </button>
                  {isOpen && report.data && (
                    <div className="border-t border-[#1A1A1A] p-4 max-h-80 overflow-y-auto">
                      {report.data.length === 0 ? <p className="text-xs text-dim">No records</p> : (
                        <div className="space-y-2">
                          {(report.data as Record<string, unknown>[]).slice(0, 30).map((row, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 text-xs border-b border-[#1A1A1A]/50 last:border-0">
                              <span className="text-white flex-1 truncate">{String(row.name || '')}</span>
                              {row.stage ? <span className="text-dim text-[10px]">{String(row.stage)}</span> : null}
                              {row.country ? <span className="text-dim">{String(row.country)}</span> : null}
                              {row.daysWaiting !== undefined && <span className="text-muted tabular-nums">{String(row.daysWaiting)}d</span>}
                              {row.daysInStage !== undefined && <span className="text-muted tabular-nums">{String(row.daysInStage)}d</span>}
                              {row.daysInCheck !== undefined && <span className="text-muted tabular-nums">{String(row.daysInCheck)}d</span>}
                              {row.amount !== undefined && Number(row.amount) > 0 && <span className="text-muted tabular-nums">${Math.round(Number(row.amount)).toLocaleString()}</span>}
                              {row.urgency ? <span className={`w-2 h-2 rounded-full ${row.urgency === 'red' ? 'bg-danger' : row.urgency === 'amber' ? 'bg-warning' : 'bg-success'}`} /> : null}
                              {row.delayed === true && <span className="text-danger text-[10px]">delayed</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 6-Month Trends */}
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">6-Month Trends</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {[
              { key: 'newLeads', label: 'New Leads' },
              { key: 'demosCompleted', label: 'Demos Completed' },
              { key: 'noShows', label: 'No Shows' },
              { key: 'noContact', label: 'Gone Cold' },
              { key: 'ordersCreated', label: 'Orders Created' },
              { key: 'dispatched', label: 'Dispatched' },
            ].map(t => {
              const vals = data.trends[t.key] || [];
              const current = vals[vals.length - 1] || 0;
              const prev = vals[vals.length - 2] || 0;
              const change = prev > 0 ? Math.round(((current - prev) / prev) * 100) : 0;
              return (
                <div key={t.key} className="rounded-2xl border border-[#1A1A1A] bg-surface p-4">
                  <p className="text-[11px] text-dim mb-2">{t.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-light text-white tabular-nums">{current}</span>
                    {change !== 0 && (
                      <span className={`text-[11px] ${change > 0 ? 'text-success' : 'text-danger'}`}>
                        {change > 0 ? '+' : ''}{change}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-0.5 h-8 mt-2">
                    {vals.map((v, i) => {
                      const max = Math.max(...vals, 1);
                      return (
                        <div key={i} className="flex-1 flex flex-col justify-end">
                          <div
                            className={`w-full rounded-sm transition-all ${i === vals.length - 1 ? 'bg-white' : 'bg-data-blue/50'}`}
                            style={{ height: `${Math.max((v / max) * 100, 4)}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    {data.trendLabels.map((l, i) => (
                      <span key={i} className="text-[8px] text-dim">{l}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <footer className="border-t border-[#1A1A1A] pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
