'use client';

import Link from 'next/link';
import AgentCard from '@/components/AgentCard';
import { BriefingResult, FollowUpResult, WeeklyResult } from '@/lib/types';

export default function ReportsPage() {
  return (
    <div className="px-5 py-6 max-w-[1000px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white">AI Agents</h1>
          <p className="text-sm text-muted mt-1">AI-powered analysis of your sales pipeline</p>
        </div>
        <Link
          href="/prep"
          className="px-4 py-2 rounded-xl text-xs font-medium border border-subtle text-muted hover:text-white hover:border-subtle-hover transition-all"
        >
          Demo Prep
        </Link>
      </div>

      <div className="space-y-5">
        {/* Morning Briefing */}
        <AgentCard
          title="Morning Briefing"
          description="Synthesises all data into a prioritised daily briefing"
          endpoint="/api/agents/briefing"
        >
          {(data, loading) => {
            if (loading) return <div className="h-32 bg-subtle/30 rounded-xl animate-pulse" />;
            if (!data) return <p className="text-sm text-dim">Click Run Now to generate briefing</p>;
            const d = data as unknown as BriefingResult;
            return (
              <div className="space-y-5">
                <p className="text-sm text-white/80 leading-relaxed">{d.greeting}</p>
                {d.red?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-danger" />
                      <h4 className="text-xs font-semibold uppercase tracking-heading text-danger">Action Today</h4>
                    </div>
                    <div className="space-y-2">
                      {d.red.map((item, i) => (
                        <div key={i} className="flex items-start justify-between py-3 border-b border-subtle/60 last:border-0">
                          <p className="text-sm text-white">{item.action}</p>
                          {item.phone && <span className="text-xs text-muted tabular-nums ml-4 whitespace-nowrap">{item.phone}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {d.yellow?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-warning" />
                      <h4 className="text-xs font-semibold uppercase tracking-heading text-warning">Watch This Week</h4>
                    </div>
                    <div className="space-y-2">
                      {d.yellow.map((item, i) => (
                        <div key={i} className="py-3 border-b border-subtle/60 last:border-0">
                          <p className="text-sm text-white/80">{item.item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {d.green?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      <h4 className="text-xs font-semibold uppercase tracking-heading text-success">On Track</h4>
                    </div>
                    <div className="space-y-2">
                      {d.green.map((item, i) => (
                        <div key={i} className="py-3 border-b border-subtle/60 last:border-0">
                          <p className="text-sm text-muted">{item.item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }}
        </AgentCard>

        {/* Follow-Up Chase List */}
        <AgentCard
          title="Follow-Up Chase List"
          description="Identifies demos from the past 7 days without a subsequent event with the same attendee"
          endpoint="/api/agents/follow-up"
        >
          {(data, loading) => {
            if (loading) return <div className="h-32 bg-subtle/30 rounded-xl animate-pulse" />;
            if (!data) return (
              <div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-hover border border-subtle mb-4">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-dim flex-shrink-0">
                    <rect x="2" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <p className="text-xs text-dim">Enhanced follow-up tracking available when Zoho CRM is connected</p>
                </div>
                <p className="text-sm text-dim">Click Run Now to generate chase list from calendar data</p>
              </div>
            );
            const d = data as unknown as FollowUpResult;
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-hover border border-subtle">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-dim flex-shrink-0">
                    <rect x="2" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <p className="text-xs text-dim">Enhanced follow-up tracking available when Zoho CRM is connected</p>
                </div>
                <p className="text-sm text-white/80 font-medium">{d.summary}</p>
                {d.redFlags?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-danger" />
                      <h4 className="text-xs font-semibold uppercase tracking-heading text-dim">Urgent</h4>
                    </div>
                    {d.redFlags.map((item, i) => (
                      <div key={i} className="flex items-start justify-between py-3 border-b border-subtle/60 last:border-0">
                        <div>
                          <p className="text-sm text-white font-medium">{item.name}</p>
                          <p className="text-xs text-muted mt-0.5">{item.reason}</p>
                        </div>
                        {item.phone && <span className="text-xs text-muted tabular-nums ml-4">{item.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {d.yellowFlags?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-warning" />
                      <h4 className="text-xs font-semibold uppercase tracking-heading text-dim">Watch</h4>
                    </div>
                    {d.yellowFlags.map((item, i) => (
                      <div key={i} className="flex items-start justify-between py-3 border-b border-subtle/60 last:border-0">
                        <div>
                          <p className="text-sm text-white font-medium">{item.name}</p>
                          <p className="text-xs text-muted mt-0.5">{item.reason}</p>
                        </div>
                        {item.phone && <span className="text-xs text-muted tabular-nums ml-4">{item.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {d.greenItems?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      <h4 className="text-xs font-semibold uppercase tracking-heading text-dim">On Track</h4>
                    </div>
                    {d.greenItems.map((item, i) => (
                      <div key={i} className="py-3 border-b border-subtle/60 last:border-0">
                        <p className="text-sm text-muted">{item.name} — {item.status}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </AgentCard>

        {/* Weekly Analysis */}
        <AgentCard
          title="Weekly Analysis"
          description="Booking trends, day/time patterns, and insights"
          endpoint="/api/agents/weekly"
        >
          {(data, loading) => {
            if (loading) return <div className="h-32 bg-subtle/30 rounded-xl animate-pulse" />;
            if (!data) return <p className="text-sm text-dim">Click Run Now to generate analysis</p>;
            const d = data as unknown as WeeklyResult;
            return (
              <div className="space-y-6">
                {d.weeklyVolume?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-heading text-dim mb-3">Weekly Volume</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {d.weeklyVolume.map((w, i) => (
                        <div key={i} className="text-center py-3">
                          <p className="text-2xl font-bold text-white tabular-nums">{w.calls}</p>
                          <p className="text-xs text-dim mt-1">{w.week}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {d.dayBreakdown && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-heading text-dim mb-3">By Day</h4>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {Object.entries(d.dayBreakdown)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([day, count]) => (
                          <span key={day} className="text-sm">
                            <span className="text-muted">{day}</span>{' '}
                            <span className="text-white font-semibold tabular-nums">{count as number}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                )}
                {d.timeSlots && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-heading text-dim mb-3">By Time</h4>
                    <div className="flex gap-6 text-sm">
                      <span className="text-muted">Morning <span className="text-white font-semibold tabular-nums">{d.timeSlots.morning}</span></span>
                      <span className="text-muted">Afternoon <span className="text-white font-semibold tabular-nums">{d.timeSlots.afternoon}</span></span>
                      <span className="text-muted">Late <span className="text-white font-semibold tabular-nums">{d.timeSlots.late}</span></span>
                    </div>
                  </div>
                )}
                <div className="flex gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-danger" />
                    <span className="text-muted">Cancellations <span className="text-white font-semibold tabular-nums">{d.cancellations}</span></span>
                  </div>
                </div>
                {d.insight && (
                  <p className="text-sm text-muted leading-relaxed border-t border-subtle pt-4">{d.insight}</p>
                )}
              </div>
            );
          }}
        </AgentCard>
      </div>
    </div>
  );
}
