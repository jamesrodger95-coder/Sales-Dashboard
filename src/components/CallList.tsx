'use client';

import { CallRecord } from '@/lib/types';

interface CallListProps {
  calls: CallRecord[];
  loading?: boolean;
}

function getInitial(name: string): string {
  return (name || '?')[0].toUpperCase();
}

const INITIAL_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#F87171', '#38BDF8', '#FB923C'];

export default function CallList({ calls, loading }: CallListProps) {
  if (loading) {
    return (
      <div className="-mx-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-6 py-3 flex items-center gap-3">
            <div className="skeleton w-7 h-7 !rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3 w-40" />
            </div>
            <div className="skeleton h-3 w-16 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-10">
        <svg className="w-8 h-8 text-[#333] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9h18M9 4v5M15 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-muted">No calls recorded yet</p>
        <p className="text-xs text-dim mt-1">Calls from Google Calendar will appear here</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-[#1A1A1A]">
            <th className="pb-3 pl-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Name</th>
            <th className="pb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Phone</th>
            <th className="pb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">Date</th>
            <th className="pb-3 pr-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden sm:table-cell">Location</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call, i) => (
            <tr
              key={i}
              className="fade-in-row transition-colors hover:bg-white/[0.03] border-b border-[#1A1A1A]/50 last:border-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <td className="py-3 pl-6">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-black flex-shrink-0"
                    style={{ backgroundColor: INITIAL_COLORS[i % INITIAL_COLORS.length] }}
                  >
                    {getInitial(call.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{call.name}</p>
                    {call.email && <p className="text-[11px] text-dim truncate">{call.email}</p>}
                  </div>
                </div>
              </td>
              <td className="py-3 tabular-nums text-xs font-mono">
                {call.phone
                  ? <a href={`tel:${call.phone.replace(/\s/g, '')}`} className="text-muted hover:text-white transition-colors">{call.phone}</a>
                  : <span className="text-dim">--</span>}
              </td>
              <td className="py-3 text-muted text-xs">
                {new Date(call.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </td>
              <td className="py-3 pr-6 text-dim text-xs hidden sm:table-cell">{call.country || '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
