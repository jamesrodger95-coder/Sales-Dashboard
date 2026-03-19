'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnalyticsData } from '@/lib/types';

const CHART_TOOLTIP = {
  cursor: { fill: 'rgba(255,255,255,0.03)' },
  contentStyle: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { color: '#888888', marginBottom: '4px' },
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dayData = data?.dayBreakdown
    ? Object.entries(data.dayBreakdown)
        .filter(([day]) => !['Saturday', 'Sunday'].includes(day) || (data.dayBreakdown[day] ?? 0) > 0)
        .map(([day, count]) => ({ day: day.substring(0, 3), full: day, calls: count }))
    : [];

  const timeData = data?.timeSlots
    ? [
        { slot: 'Morning', label: '8am - 12pm', calls: data.timeSlots.morning },
        { slot: 'Afternoon', label: '12pm - 4pm', calls: data.timeSlots.afternoon },
        { slot: 'Late', label: '4pm - 6pm', calls: data.timeSlots.late },
      ]
    : [];

  const maxDayCount = Math.max(...dayData.map(d => d.calls), 1);

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Badges */}
      {data && (
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-subtle text-xs">
            <span className="text-dim">Busiest day</span>{' '}
            <span className="text-white font-semibold">{data.busiestDay}</span>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-subtle text-xs">
            <span className="text-dim">Peak time</span>{' '}
            <span className="text-white font-semibold">{data.busiestTime}</span>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-surface border border-subtle text-xs">
            <span className="text-dim">Cancellations (8 wks)</span>{' '}
            <span className="text-danger font-semibold tabular-nums">{data.totalCancellations}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Weekly volume - 8 weeks */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-5">Call Volume by Week</h2>
          {loading ? (
            <div className="h-56 bg-subtle/30 rounded-xl animate-pulse" />
          ) : data?.weeklyVolume ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.weeklyVolume} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="calls" radius={[5, 5, 0, 0]} maxBarSize={40}>
                  {data.weeklyVolume.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? '#ffffff' : '#60A5FA'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-dim text-sm py-8 text-center">No data</p>
          )}
        </div>

        {/* Day of week breakdown */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-5">Calls by Day of Week</h2>
          {loading ? (
            <div className="h-56 bg-subtle/30 rounded-xl animate-pulse" />
          ) : (
            <div className="space-y-3 py-2">
              {dayData.map((d) => (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-8 text-right tabular-nums">{d.day}</span>
                  <div className="flex-1 h-7 bg-subtle/50 rounded-lg overflow-hidden">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ${
                        d.full === data?.busiestDay ? 'bg-white' : 'bg-data-blue/70'
                      }`}
                      style={{ width: `${Math.max((d.calls / maxDayCount) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="text-sm text-white font-semibold tabular-nums w-6 text-right">{d.calls}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Time of day */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-5">Calls by Time of Day</h2>
          {loading ? (
            <div className="h-48 bg-subtle/30 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeData} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
                <XAxis dataKey="slot" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="calls" fill="#60A5FA" radius={[5, 5, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {!loading && (
            <div className="flex gap-6 mt-2 text-xs text-dim">
              {timeData.map(t => (
                <span key={t.slot}>{t.label}: <span className="text-muted tabular-nums">{t.calls}</span></span>
              ))}
            </div>
          )}
        </div>

        {/* Monthly comparison */}
        <div className="rounded-card border border-subtle bg-surface p-6">
          <h2 className="text-xs font-semibold uppercase tracking-heading text-dim mb-5">Monthly Comparison</h2>
          {loading ? (
            <div className="h-48 bg-subtle/30 rounded-xl animate-pulse" />
          ) : data?.monthlyComparison ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.monthlyComparison} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} tickFormatter={(v: string) => v.split(' ')[0]} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="calls" radius={[5, 5, 0, 0]} maxBarSize={48}>
                    {data.monthlyComparison.map((_, i) => (
                      <Cell key={i} fill={i === data.monthlyComparison.length - 1 ? '#ffffff' : '#60A5FA'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 text-xs">
                {data.monthlyComparison.map((m, i) => (
                  <span key={i} className="text-dim">
                    {m.month.split(' ')[0]}: <span className="text-white font-semibold tabular-nums">{m.calls}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-dim text-sm py-8 text-center">No data</p>
          )}
        </div>
      </div>
    </div>
  );
}
