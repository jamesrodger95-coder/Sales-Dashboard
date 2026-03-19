'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import KPICard from '@/components/KPICard';
import CallList from '@/components/CallList';
import WeeklyChart from '@/components/WeeklyChart';
import ScheduleList from '@/components/ScheduleList';
import { BriefingResult, CallTrackerResult, AnalyticsData } from '@/lib/types';

export default function Dashboard() {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [callTracker, setCallTracker] = useState<CallTrackerResult | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<string>('Syncing...');

  const loadData = useCallback(async () => {
    setLoading(true);
    setAgentStatus('Syncing...');

    try {
      const [briefingRes, callRes, analyticsRes] = await Promise.allSettled([
        fetch('/api/agents/briefing').then(r => r.json()),
        fetch('/api/agents/call-tracker').then(r => r.json()),
        fetch('/api/analytics').then(r => r.json()),
      ]);

      if (briefingRes.status === 'fulfilled' && !briefingRes.value.error) {
        setBriefing(briefingRes.value);
      }
      if (callRes.status === 'fulfilled' && !callRes.value.error) {
        setCallTracker(callRes.value);
      }
      if (analyticsRes.status === 'fulfilled' && !analyticsRes.value.error) {
        setAnalytics(analyticsRes.value);
      }

      setAgentStatus('Updated just now');
    } catch {
      setAgentStatus('Sync failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const kpis = briefing?.kpis;

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">

      {/* Greeting */}
      {briefing?.greeting && (
        <p className="text-sm text-muted mb-6 max-w-xl">{briefing.greeting}</p>
      )}

      {/* KPI Cards — clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <KPICard
          title="Calls This Month"
          value={kpis?.callsThisMonth ?? '--'}
          loading={loading}
          href="/calls"
        />
        <KPICard
          title="Demos This Week"
          value={kpis?.demosThisWeek ?? '--'}
          status="success"
          loading={loading}
          href="/calls"
        />
        <KPICard
          title="Cancellations"
          value={kpis?.cancellations ?? '--'}
          status="danger"
          loading={loading}
          subtitle="Zoho CRM coming soon for full no-show tracking"
          badge="CRM soon"
          href="/calls"
        />
        <KPICard
          title="Upcoming Demos"
          value={kpis?.upcomingDemos ?? '--'}
          status="warning"
          loading={loading}
          subtitle="Next 7 days"
          href="/calls"
        />
      </div>

      {/* Sync status */}
      <div className="flex items-center justify-end gap-3 mb-8">
        <span className="text-xs text-dim">{agentStatus}</span>
        <button
          onClick={loadData}
          disabled={loading}
          className="text-xs text-muted hover:text-white transition-colors disabled:opacity-40"
        >
          {loading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {/* Priority Items */}
      {briefing && (briefing.red.length > 0 || briefing.yellow.length > 0) && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Priority Actions</h2>
          <div className="space-y-2">
            {briefing.red.map((item, i) => (
              <div key={`r${i}`} className="flex items-start gap-3 p-4 rounded-card border border-subtle bg-surface">
                <span className="w-2 h-2 rounded-full bg-danger mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{item.action}</p>
                  {item.phone && <p className="text-xs text-muted tabular-nums mt-1">{item.phone}</p>}
                </div>
              </div>
            ))}
            {briefing.yellow.map((item, i) => (
              <div key={`y${i}`} className="flex items-start gap-3 p-4 rounded-card border border-subtle bg-surface">
                <span className="w-2 h-2 rounded-full bg-warning mt-1.5 flex-shrink-0" />
                <p className="text-sm text-white">{item.item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call list + Weekly chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <div className="rounded-card border border-subtle bg-surface p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-heading text-dim">Monthly Call List</h2>
            <Link href="/calls" className="text-xs text-muted hover:text-white transition-colors">
              View all
            </Link>
          </div>
          <CallList calls={(callTracker?.calls || []).slice(0, 8)} loading={loading} />
          {(callTracker?.calls?.length ?? 0) > 8 && (
            <Link href="/calls" className="block mt-4 text-xs text-muted hover:text-white transition-colors text-center">
              + {(callTracker?.calls?.length ?? 0) - 8} more calls
            </Link>
          )}
        </div>

        <div className="rounded-card border border-subtle bg-surface p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-heading text-dim">Call Volume by Week</h2>
            <Link href="/analytics" className="text-xs text-muted hover:text-white transition-colors">
              Full analytics
            </Link>
          </div>
          <WeeklyChart data={analytics?.weeklyVolume || []} loading={loading} />
        </div>
      </div>

      {/* Analytics preview — day & time breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Day breakdown */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Busiest Days</h2>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-6 bg-subtle/40 rounded animate-pulse" />)}
            </div>
          ) : analytics?.dayBreakdown ? (
            <div className="space-y-2">
              {Object.entries(analytics.dayBreakdown)
                .filter(([day]) => !['Saturday', 'Sunday'].includes(day) || (analytics.dayBreakdown[day] ?? 0) > 0)
                .map(([day, count]) => {
                  const max = Math.max(...Object.values(analytics.dayBreakdown), 1);
                  return (
                    <div key={day} className="flex items-center gap-2">
                      <span className="text-xs text-dim w-7">{day.substring(0, 3)}</span>
                      <div className="flex-1 h-5 bg-subtle/50 rounded overflow-hidden">
                        <div
                          className={`h-full rounded ${day === analytics.busiestDay ? 'bg-white' : 'bg-data-blue/60'}`}
                          style={{ width: `${Math.max((count / max) * 100, 3)}%` }}
                        />
                      </div>
                      <span className="text-xs text-white font-semibold tabular-nums w-4 text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          ) : <p className="text-dim text-xs">No data</p>}
        </div>

        {/* Time slots */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Peak Times</h2>
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-subtle/40 rounded animate-pulse" />)}
            </div>
          ) : analytics?.timeSlots ? (
            <div className="space-y-4">
              {[
                { label: 'Morning', sub: '8am - 12pm', val: analytics.timeSlots.morning },
                { label: 'Afternoon', sub: '12pm - 4pm', val: analytics.timeSlots.afternoon },
                { label: 'Late', sub: '4pm - 6pm', val: analytics.timeSlots.late },
              ].map(t => (
                <div key={t.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{t.label}</p>
                    <p className="text-[11px] text-dim">{t.sub}</p>
                  </div>
                  <span className="text-xl font-bold text-white tabular-nums">{t.val}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-dim text-xs">No data</p>}
        </div>

        {/* Monthly comparison */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">Monthly</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-subtle/40 rounded animate-pulse" />)}
            </div>
          ) : analytics?.monthlyComparison ? (
            <div className="space-y-3">
              {analytics.monthlyComparison.slice(-3).reverse().map((m, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-subtle/60 last:border-0">
                  <span className="text-sm text-muted">{m.month}</span>
                  <span className={`text-lg font-bold tabular-nums ${i === 0 ? 'text-white' : 'text-muted'}`}>{m.calls}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-dim text-xs">No data</p>}
          <Link href="/analytics" className="block mt-4 text-xs text-muted hover:text-white transition-colors">
            View 6-month history
          </Link>
        </div>
      </div>

      {/* Schedules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <div className="rounded-card border border-subtle bg-surface p-6">
          <ScheduleList title="Today" items={briefing?.todaySchedule || []} loading={loading} />
        </div>
        <div className="rounded-card border border-subtle bg-surface p-6">
          <ScheduleList title="Tomorrow" items={briefing?.tomorrowSchedule || []} loading={loading} />
        </div>
      </div>

      {/* CRM Intelligence — Coming Soon */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">CRM Intelligence — Coming Soon</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Pipeline Stages', desc: 'Registered, First Contact, Demo Booked, Trial, Won' },
            { title: 'Lead Conversion', desc: 'Demo to trial rate, trial to purchase rate' },
            { title: 'Post-Purchase', desc: 'Repeat orders, referrals, accessory upsells' },
            { title: 'No-Show Tracking', desc: 'True no-shows vs cancellations vs reschedules' },
          ].map(card => (
            <div
              key={card.title}
              className="rounded-card border border-dashed border-subtle bg-surface/50 p-5 opacity-50"
            >
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-dim">
                  <rect x="2" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <h3 className="text-xs font-semibold text-muted">{card.title}</h3>
              </div>
              <p className="text-[11px] text-dim leading-relaxed">{card.desc}</p>
              <p className="text-[10px] text-dim mt-3 border-t border-subtle/60 pt-2">Connect Zoho CRM</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
