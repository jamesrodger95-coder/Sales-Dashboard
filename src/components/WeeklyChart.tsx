'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { WeeklyVolume } from '@/lib/types';

interface WeeklyChartProps {
  data: WeeklyVolume[];
  loading?: boolean;
}

export default function WeeklyChart({ data, loading }: WeeklyChartProps) {
  if (loading) {
    return <div className="h-52 bg-subtle/30 rounded-xl animate-pulse" />;
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
        <Bar dataKey="calls" fill="#60A5FA" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
