'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import FollowUpList from '@/components/FollowUpList';

interface PipelineStage {
  count: number;
  leads: { name: string; email: string | null; phone: string | null; country: string | null; days: number }[];
}

interface PipelineData {
  configured: boolean;
  month: string;
  kpis: { newLeads: number; demosBooked: number; demosCompleted: number; noShows: number; ordersThisMonth: number; activePipelineValue: number };
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

      {/* This Month KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: 'New Leads', val: data.kpis.newLeads },
          { label: 'Demos Booked', val: data.kpis.demosBooked },
          { label: 'Demos Completed', val: data.kpis.demosCompleted },
          { label: 'No Shows', val: data.kpis.noShows, danger: true },
          { label: 'Orders', val: data.kpis.ordersThisMonth },
          { label: 'Active Value', val: `$${data.kpis.activePipelineValue.toLocaleString()}`, small: true },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl border border-[#1A1A1A] bg-surface p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] mb-1">{k.label}</p>
            <p className={`${k.small ? 'text-lg' : 'text-2xl'} font-light tabular-nums ${k.danger ? 'text-danger' : 'text-white'}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Pre-Purchase Pipeline */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Pre-Purchase Pipeline</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {PRE_STAGES.map(s => <StageBox key={s} stage={s} color="bg-data-blue" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        {PROBLEM_STAGES.map(s => <StageBox key={s} stage={s} color="bg-danger" />)}
      </div>

      {/* Post-Purchase Pipeline */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Post-Purchase Pipeline</h2>
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
