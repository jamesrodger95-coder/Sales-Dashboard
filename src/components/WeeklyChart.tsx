'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { WeeklyVolume } from '@/lib/types';

interface WeeklyChartProps {
  data: WeeklyVolume[];
  loading?: boolean;
}

export default function WeeklyChart({ data, loading }: WeeklyChartProps) {
  if (loading) {
    return (
      <div className="h-52 flex items-end gap-3 px-4 pb-6">
        {[40, 65, 50, 80, 55, 70, 45, 90].map((h, i) => (
          <div key={i} className="flex-1 skeleton" style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-dim text-sm">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
        <XAxis
          dataKey="week"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#555555', fontSize: 11 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#555555', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{
            background: '#111111',
            border: '1px solid #1A1A1A',
            borderRadius: '10px',
            color: '#ffffff',
            fontSize: '12px',
            padding: '8px 12px',
          }}
          labelStyle={{ color: '#888888', marginBottom: '4px' }}
        />
        <Bar
          dataKey="calls"
          fill="#60A5FA"
          radius={[6, 6, 0, 0]}
          maxBarSize={48}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
