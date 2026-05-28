'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Item {
  id: string;
  name: string;
  notes: string;
  followUpDate: string | null;
  outcome: string | null;
  magnification: string | string[] | null;
  headlight: string | null;
}

function magText(m: string | string[] | null | undefined): string | null {
  if (!m) return null;
  if (Array.isArray(m)) return m.length ? m.join(' / ') : null;
  return m;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await fetch('/api/debriefs/follow-ups').then(r => r.json());
      const all = [...(data.overdue || []), ...(data.dueToday || [])];
      setCount(all.length);
      setItems(all);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
        title="Follow-up reminders"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-black">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 max-h-[400px] overflow-y-auto rounded-2xl bg-white border border-[#E5E5E5] shadow-xl z-50">
          <div className="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black">Follow-ups</h3>
            <span className="text-[11px] text-[#999]">{count} due</span>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-[#999] text-center">All caught up</p>
          ) : (
            <div className="divide-y divide-[#F0F0F0]">
              {items.map(it => (
                <Link
                  key={it.id}
                  href="/#follow-ups"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 hover:bg-[#F8F8F8] transition-colors"
                >
                  <p className="text-sm font-medium text-black truncate">{it.name}</p>
                  <p className="text-[11px] text-[#666] truncate mt-0.5">
                    {[magText(it.magnification), it.headlight, it.outcome].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {it.notes && <p className="text-[11px] text-[#999] truncate mt-0.5 italic">&ldquo;{it.notes}&rdquo;</p>}
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/#follow-ups"
            onClick={() => setOpen(false)}
            className="block text-center text-[11px] text-[#666] hover:text-black px-4 py-2.5 border-t border-[#F0F0F0]"
          >
            Open follow-up list
          </Link>
        </div>
      )}
    </div>
  );
}
