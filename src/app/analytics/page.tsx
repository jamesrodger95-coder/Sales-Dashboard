'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import DateRangePicker from '@/components/DateRangePicker';
import { AnalyticsData } from '@/lib/types';

const TT = {
  cursor: { fill: 'rgba(255,255,255,0.03)' },
  contentStyle: { background: '#111', border: '1px solid #222', borderRadius: '12px', color: '#fff', fontSize: '12px', padding: '8px 14px' },
  labelStyle: { color: '#888', marginBottom: '4px' },
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('3m');

  const loadData = useCallback(async (r: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${r}`);
      const d = await res.json();
      if (!d.error) setData(d);
    } catch { /* handled by empty data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(range); }, [range, loadData]);

  const handleRangeChange = (r: string) => { setRange(r); };

  const dayData = data?.dayBreakdown
    ? Object.entries(data.dayBreakdown)
        .filter(([day]) => !['Saturday', 'Sunday'].includes(day) || (data.dayBreakdown[day] ?? 0) > 0)
        .map(([day, count]) => ({ day: day.substring(0, 3), full: day, calls: count }))
    : [];
  const maxDay = Math.max(...dayData.map(d => d.calls), 1);

  const timeData = data?.timeSlots
    ? [
        { slot: 'Morning', label: '8am – 12pm', calls: data.timeSlots.morning },
        { slot: 'Afternoon', label: '12pm – 4pm', calls: data.timeSlots.afternoon },
        { slot: 'Late', label: '4pm – 6pm', calls: data.timeSlots.late },
      ]
    : [];
  const totalCalls = data?.totalCalls || (data?.timeSlots ? data.timeSlots.morning + data.timeSlots.afternoon + data.timeSlots.late : 0);

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Date range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <DateRangePicker
          value={range}
          onChange={handleRangeChange}
          options={[
            { label: 'This Month', value: '1m' },
            { label: '30 Days', value: '30d' },
            { label: '3 Months', value: '3m' },
            { label: '6 Months', value: '6m' },
            { label: '1 Year', value: '1y' },
          ]}
        />
        {data && (
          <div className="flex flex-wrap gap-3">
            <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
              <span className="text-dim">Total calls</span> <span className="text-white font-semibold tabular-nums">{totalCalls}</span>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
              <span className="text-dim">Busiest</span> <span className="text-white font-semibold">{data.busiestDay}</span>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-surface border border-[#1A1A1A] text-xs">
              <span className="text-dim">Peak</span> <span className="text-white font-semibold">{data.busiestTime}</span>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Weekly volume */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Call Volume by Week</h2>
          {loading ? (
            <div className="h-56 flex items-end gap-2 px-2">
              {[...Array(8)].map((_, i) => <div key={i} className="flex-1 skeleton" style={{ height: `${30 + Math.random() * 60}%` }} />)}
            </div>
          ) : data?.weeklyVolume ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.weeklyVolume} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                <Tooltip {...TT} />
                <Bar dataKey="calls" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={600}>
                  {data.weeklyVolume.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? '#ffffff' : '#60A5FA'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-dim text-sm py-8 text-center">No data</p>}
        </div>

        {/* Day of week */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Calls by Day of Week</h2>
          {loading ? (
            <div className="space-y-3 py-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-8" />)}</div>
          ) : (
            <div className="space-y-3 py-1">
              {dayData.map(d => {
                const pct = totalCalls > 0 ? Math.round((d.calls / totalCalls) * 100) : 0;
                return (
                  <div key={d.day} className="fade-in-row flex items-center gap-3">
                    <span className="text-xs text-muted w-8 text-right">{d.day}</span>
                    <div className="flex-1 h-8 bg-[#0A0A0A] rounded-lg overflow-hidden">
                      <div
                        className={`h-full rounded-lg transition-all duration-500 ${d.full === data?.busiestDay ? 'bg-white' : 'bg-data-blue/70'}`}
                        style={{ width: `${Math.max((d.calls / maxDay) * 100, 2)}%` }}
                      />
                    </div>
                    <span className="text-sm text-white font-semibold tabular-nums w-6 text-right">{d.calls}</span>
                    <span className="text-[10px] text-dim tabular-nums w-7 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Time of day */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Calls by Time of Day</h2>
          {loading ? (
            <div className="h-48 skeleton" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={timeData} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
                  <XAxis dataKey="slot" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="calls" fill="#60A5FA" radius={[4, 4, 0, 0]} maxBarSize={60} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-6 mt-3 text-xs text-dim">
                {timeData.map(t => {
                  const pct = totalCalls > 0 ? Math.round((t.calls / totalCalls) * 100) : 0;
                  return <span key={t.slot}>{t.label}: <span className="text-muted tabular-nums">{t.calls}</span> <span className="text-dim">({pct}%)</span></span>;
                })}
              </div>
            </>
          )}
        </div>

        {/* Monthly comparison */}
        <div className="rounded-2xl border border-[#1A1A1A] bg-surface p-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] pb-3 border-b border-[#1A1A1A] mb-4">Monthly Comparison</h2>
          {loading ? (
            <div className="h-48 skeleton" />
          ) : data?.monthlyComparison ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.monthlyComparison} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} tickFormatter={(v: string) => v.split(' ')[0]} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="calls" radius={[4, 4, 0, 0]} maxBarSize={52} animationDuration={600}>
                    {data.monthlyComparison.map((m, i) => (
                      <Cell key={i} fill={m.isCurrent ? '#ffffff' : '#60A5FA'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 text-xs">
                {data.monthlyComparison.map((m, i) => (
                  <span key={i} className="text-dim">{m.month}: <span className="text-white font-semibold tabular-nums">{m.calls}</span></span>
                ))}
              </div>
            </>
          ) : <p className="text-dim text-sm py-8 text-center">No data</p>}
        </div>
      </div>

      <footer className="border-t border-[#1A1A1A] pt-4 pb-8 flex items-center justify-between">
        <span className="text-[11px] text-[#333]">Bryant Dental Sales Intelligence</span>
        <span className="text-[11px] text-[#333]">Powered by Claude AI</span>
      </footer>
    </div>
  );
}
