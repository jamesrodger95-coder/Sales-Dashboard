'use client';

import { useState, useEffect } from 'react';

interface StageData {
  count: number;
  value: number;
  category: string;
  deals: { name: string; value: number; country: string | null; daysInStage: number }[];
}

interface PipelineData {
  configured: boolean;
  totalLeads: number;
  totalDeals: number;
  totalPipelineValue: number;
  leadsByStatus: Record<string, { count: number }>;
  dealsByStage: Record<string, StageData>;
  redFlags: { name: string; stage: string; days: number; type: string }[];
  yellowFlags: { name: string; stage: string; days: number; type: string }[];
  error?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  pre_purchase: 'bg-data-blue', in_production: 'bg-warning',
  shipped: 'bg-success', post_delivery: 'bg-success/60',
  problem: 'bg-danger', other: 'bg-dim',
};
const CATEGORY_LABELS: Record<string, string> = {
  pre_purchase: 'Pre-Purchase', in_production: 'In Production',
  shipped: 'Shipped', post_delivery: 'Post-Delivery',
  problem: 'Issues', other: 'Other',
};

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/zoho/pipeline')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      <div className="skeleton h-6 w-32 mb-8" />
      <div className="grid grid-cols-3 gap-4 mb-8">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      <div className="space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-14 rounded-2xl" />)}</div>
    </div>
  );

  if (!data?.configured) return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto text-center py-20">
      <p className="text-muted">Zoho CRM not connected</p>
    </div>
  );

  // Group stages by category
  const categories = ['pre_purchase', 'in_production', 'shipped', 'post_delivery', 'problem', 'other'];
  const grouped = categories.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    stages: Object.entries(data.dealsByStage || {})
      .filter(([, v]) => v.category === cat)
      .sort(([, a], [, b]) => b.count - a.count),
  })).filter(g => g.stages.length > 0);

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-2">Total Leads</p>
          <p className="text-3xl font-light text-white tabular-nums">{data.totalLeads.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-2">Total Deals</p>
          <p className="text-3xl font-light text-white tabular-nums">{data.totalDeals.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-2">Pipeline Value</p>
          <p className="text-3xl font-light text-white tabular-nums">£{Math.round(data.totalPipelineValue).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-2">Follow-Ups</p>
          <p className="text-3xl font-light text-danger tabular-nums">{data.redFlags?.length || 0}</p>
        </div>
      </div>

      {/* Follow-up flags */}
      {(data.redFlags?.length > 0 || data.yellowFlags?.length > 0) && (
        <div className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Follow-Up Actions</h2>
          <div className="space-y-2">
            {data.redFlags?.slice(0, 10).map((f, i) => (
              <div key={`r${i}`} className="flex items-center gap-3 p-3 rounded-2xl border border-[#1A1A1A] bg-surface">
                <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                <span className="text-sm text-white flex-1">{f.name}</span>
                <span className="text-xs text-dim">{f.stage}</span>
                <span className="text-xs text-danger tabular-nums">{f.days}d</span>
              </div>
            ))}
            {data.yellowFlags?.slice(0, 5).map((f, i) => (
              <div key={`y${i}`} className="flex items-center gap-3 p-3 rounded-2xl border border-[#1A1A1A] bg-surface">
                <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0" />
                <span className="text-sm text-white flex-1">{f.name}</span>
                <span className="text-xs text-dim">{f.stage}</span>
                <span className="text-xs text-warning tabular-nums">{f.days}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deal pipeline by category */}
      {grouped.map(group => (
        <div key={group.category} className="mb-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[group.category]}`} />
            {group.label}
          </h2>
          <div className="space-y-2">
            {group.stages.map(([stage, stageData]) => (
              <div key={stage}>
                <button
                  onClick={() => setExpandedStage(expandedStage === stage ? null : stage)}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl border border-[#1A1A1A] bg-surface hover:bg-surface-hover transition-colors text-left"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_COLORS[stageData.category]}`} />
                  <span className="text-sm text-white flex-1">{stage}</span>
                  <span className="text-sm text-white font-semibold tabular-nums">{stageData.count}</span>
                  {stageData.value > 0 && (
                    <span className="text-xs text-dim tabular-nums">£{Math.round(stageData.value).toLocaleString()}</span>
                  )}
                </button>
                {expandedStage === stage && stageData.deals.length > 0 && (
                  <div className="ml-8 mt-1 mb-2 space-y-1">
                    {stageData.deals.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 text-xs border-b border-[#1A1A1A]/50 last:border-0">
                        <span className="text-muted flex-1">{d.name}</span>
                        {d.country && <span className="text-dim">{d.country}</span>}
                        {d.value > 0 && <span className="text-muted tabular-nums">£{Math.round(d.value).toLocaleString()}</span>}
                        <span className={`tabular-nums ${d.daysInStage > 30 ? 'text-danger' : d.daysInStage > 14 ? 'text-warning' : 'text-dim'}`}>
                          {d.daysInStage}d
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Lead statuses */}
      {data.leadsByStatus && Object.keys(data.leadsByStatus).length > 0 && (
        <div className="mb-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Lead Statuses</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.leadsByStatus).sort(([, a], [, b]) => b.count - a.count).map(([status, d]) => (
              <div key={status} className="rounded-2xl border border-[#1A1A1A] bg-surface p-4 text-center">
                <p className="text-2xl font-light text-white tabular-nums">{d.count}</p>
                <p className="text-[11px] text-dim mt-1">{status || 'No Status'}</p>
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
