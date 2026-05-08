'use client';

import { useState, useMemo } from 'react';

type Frame = 'Rounded' | 'Rectangular' | 'Not Sure';
type Magnification = '2.9x' | '3.8x' | '5.7x' | '7.8x' | 'MagniFlex';
type Headlight = 'Ignis 4 Pro' | 'Ignis 4 Lite' | 'Halo' | 'None';
type Outcome = 'Ordered' | 'Interested' | 'Thinking' | 'Not Ready' | 'No Answer';
type FollowUpType = 'Tomorrow' | 'This Week' | 'Next Week' | 'Custom' | 'No Follow Up';

const FRAMES: Frame[] = ['Rounded', 'Rectangular', 'Not Sure'];
const MAGS: Magnification[] = ['2.9x', '3.8x', '5.7x', '7.8x', 'MagniFlex'];
const HEADLIGHTS: Headlight[] = ['Ignis 4 Pro', 'Ignis 4 Lite', 'Halo', 'None'];
const OUTCOMES: Outcome[] = ['Ordered', 'Interested', 'Thinking', 'Not Ready', 'No Answer'];
const FOLLOWUPS: FollowUpType[] = ['Tomorrow', 'This Week', 'Next Week', 'Custom', 'No Follow Up'];

export interface DebriefFormProps {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string | null;
  defaultCountry?: string | null;
  callDate?: string;
  /** Optional preset list to surface above the name input — e.g. today's calendar calls */
  presets?: { name: string; email?: string; phone?: string | null; country?: string | null; time?: string }[];
  /** Hide the name input entirely (for cases where the call is already known) */
  lockName?: boolean;
  source?: 'dashboard' | 'telegram';
  onSaved?: (result: { id: string; crmStatus?: string; leadName?: string | null }) => void;
  onCancel?: () => void;
  compact?: boolean;
}

interface PillProps { active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'primary' | 'neutral' }
function Pill({ active, onClick, children, tone = 'primary' }: PillProps) {
  const activeClass = tone === 'neutral'
    ? 'bg-[#3A3A3A] text-white border-[#3A3A3A]'
    : 'bg-white text-black border-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active
          ? activeClass
          : 'border-[#333] text-gray-400 hover:border-[#444] hover:text-white'
      }`}
    >{children}</button>
  );
}

export default function DebriefForm({
  defaultName = '', defaultEmail = '', defaultPhone = null, defaultCountry = null,
  callDate, presets = [], lockName = false, source = 'dashboard', onSaved, onCancel, compact = false,
}: DebriefFormProps) {
  const [name, setName] = useState(defaultName);
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
  const [pushToCrm, setPushToCrm] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<null | { crm: string; leadName?: string | null }>(null);
  const [error, setError] = useState<string | null>(null);

  const pickPreset = (p: { name: string; email?: string; phone?: string | null; country?: string | null }) => {
    setName(p.name); setEmail(p.email || ''); setPhone(p.phone || ''); setCountry(p.country || '');
  };

  const canSave = useMemo(() => name.trim().length > 0 && outcome !== null, [name, outcome]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/debriefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, country: country.trim() || null,
          frame, magnification: mag, px: px === true, headlight, outcome, notes: notes.trim(),
          followUpType: followUp || 'No Follow Up',
          followUpCustomDate: followUp === 'Custom' ? customDate : undefined,
          callDate: callDate || new Date().toISOString(),
          source,
          pushToCrm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Server returned ${res.status}`);
      }
      setSaved({ crm: data.crm?.status || 'skipped', leadName: data.crm?.leadName });
      onSaved?.({ id: data.debrief.id, crmStatus: data.crm?.status, leadName: data.crm?.leadName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(msg);
      console.error('[DebriefForm] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const fieldLabel = compact ? 'text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block' : 'text-[10px] tracking-[0.15em] uppercase text-dim mb-2 block';
  const gap = compact ? 'space-y-3' : 'space-y-4';

  return (
    <div className={gap}>
      {/* Name picker */}
      {!lockName && (
        <div>
          <label className={fieldLabel}>Who</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Type a name or pick from below"
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333]"
          />
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {presets.slice(0, 6).map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickPreset(p)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[#222] text-muted hover:text-white hover:border-[#333] transition-colors"
                >
                  {p.time ? `${p.time} · ` : ''}{p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Frame + Magnification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={fieldLabel}>Frame</label>
          <div className="flex flex-wrap gap-1.5">
            {FRAMES.map(f => (
              <Pill
                key={f}
                active={frame === f}
                tone={f === 'Not Sure' ? 'neutral' : 'primary'}
                onClick={() => setFrame(f)}
              >{f}</Pill>
            ))}
          </div>
        </div>
        <div>
          <label className={fieldLabel}>Magnification</label>
          <div className="flex flex-wrap gap-1.5">
            {MAGS.map(m => <Pill key={m} active={mag === m} onClick={() => setMag(m)}>{m}</Pill>)}
          </div>
        </div>
      </div>

      {/* PX + Headlight */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
        <div>
          <label className={fieldLabel}>PX Lenses</label>
          <div className="flex gap-1.5">
            <Pill active={px === true} onClick={() => setPx(true)}>Yes</Pill>
            <Pill active={px === false} onClick={() => setPx(false)}>No</Pill>
          </div>
        </div>
        <div>
          <label className={fieldLabel}>Headlight</label>
          <div className="flex flex-wrap gap-1.5">
            {HEADLIGHTS.map(h => <Pill key={h} active={headlight === h} onClick={() => setHeadlight(h)}>{h}</Pill>)}
          </div>
        </div>
      </div>

      {/* Outcome */}
      <div>
        <label className={fieldLabel}>Outcome</label>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map(o => <Pill key={o} active={outcome === o} onClick={() => setOutcome(o)}>{o}</Pill>)}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={fieldLabel}>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Quick notes from the call..."
          rows={compact ? 2 : 2}
          className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333] resize-none"
        />
      </div>

      {/* Follow up */}
      <div>
        <label className={fieldLabel}>Follow up</label>
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

      {/* Save row */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving || !!saved}
          className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
        </button>
        {onCancel && !saved && (
          <button type="button" onClick={onCancel} className="text-xs text-dim hover:text-white">Cancel</button>
        )}
        {saved && (
          <div className="flex flex-col">
            <span className="text-xs text-emerald-400">Saved to dashboard</span>
            {saved.crm === 'pushed' && (
              <span className="text-[11px] text-emerald-400">Note added to CRM{saved.leadName ? ` (${saved.leadName})` : ''}</span>
            )}
            {saved.crm === 'failed' && (
              <span className="text-[11px] text-amber-400">CRM note failed — saved locally only</span>
            )}
            {saved.crm === 'no_record' && (
              <span className="text-[11px] text-gray-500">Lead not in CRM — saved locally</span>
            )}
            {saved.crm === 'not_configured' && (
              <span className="text-[11px] text-gray-500">CRM not configured</span>
            )}
          </div>
        )}
        {!saved && !canSave && <span className="text-xs text-dim">Pick a name + outcome to save</span>}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
