'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

type Frame = 'Rounded' | 'Rectangular';
type Magnification = '2.9x' | '3.8x' | '5.7x' | '7.8x' | 'MagniFlex';
type Headlight = 'Ignis 4 Pro' | 'Ignis 4 Lite' | 'Halo' | 'None';
type Outcome = 'Ordered' | 'Interested' | 'Thinking' | 'Not Ready' | 'No Answer';
type FollowUpType = 'Tomorrow' | 'This Week' | 'Next Week' | 'Custom' | 'No Follow Up';

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

const FRAMES: Frame[] = ['Rounded', 'Rectangular'];
const MAGS: Magnification[] = ['2.9x', '3.8x', '5.7x', '7.8x', 'MagniFlex'];
const HEADLIGHTS: Headlight[] = ['Ignis 4 Pro', 'Ignis 4 Lite', 'Halo', 'None'];
const OUTCOMES: Outcome[] = ['Ordered', 'Interested', 'Thinking', 'Not Ready', 'No Answer'];
const FOLLOWUPS: FollowUpType[] = ['Tomorrow', 'This Week', 'Next Week', 'Custom', 'No Follow Up'];

export default function CallDebriefCard({ defaultName, defaultEmail, defaultPhone, defaultCountry, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [todaysCalls, setTodaysCalls] = useState<ScheduleCall[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushToCrm, setPushToCrm] = useState(true);
  const [crmStatus, setCrmStatus] = useState<'pushed' | 'failed' | 'no_record' | 'skipped' | 'not_configured' | null>(null);
  const [crmLeadName, setCrmLeadName] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(defaultName || '');
  const [email, setEmail] = useState(defaultEmail || '');
  const [phone, setPhone] = useState(defaultPhone || '');
  const [country, setCountry] = useState(defaultCountry || '');
  const [frame, setFrame] = useState<Frame | null>(null);
  const [mag, setMag] = useState<Magnification | null>(null);
  const [px, setPx] = useState<boolean | null>(null);
  const [headlight, setHeadlight] = useState<Headlight | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState<FollowUpType | null>(null);
  const [customDate, setCustomDate] = useState('');

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
      // Most recent / latest time first
      const sorted = [...calls].sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      setTodaysCalls(sorted);
    }).catch(() => setTodaysCalls([]));
  }, [open]);

  const reset = () => {
    setName(defaultName || ''); setEmail(defaultEmail || '');
    setPhone(defaultPhone || ''); setCountry(defaultCountry || '');
    setFrame(null); setMag(null); setPx(null); setHeadlight(null);
    setOutcome(null); setNotes(''); setFollowUp(null); setCustomDate('');
  };

  const pickCall = (c: ScheduleCall) => {
    setName(c.name); setEmail(c.email || ''); setPhone(c.phone || '');
    setCountry(c.location || '');
  };

  const canSave = useMemo(() => name.trim().length > 0 && outcome !== null, [name, outcome]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setCrmStatus(null);
    try {
      const res = await fetch('/api/debriefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, country: country.trim() || null,
          frame, magnification: mag, px: px === true, headlight, outcome, notes: notes.trim(),
          followUpType: followUp || 'No Follow Up',
          followUpCustomDate: followUp === 'Custom' ? customDate : undefined,
          callDate: new Date().toISOString(), source: 'dashboard',
          pushToCrm,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      setCrmStatus(data.crm?.status || null);
      setCrmLeadName(data.crm?.leadName || null);
      setSaved(true);
      await refreshCount();
      onSaved?.();
      // Show the result for 2.5s, then collapse
      setTimeout(() => {
        setSaved(false);
        setCrmStatus(null);
        setCrmLeadName(null);
        reset();
        setOpen(false);
      }, 2500);
    } catch {
      alert('Failed to save debrief');
    } finally {
      setSaving(false);
    }
  };

  const Pill = ({ active, onClick, children, danger }: { active: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active
          ? 'bg-white text-black border-white'
          : danger
          ? 'border-[#333] text-gray-400 hover:border-[#444] hover:text-white'
          : 'border-[#333] text-gray-400 hover:border-[#444] hover:text-white'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-2xl border border-[#1A1A1A] bg-surface mb-4 overflow-hidden">
      {/* Collapsed header */}
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

      {/* Expanded form */}
      {open && (
        <div className="px-4 pb-4 border-t border-[#1A1A1A] pt-4 space-y-4">
          {/* Name picker */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Who</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Type a name or pick from today's calls below"
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333]"
            />
            {todaysCalls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {todaysCalls.slice(0, 6).map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickCall(c)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[#222] text-muted hover:text-white hover:border-[#333] transition-colors"
                  >
                    {c.time || ''} · {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Frame + Magnification — two on one row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Frame</label>
              <div className="flex flex-wrap gap-1.5">
                {FRAMES.map(f => <Pill key={f} active={frame === f} onClick={() => setFrame(f)}>{f}</Pill>)}
              </div>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Magnification</label>
              <div className="flex flex-wrap gap-1.5">
                {MAGS.map(m => <Pill key={m} active={mag === m} onClick={() => setMag(m)}>{m}</Pill>)}
              </div>
            </div>
          </div>

          {/* PX + Headlight */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
            <div>
              <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">PX Lenses</label>
              <div className="flex gap-1.5">
                <Pill active={px === true} onClick={() => setPx(true)}>Yes</Pill>
                <Pill active={px === false} onClick={() => setPx(false)}>No</Pill>
              </div>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Headlight</label>
              <div className="flex flex-wrap gap-1.5">
                {HEADLIGHTS.map(h => <Pill key={h} active={headlight === h} onClick={() => setHeadlight(h)}>{h}</Pill>)}
              </div>
            </div>
          </div>

          {/* Outcome */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Outcome</label>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map(o => <Pill key={o} active={outcome === o} onClick={() => setOutcome(o)}>{o}</Pill>)}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Quick notes from the call..."
              rows={2}
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333] resize-none"
            />
          </div>

          {/* Follow up */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block">Follow up</label>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOWUPS.map(f => <Pill key={f} active={followUp === f} onClick={() => setFollowUp(f)}>{f}</Pill>)}
            </div>
            {followUp === 'Custom' && (
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="mt-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#333]"
              />
            )}
          </div>

          {/* CRM toggle */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setPushToCrm(p => !p)}
              className="flex items-center gap-2 group"
            >
              <span className={`relative w-9 h-5 rounded-full transition-colors ${pushToCrm ? 'bg-emerald-500' : 'bg-[#1A1A1A]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${pushToCrm ? 'left-[18px] bg-white' : 'left-0.5 bg-[#555]'}`} />
              </span>
              <span className="text-xs text-muted group-hover:text-white transition-colors">Add note to CRM</span>
            </button>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={!canSave || saving}
              className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
            </button>
            {saved && (
              <div className="flex flex-col">
                <span className="text-xs text-emerald-400">Saved to dashboard</span>
                {crmStatus === 'pushed' && (
                  <span className="text-[11px] text-emerald-400">Note added to CRM{crmLeadName ? ` (${crmLeadName})` : ''}</span>
                )}
                {crmStatus === 'failed' && (
                  <span className="text-[11px] text-amber-400">CRM note failed — saved locally only</span>
                )}
                {crmStatus === 'no_record' && (
                  <span className="text-[11px] text-gray-500">Lead not in CRM — saved locally</span>
                )}
                {crmStatus === 'not_configured' && (
                  <span className="text-[11px] text-gray-500">CRM not configured</span>
                )}
              </div>
            )}
            {!saved && !canSave && <span className="text-xs text-dim">Add a name and pick an outcome to save</span>}
          </div>
        </div>
      )}
    </div>
  );
}
