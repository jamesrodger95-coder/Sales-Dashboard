'use client';

import { useState, useEffect, useCallback } from 'react';
import { DemoPrepResult } from '@/lib/types';

export default function PrepPage() {
  const [prep, setPrep] = useState<DemoPrepResult | null>(null);
  const [noDemo, setNoDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const loadPrep = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/demo-prep');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.message && !data.leadName) {
        setNoDemo(true);
        setPrep(null);
      } else {
        setPrep(data);
        setNoDemo(false);
      }
      setLastRefresh(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrep();
    const interval = setInterval(loadPrep, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadPrep]);

  return (
    <div className="px-5 py-8 max-w-[800px] mx-auto">
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Demo Prep</h1>
          <p className="text-sm text-muted mt-1.5">
            Auto-refreshes every 5 minutes
            {lastRefresh && <span className="text-dim ml-2">Last {lastRefresh}</span>}
          </p>
        </div>
        <button
          onClick={loadPrep}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-40 transition-all duration-200"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="h-28 bg-subtle/30 rounded-card animate-pulse" />
          <div className="h-52 bg-subtle/30 rounded-card animate-pulse" />
        </div>
      )}

      {error && (
        <div className="py-3 px-4 rounded-card bg-danger/5 border border-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {noDemo && !loading && (
        <div className="rounded-card border border-subtle bg-surface p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-subtle mx-auto mb-4 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 4V10L14 12" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="10" r="8" stroke="#555" strokeWidth="1.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">No Upcoming Demos</h2>
          <p className="text-sm text-muted max-w-xs mx-auto">
            No demos found today. Check back closer to your next scheduled call.
          </p>
        </div>
      )}

      {prep && !loading && (
        <div className="space-y-5">
          {/* Lead Info */}
          <div className="rounded-card border border-subtle bg-surface p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{prep.leadName}</h2>
                <div className="flex flex-wrap items-center gap-4 mt-2">
                  {prep.phone && (
                    <span className="text-sm text-muted tabular-nums">{prep.phone}</span>
                  )}
                  {prep.country && (
                    <span className="text-sm text-dim">{prep.country}</span>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold text-white tabular-nums bg-subtle px-3 py-1.5 rounded-xl">
                {prep.demoTime}
              </span>
            </div>
            {prep.eventNotes && (
              <p className="mt-4 text-sm text-muted border-t border-subtle pt-4 leading-relaxed">
                {prep.eventNotes}
              </p>
            )}
          </div>

          {/* Talking Points */}
          <div className="rounded-card border border-subtle bg-surface p-6">
            <h3 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Talking Points</h3>
            <ul className="space-y-3">
              {prep.talkingPoints?.map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-subtle flex items-center justify-center text-xs text-muted flex-shrink-0 mt-0.5 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-white/90 leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Products */}
          {prep.suggestedProducts?.length > 0 && (
            <div className="rounded-card border border-subtle bg-surface p-6">
              <h3 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Suggested Products</h3>
              <div className="flex flex-wrap gap-2">
                {prep.suggestedProducts.map((product, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-xl bg-subtle text-sm text-white font-medium">
                    {product}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {prep.previousInteractions?.length > 0 && (
            <div className="rounded-card border border-subtle bg-surface p-6">
              <h3 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">History</h3>
              <div className="space-y-2">
                {prep.previousInteractions.map((interaction, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-subtle/60 last:border-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted flex-shrink-0" />
                    <p className="text-sm text-muted">{interaction}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Factors */}
          {prep.riskFactors?.length > 0 && (
            <div className="rounded-card border border-subtle bg-surface p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-danger" />
                <h3 className="text-xs font-semibold uppercase tracking-heading text-dim">Risk Factors</h3>
              </div>
              <ul className="space-y-2">
                {prep.riskFactors.map((risk, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed">{risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
