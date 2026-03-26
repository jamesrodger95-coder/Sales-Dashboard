'use client';

import { useEffect, useRef } from 'react';

interface DrillDownRow {
  name: string;
  phone?: string | null;
  email?: string;
  date?: string;
  country?: string | null;
  status?: string;
  value?: number | null;
  extra?: string;
}

interface DrillDownProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: DrillDownRow[];
}

export default function DrillDown({ open, onClose, title, subtitle, rows }: DrillDownProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-[#111] border-l border-[#1A1A1A] z-50 flex flex-col animate-slide-in"
        style={{ animation: 'slideIn 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1A1A1A] flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-[11px] text-dim mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-white hover:bg-[#1A1A1A] transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-dim text-center py-8">No records</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#111]">
                <tr className="border-b border-[#1A1A1A]">
                  <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Name</th>
                  <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Phone</th>
                  <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Date</th>
                  {rows.some(r => r.country) && <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Country</th>}
                  {rows.some(r => r.value) && <th className="py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">Value</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[#1A1A1A]/40 last:border-0 hover:bg-white/[0.02]">
                    <td className="py-2.5">
                      <p className="text-white font-medium">{r.name}</p>
                      {r.email && <p className="text-[10px] text-dim mt-0.5">{r.email}</p>}
                      {r.extra && <p className="text-[10px] text-dim mt-0.5">{r.extra}</p>}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums">
                      {r.phone
                        ? <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="text-muted hover:text-white transition-colors">{r.phone}</a>
                        : <span className="text-dim">--</span>}
                    </td>
                    <td className="py-2.5 text-muted">
                      {r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', weekday: 'short' }) : '--'}
                    </td>
                    {rows.some(row => row.country) && <td className="py-2.5 text-dim">{r.country || '--'}</td>}
                    {rows.some(row => row.value) && <td className="py-2.5 text-right text-muted tabular-nums">{r.value ? `$${Math.round(r.value).toLocaleString()}` : '--'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1A1A1A] flex-shrink-0">
          <p className="text-[11px] text-dim tabular-nums">{rows.length} records</p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
