'use client';

import { useState, useEffect } from 'react';

interface CallItem { time?: string; name?: string; contact?: string; phone?: string; country?: string; location?: string; notes?: string | null; attendance?: string | null; crmStatus?: string }
interface AttentionItem { severity?: string; name?: string; stage?: string; days?: number; contact?: string | null; action?: string }
interface InsightItem { type?: string; text?: string; insight?: string }

interface BriefingData {
  generated: boolean;
  cached?: boolean;
  fallback?: boolean;
  generatedAt?: string;
  date?: string;
  summary?: string;
  todaysCalls?: CallItem[];
  tomorrowsCalls?: CallItem[];
  pipeline?: Record<string, string | number>;
  attentionItems?: AttentionItem[];
  insights?: InsightItem[];
  teamTasks?: Record<string, string[]>;
  weeklyScorecard?: Record<string, unknown> | null;
  error?: string;
  message?: string;
}

const SEVERITY_COLORS: Record<string, { dot: string; bg: string }> = {
  red: { dot: 'bg-danger', bg: 'border-l-danger' },
  amber: { dot: 'bg-warning', bg: 'border-l-warning' },
};

const INSIGHT_COLORS: Record<string, string> = {
  positive: 'border-l-success',
  concern: 'border-l-danger',
  neutral: 'border-l-data-blue',
};

export default function BriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Try to load cached report first
  useEffect(() => {
    fetch('/api/agents/analyst')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/agents/analyst', { method: 'POST' });
      const d = await res.json();
      setData(d);
    } catch { /* handled */ }
    finally { setGenerating(false); }
  };

  const generatedTime = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="px-5 py-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Daily Briefing</h1>
          {generatedTime && (
            <p className="text-[11px] text-dim mt-0.5">
              Generated at {generatedTime}{data?.cached ? ' (cached)' : ''}
            </p>
          )}
        </div>
        <button onClick={generate} disabled={generating}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-40 transition-all">
          {generating ? 'Generating...' : data?.generated ? 'Refresh Analysis' : 'Generate Now'}
        </button>
      </div>

      {/* Loading / generating */}
      {(loading || generating) && (
        <div className="space-y-4">
          {generating && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6 text-center">
              <div className="inline-block w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted">Analysing calendar, Zoho CRM, and cross-reference data...</p>
              <p className="text-xs text-dim mt-1">This takes 10-20 seconds</p>
            </div>
          )}
          {loading && !generating && [...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
      )}

      {/* No report yet */}
      {!loading && !generating && !data?.generated && (
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-8 text-center">
          <svg className="w-8 h-8 text-[#333] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-muted mb-1">{data?.message || 'No briefing generated today'}</p>
          <p className="text-xs text-dim">Click Generate Now or wait for the 11:00 AM auto-generation</p>
        </div>
      )}

      {/* Report content */}
      {data?.generated && !generating && (
        <div className="space-y-6">
          {/* Summary */}
          {data.summary && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <p className="text-sm text-white leading-relaxed">{data.summary}</p>
            </div>
          )}

          {/* Today's Calls */}
          {data.todaysCalls && data.todaysCalls.length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Today&apos;s Calls</h2>
              <div className="space-y-3">
                {data.todaysCalls.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-sm text-white tabular-nums font-semibold min-w-[45px]">{c.time}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{c.name || c.contact || 'Unknown'}</p>
                      {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="text-xs text-dim font-mono hover:text-muted transition-colors">{c.phone}</a>}
                      {(c.country || c.location) && <span className="text-xs text-dim ml-2">{c.country || c.location}</span>}
                      {c.notes && <p className="text-xs text-muted italic mt-1">&ldquo;{c.notes}&rdquo;</p>}
                      {c.crmStatus && <span className="text-[10px] text-dim">{c.crmStatus}</span>}
                      {c.attendance === 'No' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-danger ml-2"><span className="w-1.5 h-1.5 rounded-full bg-danger" />Attendance not confirmed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline Snapshot */}
          {data.pipeline && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Pipeline This Month</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(data.pipeline).map(([key, val]) => (
                  <div key={key} className="py-2">
                    <p className="text-[11px] text-dim">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</p>
                    <p className="text-lg font-light text-white tabular-nums">{String(val)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attention Items */}
          {data.attentionItems && data.attentionItems.length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Attention Needed ({data.attentionItems.length})</h2>
              <div className="space-y-2">
                {data.attentionItems.map((item, i) => {
                  const colors = SEVERITY_COLORS[item.severity || 'amber'] || SEVERITY_COLORS.amber;
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border-l-[3px] ${colors.bg} bg-[#0A0A0A]`}>
                      <span className={`w-2 h-2 rounded-full ${colors.dot} mt-1.5 flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white font-medium">{item.name || 'Unknown'}</span>
                          {(item.stage || item.days) && <span className="text-[10px] text-dim">{[item.stage, item.days ? `${item.days}d` : ''].filter(Boolean).join(' · ')}</span>}
                        </div>
                        {item.action && <p className="text-xs text-muted mt-0.5">{item.action}</p>}
                        {item.contact && <a href={`tel:${item.contact.replace(/\s/g, '')}`} className="text-[11px] text-dim font-mono hover:text-muted transition-colors">{item.contact}</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Insights */}
          {data.insights && data.insights.length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Insights</h2>
              <div className="space-y-2">
                {data.insights.map((insight, i) => {
                  const text = insight.text || insight.insight || String(insight);
                  const type = insight.type || 'neutral';
                  return (
                    <div key={i} className={`p-3 rounded-xl border-l-[3px] ${INSIGHT_COLORS[type] || INSIGHT_COLORS.neutral} bg-[#0A0A0A]`}>
                      <p className="text-sm text-muted leading-relaxed">{text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Team Tasks — handle flexible key names from Claude */}
          {data.teamTasks && Object.keys(data.teamTasks).length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Team Tasks</h2>
              <div className="space-y-4">
                {Object.entries(data.teamTasks).map(([key, tasks]) => {
                  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return null;
                  // Format the key as a label
                  const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()).trim();
                  return (
                    <div key={key}>
                      <p className="text-xs text-white font-medium mb-2">{label}</p>
                      <div className="space-y-1.5 ml-3">
                        {tasks.map((task: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-dim mt-0.5">{i + 1}.</span>
                            <p className="text-muted">{task}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tomorrow Preview */}
          {data.tomorrowsCalls && data.tomorrowsCalls.length > 0 && (
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-3">Tomorrow</h2>
              <div className="space-y-2">
                {data.tomorrowsCalls.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <span className="text-sm text-white tabular-nums font-semibold min-w-[45px]">{c.time}</span>
                    <span className="text-sm text-muted">{c.name || c.contact || 'Unknown'}</span>
                    {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="text-xs text-dim font-mono hover:text-muted ml-auto">{c.phone}</a>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="border-t border-[#1A1A1A] mt-8 pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
