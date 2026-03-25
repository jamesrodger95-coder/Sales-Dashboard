'use client';

import { ScheduleItem } from '@/lib/types';

interface ScheduleListProps {
  items: ScheduleItem[];
  title: string;
  loading?: boolean;
}

export default function ScheduleList({ items, title, loading }: ScheduleListProps) {
  if (loading) {
    return (
      <div>
        <div className="skeleton h-3 w-16 mb-5" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex gap-4 py-3 ml-3">
            <div className="skeleton h-4 w-12" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-44" />
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] mb-4 pb-2 border-b border-[#1A1A1A]">{title}</h3>
      {items.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-7 h-7 text-[#333] mx-auto mb-2" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-dim">No events scheduled</p>
        </div>
      ) : (
        <div className="relative ml-3">
          <div className="absolute left-[3px] top-4 bottom-4 w-px bg-[#1A1A1A]" />

          {items.map((item, i) => (
            <div
              key={i}
              className="fade-in-row relative flex gap-4 py-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Timeline dot */}
              <span className={`relative z-10 w-[7px] h-[7px] rounded-full mt-1.5 flex-shrink-0 ring-2 ring-black ${
                item.attendanceConfirmed === false ? 'bg-danger' :
                item.type === 'demo' ? 'bg-data-blue' :
                'bg-[#444]'
              }`} />

              <div className="flex-1 min-w-0">
                {/* Time */}
                <span className="text-sm text-white tabular-nums font-semibold">{item.time}</span>

                {/* Lead name */}
                <p className="text-sm text-white mt-1">{item.name}</p>

                {/* Phone — clickable */}
                {item.phone && (
                  <a href={`tel:${item.phone.replace(/\s/g, '')}`} className="text-xs text-dim tabular-nums font-mono mt-0.5 hover:text-muted transition-colors block">{item.phone}</a>
                )}

                {/* Location */}
                {item.location && (
                  <p className="text-[11px] text-dim mt-1">{item.location}</p>
                )}

                {/* Notes */}
                {item.notes && (
                  <p className="text-[11px] text-muted italic mt-1 line-clamp-2">&ldquo;{item.notes}&rdquo;</p>
                )}

                {/* Warnings */}
                {item.attendanceConfirmed === false && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                    <span className="text-[10px] text-danger">Attendance not confirmed</span>
                  </div>
                )}
                {item.rescheduleReason && (
                  <p className="text-[10px] text-warning mt-1">Reschedule: {item.rescheduleReason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
