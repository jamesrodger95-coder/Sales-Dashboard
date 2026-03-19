'use client';

import { useState, useEffect } from 'react';

interface ConversionRecord {
  name: string; email: string; phone: string | null; date: string;
  country: string | null; status: string; crmStage: string | null;
  orderValue: number | null; daysSince: number;
}

interface ConversionData {
  zohoConnected: boolean;
  totalCalls: number; converted: number; inPipeline: number; pending: number; lost: number;
  conversionRate: number;
  records: ConversionRecord[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  converted: { bg: 'bg-success/10', text: 'text-success', label: 'Ordered' },
  in_pipeline: { bg: 'bg-data-blue/10', text: 'text-data-blue', label: 'In Pipeline' },
  pending: { bg: 'bg-warning/10', text: 'text-warning', label: 'Pending' },
  lost: { bg: 'bg-danger/10', text: 'text-danger', label: 'No Match' },
  unknown: { bg: 'bg-dim/10', text: 'text-dim', label: 'Unknown' },
};

export default function ConversionsPage() {
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/conversions')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.records?.filter(r => filter === 'all' || r.status === filter) || [];

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Funnel KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Calls', val: data?.totalCalls, color: 'text-white' },
          { label: 'In Pipeline', val: data?.inPipeline, color: 'text-data-blue' },
          { label: 'Converted', val: data?.converted, color: 'text-success' },
          { label: 'Pending', val: data?.pending, color: 'text-warning' },
          { label: 'Conversion Rate', val: data ? `${data.conversionRate}%` : '--', color: 'text-white' },
        ].map((kpi, i) => (
          <div key={i} className="rounded-2xl border border-[#1A1A1A] bg-surface p-5 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-2">{kpi.label}</p>
            <p className={`text-3xl font-light tabular-nums ${kpi.color}`}>{loading ? '--' : kpi.val ?? '--'}</p>
          </div>
        ))}
      </div>

      {!data?.zohoConnected && !loading && (
        <div className="p-4 rounded-2xl bg-surface border border-dashed border-[#333] mb-6 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-dim"><rect x="2" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" /></svg>
          <p className="text-xs text-dim">Connect Zoho CRM in Settings for full conversion tracking</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 mb-6">
        {['all', 'converted', 'in_pipeline', 'pending', 'lost'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${filter === f ? 'bg-white text-black' : 'text-dim hover:text-muted'}`}>
            {f === 'in_pipeline' ? 'In Pipeline' : f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#1A1A1A] bg-surface">
        {loading ? (
          <div className="p-6 space-y-0">{[...Array(8)].map((_, i) => <div key={i} className="h-12 skeleton" style={{ animationDelay: `${i * 60}ms` }} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-dim text-sm">No records</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[#1A1A1A]">
                <th className="py-3 pl-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Name</th>
                <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Call Date</th>
                <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Status</th>
                <th className="py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden md:table-cell">CRM Stage</th>
                <th className="py-3 pr-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden sm:table-cell">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const style = STATUS_STYLES[r.status] || STATUS_STYLES.unknown;
                return (
                  <tr key={i} className="fade-in-row border-b border-[#1A1A1A]/50 last:border-0 hover:bg-white/[0.02] transition-colors" style={{ animationDelay: `${i * 30}ms` }}>
                    <td className="py-3 pl-6">
                      <p className="text-white font-medium">{r.name}</p>
                      <p className="text-[11px] text-dim">{r.email}</p>
                    </td>
                    <td className="py-3 text-muted text-xs">
                      {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      <span className="text-dim ml-1">{r.daysSince}d</span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.text.replace('text-', 'bg-')}`} />
                        {style.label}
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
