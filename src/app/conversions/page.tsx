'use client';

import { useState, useEffect } from 'react';

interface ConversionRecord {
  name: string; email: string; phone: string | null; date: string;
  country: string | null; status: string; crmStage: string | null;
  orderValue: number | null; daysSince: number;
}

interface ConversionData {
  zohoConnected: boolean;
  totalCalls: number; ordered: number; in_pipeline: number; demo_done: number;
  no_show: number; gone_cold: number; direct_booking: number; pending: number;
  conversionRate: number;
  records: ConversionRecord[];
  directBookings: ConversionRecord[];
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; dotColor: string }> = {
  ordered: { bg: 'bg-success/10', text: 'text-success', label: 'Ordered', dotColor: 'bg-success' },
  in_pipeline: { bg: 'bg-data-blue/10', text: 'text-data-blue', label: 'In Pipeline', dotColor: 'bg-data-blue' },
  demo_done: { bg: 'bg-[#A78BFA]/10', text: 'text-[#A78BFA]', label: 'Demo Done', dotColor: 'bg-[#A78BFA]' },
  no_show: { bg: 'bg-danger/10', text: 'text-danger', label: 'No Show', dotColor: 'bg-danger' },
  gone_cold: { bg: 'bg-warning/10', text: 'text-warning', label: 'Gone Cold', dotColor: 'bg-warning' },
  direct_booking: { bg: 'bg-dim/10', text: 'text-muted', label: 'Direct', dotColor: 'bg-dim' },
  pending: { bg: 'bg-warning/10', text: 'text-warning', label: 'Pending', dotColor: 'bg-warning' },
};

export default function ConversionsPage() {
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/conversions').then(r => r.json()).then(d => { if (!d.error) setData(d); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = data?.records?.filter(r => filter === 'all' || r.status === filter) || [];

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        {[
          { label: 'Total Calls', val: data?.totalCalls, color: 'text-white' },
          { label: 'Ordered', val: data?.ordered, color: 'text-success' },
          { label: 'In Pipeline', val: data?.in_pipeline, color: 'text-data-blue' },
          { label: 'Demo Done', val: data?.demo_done, color: 'text-[#A78BFA]' },
          { label: 'No Show', val: data?.no_show, color: 'text-danger' },
          { label: 'Gone Cold', val: data?.gone_cold, color: 'text-warning' },
          { label: 'Direct', val: data?.direct_booking, color: 'text-muted' },
          { label: 'Conv. Rate', val: data ? `${data.conversionRate}%` : '--', color: 'text-white' },
        ].map((kpi, i) => (
          <div key={i} className="rounded-2xl border border-[#1A1A1A] bg-surface p-4 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555] mb-1">{kpi.label}</p>
            <p className={`text-2xl font-light tabular-nums ${kpi.color}`}>{loading ? '--' : kpi.val ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Direct bookings alert */}
      {data?.directBookings && data.directBookings.length > 0 && (
        <div className="rounded-2xl border border-[#333] bg-surface p-4 mb-6">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-3">
            Direct Bookings — No CRM Record ({data.directBookings.length})
          </h3>
          <p className="text-xs text-dim mb-3">These people booked via Calendly but aren&apos;t in Zoho. Consider adding them.</p>
          <div className="space-y-1">
            {data.directBookings.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="text-white">{r.name}</span>
                <span className="text-dim">{r.email}</span>
                <span className="text-dim ml-auto">{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {['all', 'ordered', 'in_pipeline', 'demo_done', 'no_show', 'gone_cold', 'direct_booking', 'pending'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${filter === f ? 'bg-white text-black' : 'text-dim hover:text-muted'}`}>
            {STATUS_CONFIG[f]?.label || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#1A1A1A] bg-surface">
        {loading ? (
          <div className="p-6 space-y-0">{[...Array(8)].map((_, i) => <div key={i} className="h-12 skeleton" style={{ animationDelay: `${i * 50}ms` }} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-dim text-sm">No records</div>
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
              {filtered.map((r, i) => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                return (
                  <tr key={i} className="fade-in-row border-b border-[#1A1A1A]/50 last:border-0 hover:bg-white/[0.02]" style={{ animationDelay: `${i * 25}ms` }}>
                    <td className="py-3 pl-6">
                      <p className="text-white font-medium">{r.name}</p>
                      <p className="text-[11px] text-dim">{r.email}</p>
                    </td>
                    <td className="py-3 text-xs text-muted">
                      {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      <span className="text-dim ml-1">{r.daysSince}d</span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-dim hidden md:table-cell">{r.crmStage || '--'}</td>
                    <td className="py-3 pr-6 text-xs text-muted tabular-nums hidden sm:table-cell">
                      {r.orderValue ? `£${Math.round(r.orderValue).toLocaleString()}` : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="border-t border-[#1A1A1A] mt-8 pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
