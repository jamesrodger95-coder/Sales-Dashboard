'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import KPICard from '@/components/KPICard';
import CallList from '@/components/CallList';
import WeeklyChart from '@/components/WeeklyChart';
import ScheduleList from '@/components/ScheduleList';
import SyncStatus from '@/components/SyncStatus';
import { CallRecord, AnalyticsData } from '@/lib/types';

type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

interface DashboardData {
  kpis: { callsThisMonth: number; demosThisWeek: number; cancellations: number; upcomingDemos: number };
  calls: CallRecord[];
  todaySchedule: { time: string; event: string; type: string; phone?: string }[];
  tomorrowSchedule: { time: string; event: string; type: string; phone?: string }[];
  month: string;
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>('syncing');
  const syncedTimer = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSyncState('syncing');
    try {
      const [dashRes, analyticsRes] = await Promise.allSettled([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/analytics?range=3m').then(r => r.json()),
      ]);
      let ok = false;
      if (dashRes.status === 'fulfilled' && !dashRes.value.error) { setDashboard(dashRes.value); ok = true; }
      if (analyticsRes.status === 'fulfilled' && !analyticsRes.value.error) { setAnalytics(analyticsRes.value); ok = true; }
      setSyncState(ok ? 'synced' : 'error');
      if (syncedTimer.current) clearTimeout(syncedTimer.current);
      if (ok) syncedTimer.current = setTimeout(() => setSyncState('idle'), 2500);
    } catch { setSyncState('error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); return () => { if (syncedTimer.current) clearTimeout(syncedTimer.current); }; }, [loadData]);

  const kpis = dashboard?.kpis;
  const totalTime = analytics?.timeSlots ? analytics.timeSlots.morning + analytics.timeSlots.afternoon + analytics.timeSlots.late : 1;

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <KPICard title="Calls This Month" value={kpis?.callsThisMonth ?? '--'} loading={loading} href="/calls" />
        <KPICard title="Demos This Week" value={kpis?.demosThisWeek ?? '--'} status="success" loading={loading} href="/calls" />
        <KPICard title="Cancellations" value={kpis?.cancellations ?? '--'} status="danger" loading={loading} subtitle="Full no-show tracking with Zoho CRM" badge="CRM soon" href="/calls" />
        <KPICard title="Upcoming Demos" value={kpis?.upcomingDemos ?? '--'} status="warning" loading={loading} subtitle="Next 7 days" href="/calls" />
      </div>

      <SyncStatus status={syncState} onRefresh={loadData} />

      {/* Main content: 55/45 split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.82fr] gap-6 mb-6">
        {/* Call List */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <div className="flex items-center justify-between mb-1 pb-3 border-b border-[#1A1A1A]">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Monthly Call List</h2>
            <Link href="/calls" className="text-[11px] text-muted hover:text-white transition-colors">View all</Link>
          </div>
          <CallList calls={(dashboard?.calls || []).slice(0, 8)} loading={loading} />
          {!loading && (dashboard?.calls?.length ?? 0) > 8 && (
            <Link href="/calls" className="block mt-3 text-xs text-dim hover:text-muted transition-colors text-center">
              +{(dashboard?.calls?.length ?? 0) - 8} more
            </Link>
          )}
        </div>

        {/* Right column: chart + schedules */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
            <div className="flex items-center justify-between mb-1 pb-3 border-b border-[#1A1A1A]">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Call Volume by Week</h2>
              <Link href="/analytics" className="text-[11px] text-muted hover:text-white transition-colors">Full analytics</Link>
            </div>
            <div className="mt-4">
              <WeeklyChart data={analytics?.weeklyVolume || []} loading={loading} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
              <ScheduleList title="Today" items={dashboard?.todaySchedule || []} loading={loading} />
            </div>
            <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
              <ScheduleList title="Tomorrow" items={dashboard?.tomorrowSchedule || []} loading={loading} />
            </div>
          </div>
        </div>
      </div>

      {/* Analytics preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Busiest Days */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Busiest Days</h2>
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-6" style={{ animationDelay: `${i * 80}ms` }} />)}</div>
          ) : analytics?.dayBreakdown ? (() => {
            const max = Math.max(...Object.values(analytics.dayBreakdown), 1);
            const totalDays = Object.values(analytics.dayBreakdown).reduce((a, b) => a + b, 0) || 1;
            return (
              <div className="space-y-2.5">
                {Object.entries(analytics.dayBreakdown)
                  .filter(([day]) => !['Saturday', 'Sunday'].includes(day) || analytics.dayBreakdown[day] > 0)
                  .map(([day, count], i) => (
                    <div key={day} className="fade-in-row flex items-center gap-3" style={{ animationDelay: `${i * 50}ms` }}>
                      <span className="text-xs text-dim w-8">{day.substring(0, 3)}</span>
                      <div className="flex-1 h-6 bg-[#0A0A0A] rounded-md overflow-hidden">
                        <div
                          className={`h-full rounded-md transition-all duration-700 ${day === analytics.busiestDay ? 'bg-white' : 'bg-data-blue/60'}`}
                          style={{ width: `${Math.max((count / max) * 100, 3)}%` }}
                        />
                      </div>
                      <span className="text-xs text-white font-semibold tabular-nums w-6 text-right">{count}</span>
                      <span className="text-[10px] text-dim tabular-nums w-8 text-right">{Math.round((count / totalDays) * 100)}%</span>
                    </div>
                  ))}
              </div>
            );
          })() : <p className="text-dim text-xs">No data</p>}
        </div>

        {/* Peak Times */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Peak Times</h2>
          {loading ? (
            <div className="space-y-5">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
          ) : analytics?.timeSlots ? (
            <div className="space-y-4">
              {[
                { label: 'Morning', sub: '8am – 12pm', val: analytics.timeSlots.morning },
                { label: 'Afternoon', sub: '12pm – 4pm', val: analytics.timeSlots.afternoon },
                { label: 'Late', sub: '4pm – 6pm', val: analytics.timeSlots.late },
              ].map((t, i) => {
                const pct = totalTime > 0 ? Math.round((t.val / totalTime) * 100) : 0;
                const maxSlot = Math.max(analytics.timeSlots.morning, analytics.timeSlots.afternoon, analytics.timeSlots.late, 1);
                return (
                  <div key={t.label} className="fade-in-row" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <span className="text-sm text-white">{t.label}</span>
                        <span className="text-[11px] text-dim ml-2">{t.sub}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-light text-white tabular-nums">{t.val}</span>
                        <span className="text-[10px] text-dim tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#0A0A0A] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-data-blue/50 transition-all duration-700"
                        style={{ width: `${(t.val / maxSlot) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-dim mt-2">Based on {totalTime} total calls</p>
            </div>
          ) : <p className="text-dim text-xs">No data</p>}
        </div>

        {/* Monthly */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Monthly</h2>
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8" />)}</div>
          ) : analytics?.monthlyComparison ? (
            <div className="space-y-2">
              {analytics.monthlyComparison.slice(-3).reverse().map((m, i) => (
                <div key={i} className="fade-in-row flex items-center justify-between py-2.5 border-b border-[#1A1A1A]/50 last:border-0" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="text-sm text-muted">{m.month}</span>
                  <span className={`text-lg font-light tabular-nums ${i === 0 ? 'text-white' : 'text-dim'}`}>{m.calls}</span>
                </div>
              ))}
              <Link href="/analytics" className="block mt-3 text-[11px] text-dim hover:text-muted transition-colors">
                View full history
              </Link>
            </div>
          ) : <p className="text-dim text-xs">No data</p>}
        </div>
      </div>

      {/* CRM Intelligence */}
      <div className="mb-6">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">CRM Intelligence — Coming Soon</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: 'Pipeline Stages', desc: 'Registered to Shipped' },
            { title: 'Conversion Tracking', desc: 'Calls to orders' },
            { title: 'Revenue', desc: 'Order totals and trends' },
            { title: 'Follow-Up Intel', desc: 'Stage-based follow-ups' },
            { title: 'No-Show Tracking', desc: 'True no-shows vs cancellations' },
          ].map(card => (
            <div key={card.title} className="rounded-2xl border border-dashed border-[#333] bg-surface/40 p-5 opacity-40">
              <div className="flex items-center gap-2 mb-2">
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-dim">
                  <rect x="2" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <h3 className="text-[11px] font-medium text-muted">{card.title}</h3>
              </div>
              <p className="text-[10px] text-dim">{card.desc}</p>
              <p className="text-[9px] text-dim mt-2 pt-2 border-t border-[#222]">Connect Zoho CRM</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1A1A1A] pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
