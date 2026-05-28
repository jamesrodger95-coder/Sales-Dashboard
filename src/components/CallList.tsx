'use client';

import { useState, useEffect, useCallback } from 'react';
import { CallRecord } from '@/lib/types';
import DebriefForm from './DebriefForm';

interface CallListProps {
  calls: CallRecord[];
  loading?: boolean;
}

function getInitial(name: string): string {
  return (name || '?')[0].toUpperCase();
}

const INITIAL_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#F87171', '#38BDF8', '#FB923C'];

interface DebriefSummary {
  id: string;
  frame: string | null;
  magnification: string | string[] | null;
  px: boolean;
  headlight: string | null;
  outcome: string | null;
  notes: string;
}

function magText(m: string | string[] | null | undefined, sep = ' / '): string | null {
  if (!m) return null;
  if (Array.isArray(m)) return m.length ? m.join(sep) : null;
  return m;
}

export default function CallList({ calls, loading }: CallListProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [debriefsByEmail, setDebriefsByEmail] = useState<Record<string, DebriefSummary>>({});

  const loadDebriefs = useCallback(async () => {
    try {
      const data = await fetch('/api/debriefs').then(r => r.json());
      const map: Record<string, DebriefSummary> = {};
      (data.debriefs || []).forEach((d: { email?: string | null } & DebriefSummary) => {
        if (d.email) map[d.email.toLowerCase()] = { id: d.id, frame: d.frame, magnification: d.magnification, px: d.px, headlight: d.headlight, outcome: d.outcome, notes: d.notes };
      });
      setDebriefsByEmail(map);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadDebriefs(); }, [loadDebriefs]);

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
            <th className="pb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden sm:table-cell">Location</th>
            <th className="pb-3 pr-6 text-[11px] font-medium uppercase tracking-[0.15em] text-[#555] hidden md:table-cell">Notes</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call, i) => {
            const debrief = call.email ? debriefsByEmail[call.email.toLowerCase()] : null;
            const isOpen = expanded === i;
            return (
              <>
                <tr
                  key={i}
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="fade-in-row transition-colors hover:bg-white/[0.03] border-b border-[#1A1A1A]/50 last:border-0 cursor-pointer"
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
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium truncate">{call.name}</p>
                          {call.platform === 'Calendly' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#F5A623]/10 text-[#F5A623] flex-shrink-0">Calendly</span>}
                          {call.platform === 'Cal.com' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-data-blue/10 text-data-blue flex-shrink-0">Cal</span>}
                        </div>
                        {call.email && <p className="text-[11px] text-dim truncate">{call.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 tabular-nums text-xs font-mono">
                    {call.phone
                      ? <a onClick={e => e.stopPropagation()} href={`tel:${call.phone.replace(/\s/g, '')}`} className="text-muted hover:text-white transition-colors">{call.phone}</a>
                      : <span className="text-dim">--</span>}
                  </td>
                  <td className="py-3 text-muted text-xs">
                    {new Date(call.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="py-3 text-dim text-xs hidden sm:table-cell">{call.country || '--'}</td>
                  <td className="py-3 pr-6 hidden md:table-cell">
                    {debrief ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-400/10 text-emerald-400">
                        <span className="w-1 h-1 rounded-full bg-current" />
                        Notes
                      </span>
                    ) : (
                      <span className="text-[10px] text-dim">log →</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`detail-${i}`}>
                    <td colSpan={5} className="px-6 pb-4">
                      <div className="rounded-xl bg-black/30 p-4 text-xs space-y-3">
                        {debrief ? (
                          <div>
                            <p className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1">Call notes logged</p>
                            <p className="text-muted">
                              {[debrief.frame, magText(debrief.magnification), debrief.px ? 'PX' : null, debrief.headlight, debrief.outcome].filter(Boolean).join(' · ') || '—'}
                            </p>
                            {debrief.notes && <p className="text-dim italic mt-1">&ldquo;{debrief.notes}&rdquo;</p>}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2">Log debrief</p>
                            <DebriefForm
                              defaultName={call.name}
                              defaultEmail={call.email}
                              defaultPhone={call.phone}
                              defaultCountry={call.country}
                              callDate={call.date}
                              lockName={true}
                              compact={true}
                              onSaved={() => loadDebriefs()}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
