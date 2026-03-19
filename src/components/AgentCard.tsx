'use client';

import { useState } from 'react';

interface AgentCardProps {
  title: string;
  description: string;
  endpoint: string;
  children: (data: Record<string, unknown> | null, loading: boolean) => React.ReactNode;
}

export default function AgentCard({ title, description, endpoint, children }: AgentCardProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runAgent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Agent returned ${res.status}`);
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setData(result);
      setLastRun(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Agent failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-card border border-subtle bg-surface p-6 transition-colors duration-200 hover:border-subtle-hover">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="text-xs text-dim mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRun && (
            <span className="text-xs text-dim tabular-nums">{lastRun}</span>
          )}
          <button
            onClick={runAgent}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                Running
              </span>
            ) : 'Run Now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 py-3 px-4 rounded-xl bg-danger/5 border border-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {children(data, loading)}
    </div>
  );
}
