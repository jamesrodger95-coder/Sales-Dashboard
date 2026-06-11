'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  activeCount: number;
  byColumn: { interested: number; quoted: number; deciding: number; closing: number };
  wonThisMonth: { count: number; value: number };
  lostThisMonth: { count: number };
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

export default function ClosingBoardSummary() {
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/board?include=summary')
      .then(r => r.json())
      .then(data => setS(data as Summary))
      .catch(() => setS(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-4 mb-4">
        <div className="h-3 w-32 bg-[#1A1A1A] rounded animate-pulse mb-2" />
        <div className="h-3 w-64 bg-[#1A1A1A]/60 rounded animate-pulse" />
      </div>
    );
  }
  if (!s) return null;

  const { activeCount, byColumn, wonThisMonth, lostThisMonth } = s;

  return (
    <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#555]">Closing Board</h2>
        <Link href="/board" className="text-[11px] text-muted hover:text-white transition-colors">View board →</Link>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xs">
        <span className="text-white">
          <span className="text-2xl font-bold tabular-nums">{activeCount}</span>
          <span className="text-dim ml-1.5">active</span>
        </span>
        <span className="text-dim hidden sm:inline">·</span>
        <span className="text-muted">
          <span className="text-[#60A5FA] tabular-nums">{byColumn.interested}</span> interested ·
          <span className="text-[#A78BFA] tabular-nums ml-1.5">{byColumn.quoted}</span> quoted ·
          <span className="text-[#F59E0B] tabular-nums ml-1.5">{byColumn.deciding}</span> deciding ·
          <span className="text-[#34D399] tabular-nums ml-1.5">{byColumn.closing}</span> closing
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[11px] text-dim">
        <span>Won this month:
          <span className="text-emerald-400 font-semibold tabular-nums ml-1">{wonThisMonth.count}</span>
          {wonThisMonth.value > 0 && (
            <span className="text-emerald-400/70 tabular-nums"> ({formatGBP(wonThisMonth.value)})</span>
          )}
        </span>
        {lostThisMonth.count > 0 && (
          <>
            <span className="text-[#333]">·</span>
            <span>Lost: <span className="text-red-400 tabular-nums">{lostThisMonth.count}</span></span>
          </>
        )}
      </div>
    </div>
  );
}
