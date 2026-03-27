'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface BriefingSummary {
  generated: boolean;
  generatedAt?: string;
  summary?: string;
  attentionItems?: { severity: string; name: string; action: string }[];
  insights?: { type: string; text: string }[];
  error?: string;
  fallback?: boolean;
}

const PROGRESS_MSGS = ['Fetching calendar data...', 'Loading pipeline data...', 'Analysing patterns...', 'Building briefing...'];

export default function BriefingCard() {
  const [data, setData] = useState<BriefingSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/agents/analyst').then(r => r.json()).then(d => setData(d)).catch(() => {});
  }, []);

  const generate = async () => {
    setGenerating(true);
    setProgressIdx(0);
    // Progress messages on timers
    progressRef.current = setInterval(() => {
      setProgressIdx(prev => Math.min(prev + 1, PROGRESS_MSGS.length - 1));
    }, 4000);

    try {
      const res = await fetch('/api/agents/analyst', { method: 'POST' });
      const d = await res.json();
      setData(d);
    } catch {
      setData({ generated: false, error: 'Generation failed — try again' });
    } finally {
      setGenerating(false);
      if (progressRef.current) clearInterval(progressRef.current);
    }
  };

  const generatedTime = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  // Error state
  if (data?.error && !generating) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-surface p-4 mb-6 flex items-center justify-between">
        <p className="text-xs text-danger">{data.error}</p>
        <button onClick={generate} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white text-black hover:bg-white/90 transition-all">Retry</button>
      </div>
    );
  }

  // Generating state with progress
  if (generating) {
    return (
      <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm text-muted">{PROGRESS_MSGS[progressIdx]}</p>
            <p className="text-[11px] text-dim mt-0.5">This takes 15-30 seconds</p>
          </div>
        </div>
      </div>
    );
  }

  // No report yet
  if (!data?.generated) {
    return (
      <div className="rounded-2xl border border-dashed border-[#222] bg-surface p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-[#444]" viewBox="0 0 24 24" fill="none">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm text-muted">AI Daily Briefing</p>
            <p className="text-[11px] text-dim">Click to generate your daily intelligence report</p>
          </div>
        </div>
        <button onClick={generate} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white text-black hover:bg-white/90 transition-all">Generate</button>
      </div>
    );
  }

  // Report exists
  return (
    <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">AI Briefing</h2>
          {generatedTime && <span className="text-[10px] text-dim">{generatedTime}</span>}
          {data.fallback && <span className="text-[10px] text-warning">raw data</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generate} className="text-[11px] text-dim hover:text-muted transition-colors">Refresh</button>
          <Link href="/briefing" className="text-[11px] text-muted hover:text-white transition-colors">Full report</Link>
        </div>
      </div>

      {data.summary && <p className="text-sm text-muted leading-relaxed mb-3">{data.summary}</p>}

      {data.attentionItems && data.attentionItems.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {data.attentionItems.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.severity === 'red' ? 'bg-danger' : 'bg-warning'}`} />
              <span className="text-white">{item.name}</span>
              <span className="text-dim truncate">— {item.action}</span>
            </div>
          ))}
          {data.attentionItems.length > 3 && (
            <Link href="/briefing" className="text-[11px] text-dim hover:text-muted transition-colors">
              +{data.attentionItems.length - 3} more
            </Link>
          )}
        </div>
      )}

      {data.insights && data.insights.length > 0 && (
        <p className="text-xs text-dim italic border-t border-[#1A1A1A] pt-2">{data.insights[0].text}</p>
      )}
    </div>
  );
}
