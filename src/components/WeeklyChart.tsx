'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { WeeklyVolume } from '@/lib/types';

interface WeeklyChartProps {
  data: WeeklyVolume[];
  loading?: boolean;
}

export default function WeeklyChart({ data, loading }: WeeklyChartProps) {
  if (loading) {
    return (
      <div className="h-48 flex items-end gap-2 px-2 pb-4">
        {[35, 55, 45, 70, 50, 65, 40, 80].map((h, i) => (
          <div key={i} className="flex-1 skeleton rounded-t-md" style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-7 h-7 text-[#333] mx-auto mb-2" viewBox="0 0 24 24" fill="none">
            <path d="M3 20h18M5 17V10M9 17V7M13 17V12M17 17V5M21 17V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-xs text-dim">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
        <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: '12px', color: '#fff', fontSize: '12px', padding: '8px 14px' }}
          labelStyle={{ color: '#888', marginBottom: '4px' }}
        />
        <Bar dataKey="calls" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={600} animationEasing="ease-out">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.isCurrent ? '#ffffff' : '#60A5FA'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
