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
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-subtle/50 rounded-xl animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-heading text-dim mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-dim py-4">No events scheduled</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-subtle/60 last:border-0">
              <span className="text-sm text-muted tabular-nums min-w-[50px] font-medium">{item.time}</span>
              <div className="w-px h-8 bg-subtle" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.event}</p>
                {item.phone && (
                  <p className="text-xs text-dim tabular-nums mt-0.5">{item.phone}</p>
                )}
              </div>
              {item.type && (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  item.type === 'demo' ? 'bg-data-blue' :
                  item.type === 'follow-up' ? 'bg-warning' :
                  'bg-white/30'
                }`} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
