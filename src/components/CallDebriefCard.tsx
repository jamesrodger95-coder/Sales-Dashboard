'use client';

import { useState, useEffect, useCallback } from 'react';
import DebriefForm from './DebriefForm';

interface ScheduleCall {
  name: string;
  email?: string;
  phone?: string | null;
  location?: string | null;
  time?: string;
}

interface Props {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string | null;
  defaultCountry?: string | null;
  onSaved?: () => void;
}

export default function CallDebriefCard({ defaultName, defaultEmail, defaultPhone, defaultCountry, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [todaysCalls, setTodaysCalls] = useState<ScheduleCall[]>([]);
  const [todayCount, setTodayCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      const today = new Date();
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const res = await fetch(`/api/debriefs?date=${ymd}`);
      const data = await res.json();
      setTodayCount(data.total || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  // Load today's calendar calls when opening
  useEffect(() => {
    if (!open) return;
    fetch('/api/dashboard').then(r => r.json()).then(data => {
      const calls: ScheduleCall[] = data.todaySchedule || [];
      const sorted = [...calls].sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      setTodaysCalls(sorted);
    }).catch(() => setTodaysCalls([]));
  }, [open]);

  return (
    <div className="rounded-2xl border border-[#1A1A1A] bg-surface mb-4 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center text-lg leading-none pb-0.5">+</div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white">Log a call</h3>
            <p className="text-[11px] text-dim">{todayCount} {todayCount === 1 ? 'call' : 'calls'} logged today</p>
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" className="text-dim" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[#1A1A1A] pt-4">
          <DebriefForm
            defaultName={defaultName}
            defaultEmail={defaultEmail}
            defaultPhone={defaultPhone}
            defaultCountry={defaultCountry}
            presets={todaysCalls}
            onSaved={() => {
              refreshCount();
              onSaved?.();
              setTimeout(() => setOpen(false), 2200);
            }}
          />
        </div>
      )}
    </div>
  );
}
