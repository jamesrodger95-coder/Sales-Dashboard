'use client';

import { CallRecord } from '@/lib/types';

interface CallListProps {
  calls: CallRecord[];
  loading?: boolean;
}

export default function CallList({ calls, loading }: CallListProps) {
  if (loading) {
    return (
      <div className="space-y-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-11 bg-subtle/50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-dim">No calls recorded yet this month</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-3 pl-6 text-xs font-medium uppercase tracking-heading text-dim">Name</th>
            <th className="pb-3 text-xs font-medium uppercase tracking-heading text-dim">Phone</th>
            <th className="pb-3 text-xs font-medium uppercase tracking-heading text-dim">Date</th>
            <th className="pb-3 pr-6 text-xs font-medium uppercase tracking-heading text-dim hidden sm:table-cell">Country</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call, i) => (
            <tr
              key={i}
              className={`transition-colors hover:bg-surface-hover ${
                i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'
              }`}
            >
              <td className="py-3 pl-6 text-white font-medium">{call.name}</td>
              <td className="py-3 text-muted tabular-nums text-xs">
                {call.phone || <span className="text-dim">--</span>}
              </td>
              <td className="py-3 text-muted">
                {new Date(call.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </td>
              <td className="py-3 pr-6 text-dim hidden sm:table-cell">{call.country || '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
