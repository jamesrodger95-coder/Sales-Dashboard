'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import KPICard from '@/components/KPICard';
import CallList from '@/components/CallList';
import WeeklyChart from '@/components/WeeklyChart';
import ScheduleList from '@/components/ScheduleList';
import SyncStatus from '@/components/SyncStatus';
import BriefingCard from '@/components/BriefingCard';
import DrillDown from '@/components/DrillDown';
import CallDebriefCard from '@/components/CallDebriefCard';
import FollowUpList from '@/components/FollowUpList';
import { CallRecord, ScheduleItem, AnalyticsData } from '@/lib/types';

type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

function getWeekLabel(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(start)} - ${fmt(end)}`;
}

interface ZohoSummary {
  connected: boolean;
  totalLeads: number;
  totalDeals: number;
  totalValue: number;
  activeLeads: number;
  conversionRate: number;
  convRateDetail?: string;
  followUpsNeeded: number;
  leadSummary: Record<string, number>;
  dealSummary: Record<string, number>;
  ordersThisMonth: number;
}

interface DashboardData {
  kpis: { callsThisMonth: number; demosThisWeek: number; cancellations: number; upcomingDemos: number };
  calls: CallRecord[];
  todaySchedule: ScheduleItem[];
  tomorrowSchedule: ScheduleItem[];
  month: string;
  zoho?: ZohoSummary | null;
  errors?: { calendar?: string; zoho?: string };
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [followUpRefresh, setFollowUpRefresh] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>('syncing');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const syncedTimer = useRef<NodeJS.Timeout | null>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSyncState('syncing');
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      // Top-level error means BOTH sides failed — the API only returns this if it can't respond at all
      if (data.error && !data.kpis) throw new Error(data.error);
      setDashboard(data);
      if (data.analytics) setAnalytics(data.analytics);
      // Partial failure (one source down): show synced but the banner below will explain
      setSyncState('synced');
      setLastSynced(new Date());
      if (syncedTimer.current) clearTimeout(syncedTimer.current);
      syncedTimer.current = setTimeout(() => setSyncState('idle'), 2500);
    } catch (err) {
      console.error('[Dashboard] load failed:', err);
      setSyncState('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 5 minutes
    autoRefreshRef.current = setInterval(() => { loadData(); }, 5 * 60 * 1000);
    return () => {
      if (syncedTimer.current) clearTimeout(syncedTimer.current);
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [loadData]);

  const kpis = dashboard?.kpis;
  const totalTime = analytics?.timeSlots ? analytics.timeSlots.morning + analytics.timeSlots.afternoon + analytics.timeSlots.late : 1;

  // Drill-down state
  const [drillTitle, setDrillTitle] = useState('');
  const [drillSub, setDrillSub] = useState('');
  const [drillRows, setDrillRows] = useState<{ name: string; phone?: string | null; email?: string; date?: string; country?: string | null }[]>([]);
  const [drillOpen, setDrillOpen] = useState(false);

  // All 3-month calls for chart drill-down filtering
  const allCalls = (dashboard as DashboardData & { allCalls3m?: { name: string; phone: string | null; email: string; date: string; country: string | null }[] })?.allCalls3m || dashboard?.calls || [];

  const openDrill = (title: string, subtitle: string, rows: typeof drillRows) => {
    setDrillTitle(title);
    setDrillSub(subtitle);
    setDrillRows(rows);
    setDrillOpen(true);
  };

  const handleWeekClick = (weekLabel: string) => {
    // Parse week label like "3 Mar - 7 Mar" to filter calls
    const parts = weekLabel.split(' - ');
    if (parts.length !== 2) return;
    const filtered = allCalls.filter(c => {
      const d = new Date(c.date);
      return getWeekLabel(d) === weekLabel;
    });
    openDrill(`Week of ${weekLabel}`, `${filtered.length} calls`, filtered.map(c => ({
      name: c.name, phone: c.phone, email: c.email, date: c.date, country: c.country,
    })));
  };

  const handleDayClick = (day: string) => {
    const filtered = allCalls.filter(c => {
      const d = new Date(c.date);
      return d.toLocaleDateString('en-GB', { weekday: 'long' }) === day ||
             d.toLocaleDateString('en-GB', { weekday: 'long' }).startsWith(day.substring(0, 3));
    });
    openDrill(day, `${filtered.length} calls on ${day}s`, filtered.map(c => ({
      name: c.name, phone: c.phone, email: c.email, date: c.date, country: c.country,
    })));
  };

  const handleTimeClick = (slot: string) => {
    const ranges: Record<string, [number, number]> = { Morning: [0, 12], Afternoon: [12, 16], Late: [16, 24] };
    const [min, max] = ranges[slot] || [0, 24];
    const filtered = allCalls.filter(c => { const h = new Date(c.date).getHours(); return h >= min && h < max; });
    openDrill(`${slot} calls`, `${filtered.length} calls`, filtered.map(c => ({
      name: c.name, phone: c.phone, email: c.email, date: c.date, country: c.country,
    })));
  };

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">

      {/* KPIs — Calendar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KPICard title="Calls This Month" value={kpis?.callsThisMonth ?? '--'} loading={loading} href="/calls" />
        <KPICard title="Demos This Week" value={kpis?.demosThisWeek ?? '--'} status="success" loading={loading} href="/calls" />
        <KPICard title="Cancellations" value={kpis?.cancellations ?? '--'} status="danger" loading={loading} href="/calls" />
        <KPICard title="Upcoming Demos" value={kpis?.upcomingDemos ?? '--'} status="warning" loading={loading} subtitle="Next 7 days" href="/calls" />
      </div>

      {/* KPIs — CRM (Zoho) */}
      {dashboard?.zoho?.connected && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
          <KPICard title="Orders This Month" value={dashboard.zoho.ordersThisMonth ?? '--'} status="success" loading={loading} href="/reports" />
          <KPICard title="Conversion Rate" value={`${dashboard.zoho.conversionRate || 0}%`} loading={loading} href="/conversions" subtitle={dashboard.zoho.convRateDetail || 'This month'} />
          <KPICard title="Active Pipeline" value={`$${(dashboard.zoho.totalValue || 0).toLocaleString()}`} loading={loading} href="/pipeline" subtitle="Orders in production" />
          <KPICard title="Follow-Ups" value={dashboard.zoho.followUpsNeeded ?? '--'} status="danger" loading={loading} href="/pipeline" subtitle="Last 14 days" />
        </div>
      )}

      <SyncStatus status={syncState} onRefresh={loadData} lastSynced={lastSynced} />

      {/* Per-service error banner — shown when one source fails but the other works */}
      {dashboard?.errors && (dashboard.errors.calendar || dashboard.errors.zoho) && (
        <div className="mb-4 space-y-2">
          {dashboard.errors.calendar && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
              <span className="font-semibold shrink-0">Calendar sync failed:</span>
              <span className="text-red-300/90 break-all">{dashboard.errors.calendar}</span>
            </div>
          )}
          {dashboard.errors.zoho && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
              <span className="font-semibold shrink-0">Zoho sync failed:</span>
              <span className="text-red-300/90 break-all">{dashboard.errors.zoho}</span>
            </div>
          )}
        </div>
      )}

      {/* AI Briefing card */}
      <BriefingCard />

      {/* Debrief + follow-ups */}
      <div id="follow-ups" className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 scroll-mt-20">
        <CallDebriefCard onSaved={() => setFollowUpRefresh(n => n + 1)} />
        <FollowUpList refreshSignal={followUpRefresh} />
      </div>

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
              <WeeklyChart data={analytics?.weeklyVolume || []} loading={loading} onBarClick={handleWeekClick} />
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
                    <button key={day} onClick={() => handleDayClick(day)} className="fade-in-row flex items-center gap-3 w-full text-left hover:bg-white/[0.02] rounded-lg px-1 -mx-1 cursor-pointer transition-colors" style={{ animationDelay: `${i * 50}ms` }}>
                      <span className="text-xs text-dim w-8">{day.substring(0, 3)}</span>
                      <div className="flex-1 h-6 bg-[#0A0A0A] rounded-md overflow-hidden">
                        <div
                          className={`h-full rounded-md transition-all duration-700 ${day === analytics.busiestDay ? 'bg-white' : 'bg-data-blue/60'}`}
                          style={{ width: `${Math.max((count / max) * 100, 3)}%` }}
                        />
                      </div>
                      <span className="text-xs text-white font-semibold tabular-nums w-6 text-right">{count}</span>
                      <span className="text-[10px] text-dim tabular-nums w-8 text-right">{Math.round((count / totalDays) * 100)}%</span>
                    </button>
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
                  <button key={t.label} onClick={() => handleTimeClick(t.label)} className="fade-in-row w-full text-left hover:bg-white/[0.02] rounded-xl p-1 -m-1 cursor-pointer transition-colors" style={{ animationDelay: `${i * 80}ms` }}>
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
                  </button>
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

      {/* CRM Pipeline Summary — current snapshot, not filtered by month */}
      {dashboard?.zoho?.connected ? (
        <div className="mb-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">
            Current Pipeline <span className="text-dim normal-case tracking-normal ml-1">· live snapshot</span>
            <Link href="/pipeline" className="text-muted hover:text-white transition-colors ml-3 normal-case tracking-normal">View full pipeline</Link>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Demo Done', key: 'demo_done', src: 'lead', color: 'bg-[#A78BFA]' },
              { label: 'No Show', key: 'no_show', src: 'lead', color: 'bg-danger' },
              { label: 'Awaiting', key: 'awaiting', src: 'deal', color: 'bg-data-blue' },
              { label: 'Production', key: 'in_progress', src: 'deal', color: 'bg-warning' },
              { label: 'Shipped', key: 'shipped', src: 'deal', color: 'bg-success' },
              { label: 'Issues', key: 'problem', src: 'deal', color: 'bg-danger' },
            ].map(s => (
              <Link key={s.key} href="/pipeline" className="rounded-2xl border border-[#1A1A1A] bg-surface p-4 hover:bg-surface-hover transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  <span className="text-[11px] text-dim">{s.label}</span>
                </div>
                <p className="text-2xl font-light text-white tabular-nums">
                  {(s.src === 'lead' ? dashboard.zoho?.leadSummary?.[s.key] : dashboard.zoho?.dealSummary?.[s.key]) || 0}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">CRM Intelligence</h2>
          <div className="rounded-2xl border border-dashed border-[#333] bg-surface/40 p-6 text-center opacity-60">
            <p className="text-sm text-muted">Zoho CRM connecting...</p>
            <p className="text-xs text-dim mt-1">Pipeline, conversions, and follow-ups will appear here</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1A1A1A] pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>

      {/* Drill-down panel */}
      <DrillDown open={drillOpen} onClose={() => setDrillOpen(false)} title={drillTitle} subtitle={drillSub} rows={drillRows} />
    </div>
  );
}
