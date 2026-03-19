'use client';

interface ScheduleItem {
  time: string;
  event: string;
  type?: string;
  phone?: string;
}

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
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4 py-3 ml-3">
            <div className="skeleton h-4 w-12" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-44" />
              <div className="skeleton h-3 w-24" />
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
          {/* Timeline line */}
          <div className="absolute left-[3px] top-4 bottom-4 w-px bg-[#1A1A1A]" />

          {items.map((item, i) => (
            <div
              key={i}
              className="fade-in-row relative flex gap-4 py-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Timeline dot */}
              <span className={`relative z-10 w-[7px] h-[7px] rounded-full mt-1.5 flex-shrink-0 ring-2 ring-black ${
                item.type === 'demo' ? 'bg-data-blue' :
                item.type === 'follow-up' ? 'bg-warning' :
                'bg-[#444]'
              }`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-white tabular-nums font-semibold">{item.time}</span>
                </div>
                <p className="text-sm text-muted mt-0.5 truncate">{item.event}</p>
                {item.phone && (
                  <p className="text-xs text-dim tabular-nums font-mono mt-0.5">{item.phone}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
