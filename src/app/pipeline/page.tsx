'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import FollowUpList from '@/components/FollowUpList';

interface PipelineStage {
  count: number;
  leads: { name: string; email: string | null; phone: string | null; country: string | null; days: number }[];
}

interface CompletedDemoItem { name: string; email: string; phone: string | null; date: string; country: string | null; source: 'calendar' | 'zoho_vdc'; status: string | null; hasOrder: boolean }
interface NoShowItem { name: string; email: string | null; phone: string | null; date: string; country: string | null; rebooked: boolean }

interface PipelineData {
  configured: boolean;
  month: string;
  kpis: { newLeads: number; demosBooked: number; demosCompleted: number; noShows: number; ordersThisMonth: number; activePipelineValue: number };
  completedDemos?: { count: number; items: CompletedDemoItem[]; debug: Record<string, number> };
  noShowItems?: NoShowItem[];
  activePipeline: Record<string, PipelineStage>;
  directBookings: { name: string; email: string; date: string; isPast: boolean }[];
  directBookingCount: number;
  redFlags: { name: string; stage: string; days: number; action: string; email: string | null; phone: string | null }[];
  yellowFlags: { name: string; stage: string; days: number; action: string; email: string | null; phone: string | null }[];
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

const PRE_STAGES = ['Registered', 'First Contact Made', 'Virtual Demo Booked', 'Virtual Demo Completed'];
const PROBLEM_STAGES = ['No Contact', 'No Show'];
const POST_STAGES = ['Awaiting Measurements', 'Measurements Final Checks', 'Measurement Issues', 'In Manufacturing', 'Order Assembled', 'Order Ready to Send', 'Address Confirmed'];

export default function PipelinePage() {
  const months = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<'completed' | 'noshow' | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const m = months[selectedMonth];
    try {
      const res = await fetch(`/api/zoho/pipeline?year=${m.year}&month=${m.month}`);
      const d = await res.json();
      if (!d.error) setData(d);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [selectedMonth, months]);

  useEffect(() => { loadData(); }, [loadData]);

  function stageCount(stage: string): number {
    return data?.activePipeline?.[stage]?.count || 0;
  }

  function StageBox({ stage, color }: { stage: string; color: string }) {
    const count = stageCount(stage);
    const isOpen = expanded === stage;
    const stageData = data?.activePipeline?.[stage];
    return (
      <div>
        <button
          onClick={() => setExpanded(isOpen ? null : stage)}
          className={`w-full rounded-2xl border ${count > 0 ? 'border-[#1A1A1A]' : 'border-[#111]'} bg-surface p-3 hover:bg-surface-hover transition-colors text-left`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[11px] text-dim flex-1 truncate">{stage.replace('Virtual Demo ', 'VD ').replace('From Customer', '')}</span>
            <span className={`text-lg font-light tabular-nums ${count > 0 ? 'text-white' : 'text-[#333]'}`}>{count}</span>
          </div>
        </button>
        {isOpen && stageData && stageData.leads.length > 0 && (
          <div className="mt-1 ml-4 mb-2 space-y-1">
            {stageData.leads.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 text-xs border-b border-[#1A1A1A]/40 last:border-0">
                <span className="text-white flex-1 truncate">{l.name}</span>
                {l.country ? <span className="text-dim">{l.country}</span> : null}
                <span className={`tabular-nums ${l.days > 14 ? 'text-danger' : l.days > 7 ? 'text-warning' : 'text-dim'}`}>{l.days}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      <div className="flex gap-2 mb-6">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-8 w-20 rounded-lg" />)}</div>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 rounded-2xl" />)}</div>
    </div>
  );

  if (!data?.configured) return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto text-center py-20"><p className="text-muted">Zoho CRM not connected</p></div>
  );

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Follow-ups from call debriefs */}
      <div className="mb-6">
        <FollowUpList />
      </div>

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

      {/* Monthly KPIs */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Activity in {data.month}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'New Leads', val: data.kpis.newLeads },
          { label: 'Demos Booked', val: data.kpis.demosBooked },
          { label: 'Demos Completed', val: data.kpis.demosCompleted, click: 'completed' as const },
          { label: 'No Shows', val: data.kpis.noShows, danger: true, click: 'noshow' as const },
          { label: 'Orders', val: data.kpis.ordersThisMonth },
          { label: 'Active Value', val: `$${data.kpis.activePipelineValue.toLocaleString()}`, small: true, snapshot: true },
        ].map((k, i) => {
          const inner = (
            <>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] mb-1">{k.label}{k.snapshot ? ' · now' : ''}</p>
              <p className={`${k.small ? 'text-lg' : 'text-2xl'} font-light tabular-nums ${k.danger ? 'text-danger' : 'text-white'}`}>{k.val}</p>
            </>
          );
          if (k.click) {
            return (
              <button key={i}
                onClick={() => setDrilldown(drilldown === k.click ? null : k.click!)}
                className={`rounded-2xl border ${drilldown === k.click ? 'border-[#333]' : 'border-[#1A1A1A]'} bg-surface p-4 text-left hover:bg-surface-hover transition-colors`}>
                {inner}
              </button>
            );
          }
          return <div key={i} className="rounded-2xl border border-[#1A1A1A] bg-surface p-4">{inner}</div>;
        })}
      </div>

      {/* Drilldown */}
      {drilldown && (
        <div className="rounded-2xl border border-[#222] bg-surface mb-6 overflow-hidden">
          <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">
              {drilldown === 'completed'
                ? `Demos Completed — ${data.month} (${data.completedDemos?.count ?? 0})`
                : `No Shows — ${data.month} (${data.noShowItems?.length ?? 0})`}
            </h3>
            <button onClick={() => setDrilldown(null)} className="text-xs text-dim hover:text-muted">Close</button>
          </div>
          {drilldown === 'completed' && data.completedDemos && (
            <>
              <div className="px-4 py-2 border-b border-[#1A1A1A] text-[11px] text-dim flex flex-wrap gap-x-4 gap-y-1">
                <span>Calendar events: <span className="text-muted">{data.completedDemos.debug.calendarTotalInMonth}</span></span>
                <span>Past sales calls: <span className="text-muted">{data.completedDemos.debug.pastSalesCalls}</span></span>
                <span>− No shows: <span className="text-danger">{data.completedDemos.debug.noShows}</span></span>
                <span>− Cancellations: <span className="text-warning">{data.completedDemos.debug.cancellations}</span></span>
                <span>+ Zoho-only VDC: <span className="text-muted">{data.completedDemos.debug.fromZohoVDCOnly}</span></span>
                <span className="ml-auto text-white">= {data.completedDemos.count}</span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-[#1A1A1A] text-left">
                      <th className="py-2 pl-4 text-[10px] text-[#555]">#</th>
                      <th className="py-2 text-[10px] text-[#555]">Name</th>
                      <th className="py-2 text-[10px] text-[#555]">Phone</th>
                      <th className="py-2 text-[10px] text-[#555]">Date</th>
                      <th className="py-2 text-[10px] text-[#555]">Country</th>
                      <th className="py-2 pr-4 text-[10px] text-[#555]">CRM Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.completedDemos.items.map((it, i) => (
                      <tr key={i} className="border-b border-[#1A1A1A]/40 hover:bg-white/[0.02]">
                        <td className="py-2 pl-4 text-dim tabular-nums">{i + 1}</td>
                        <td className="py-2">
                          <p className="text-white">{it.name}</p>
                          <p className="text-[10px] text-dim">{it.email}</p>
                        </td>
                        <td className="py-2 font-mono tabular-nums">{it.phone ? <a href={`tel:${it.phone.replace(/\s/g, '')}`} className="text-muted hover:text-white">{it.phone}</a> : <span className="text-dim">—</span>}</td>
                        <td className="py-2 text-muted">{new Date(it.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                        <td className="py-2 text-dim">{it.country || '—'}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-[10px] ${it.hasOrder ? 'text-success' : 'text-muted'}`}>
                            {it.hasOrder ? 'Ordered' : (it.status || '—')}
                          </span>
                          {it.source === 'zoho_vdc' && <span className="ml-1 text-[9px] text-dim">(zoho)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {drilldown === 'noshow' && data.noShowItems && (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-[#1A1A1A] text-left">
                    <th className="py-2 pl-4 text-[10px] text-[#555]">#</th>
                    <th className="py-2 text-[10px] text-[#555]">Name</th>
                    <th className="py-2 text-[10px] text-[#555]">Phone</th>
                    <th className="py-2 text-[10px] text-[#555]">Date</th>
                    <th className="py-2 pr-4 text-[10px] text-[#555]">Rebooked?</th>
                  </tr>
                </thead>
                <tbody>
                  {data.noShowItems.map((it, i) => (
                    <tr key={i} className="border-b border-[#1A1A1A]/40 hover:bg-white/[0.02]">
                      <td className="py-2 pl-4 text-dim tabular-nums">{i + 1}</td>
                      <td className="py-2">
                        <p className="text-white">{it.name}</p>
                        <p className="text-[10px] text-dim">{it.email}</p>
                      </td>
                      <td className="py-2 font-mono tabular-nums">{it.phone ? <a href={`tel:${it.phone.replace(/\s/g, '')}`} className="text-muted hover:text-white">{it.phone}</a> : <span className="text-dim">—</span>}</td>
                      <td className="py-2 text-muted">{new Date(it.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      <td className="py-2 pr-4">
                        {it.rebooked
                          ? <span className="text-success">Rebooked</span>
                          : <span className="text-danger">Needs rebook</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pre-Purchase Pipeline — snapshot, NOT filtered by selected month */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-2 border-b border-[#1A1A1A] mb-1">Current Pipeline</h2>
      <p className="text-[11px] text-dim mb-3">Live snapshot — counts below don&apos;t change when you switch months.</p>
      <h3 className="text-[10px] font-medium uppercase tracking-[0.15em] text-dim mb-2">Pre-Purchase</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {PRE_STAGES.map(s => <StageBox key={s} stage={s} color="bg-data-blue" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        {PROBLEM_STAGES.map(s => <StageBox key={s} stage={s} color="bg-danger" />)}
      </div>

      {/* Post-Purchase Pipeline — also snapshot */}
      <h3 className="text-[10px] font-medium uppercase tracking-[0.15em] text-dim mb-2">Post-Purchase</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {POST_STAGES.filter(s => stageCount(s) > 0 || ['Awaiting Measurements', 'In Manufacturing', 'Dispatched'].includes(s)).map(s => (
          <StageBox key={s} stage={s} color="bg-success" />
        ))}
      </div>

      {/* Direct Bookings */}
      {data.directBookings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">
            Direct Bookings — Not in CRM ({data.directBookingCount})
          </h2>
          <div className="rounded-2xl border border-warning/20 bg-surface p-4">
            <p className="text-xs text-warning mb-3">{data.directBookingCount} people booked demos via Calendly but are not in Zoho CRM</p>
            <div className="space-y-1.5">
              {data.directBookings.slice(0, 10).map((b, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-[#1A1A1A]/40 last:border-0">
                  <span className="text-white flex-1">{b.name}</span>
                  <span className="text-dim">{b.email}</span>
                  <span className="text-muted">{new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.isPast ? 'text-success bg-success/10' : 'text-data-blue bg-data-blue/10'}`}>
                    {b.isPast ? 'completed' : 'upcoming'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Follow-Up Actions */}
      {(data.redFlags.length > 0 || data.yellowFlags.length > 0) && (
        <div className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Follow-Up Actions</h2>
          <div className="space-y-2">
            {data.redFlags.map((f, i) => (
              <div key={`r${i}`} className="flex items-center gap-3 p-3 rounded-2xl border border-[#1A1A1A] bg-surface">
                <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                <span className="text-sm text-white flex-1 truncate">{f.name}</span>
                <span className="text-[11px] text-dim hidden sm:block">{f.action}</span>
                <span className="text-[11px] text-muted">{f.stage}</span>
                <span className="text-[11px] text-danger tabular-nums">{f.days}d</span>
              </div>
            ))}
            {data.yellowFlags.map((f, i) => (
              <div key={`y${i}`} className="flex items-center gap-3 p-3 rounded-2xl border border-[#1A1A1A] bg-surface">
                <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0" />
                <span className="text-sm text-white flex-1 truncate">{f.name}</span>
                <span className="text-[11px] text-dim hidden sm:block">{f.action}</span>
                <span className="text-[11px] text-muted">{f.stage}</span>
                <span className="text-[11px] text-warning tabular-nums">{f.days}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="border-t border-[#1A1A1A] pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
