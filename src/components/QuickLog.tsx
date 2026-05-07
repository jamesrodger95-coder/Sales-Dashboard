'use client';

import { useState, useEffect } from 'react';
import DebriefForm from './DebriefForm';

interface ScheduleCall {
  name: string;
  email?: string;
  phone?: string | null;
  location?: string | null;
  time?: string;
}

export default function QuickLog() {
  const [open, setOpen] = useState(false);
  const [todaysCalls, setTodaysCalls] = useState<ScheduleCall[]>([]);

  // Ctrl+L shortcut + jarvis-style custom event
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    const openEvt = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('quicklog:open', openEvt);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('quicklog:open', openEvt);
    };
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Pull today's calendar calls when opening
  useEffect(() => {
    if (!open) return;
    fetch('/api/dashboard').then(r => r.json()).then(data => {
      const calls: ScheduleCall[] = data.todaySchedule || [];
      const sorted = [...calls].sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      setTodaysCalls(sorted);
    }).catch(() => setTodaysCalls([]));
  }, [open]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 w-12 h-12 rounded-full bg-emerald-500 text-white shadow-lg hover:shadow-xl hover:scale-105 hover:bg-emerald-400 transition-all z-40 flex items-center justify-center group"
        title="Log a call (Ctrl+L)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" />
          <path d="M16.5 6h3M18 4.5v3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full sm:max-w-xl bg-[#0F0F0F] border border-[#1A1A1A] sm:rounded-2xl shadow-2xl my-0 sm:my-8 max-h-screen sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#0F0F0F]/95 backdrop-blur border-b border-[#1A1A1A] px-5 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-white">Log a call</h2>
                <span className="text-[10px] text-dim hidden sm:inline">Ctrl+L</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-white hover:bg-[#1A1A1A] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              <DebriefForm
                presets={todaysCalls}
                source="dashboard"
                onSaved={() => {
                  // Auto-close after 2.5s so the success state is visible
                  setTimeout(() => setOpen(false), 2500);
                }}
                onCancel={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
