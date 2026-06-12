'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

type Column = 'interested' | 'quoted' | 'deciding' | 'closing';
const COLUMNS: Column[] = ['interested', 'quoted', 'deciding', 'closing'];

interface BoardCard {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  country: string | null;
  frame: string | null;
  magnification: string[];
  px: boolean;
  headlight: string | null;
  notes: string;
  column: Column;
  outcome: 'won' | 'lost' | null;
  lostReason: string | null;
  addedAt: string;
  movedAt: string;
  followUpDate: string | null;
  value?: number | null;
  wonAt?: string | null;
  lostAt?: string | null;
}

const COLUMN_META: Record<Column, { label: string; tag: string; border: string; bg: string }> = {
  interested: { label: 'Interested', tag: 'Had a demo, showed interest',         border: 'border-l-[#60A5FA]', bg: 'bg-[#60A5FA]' },
  quoted:     { label: 'Quoted',     tag: 'Sent pricing / config',                border: 'border-l-[#A78BFA]', bg: 'bg-[#A78BFA]' },
  deciding:   { label: 'Deciding',   tag: 'Thinking, checking with partner',      border: 'border-l-[#F59E0B]', bg: 'bg-[#F59E0B]' },
  closing:    { label: 'Closing',    tag: 'Ready to pay, finalising',             border: 'border-l-[#34D399]', bg: 'bg-[#34D399]' },
};

const MAGS = ['2.9x', '3.8x', '5.7x', '7.8x', 'MagniFlex'];

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function followUpStyle(dateStr: string | null): { text: string; cls: string } | null {
  if (!dateStr) return null;
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dateStr);
  const dDays = Math.floor((due.getTime() - t.getTime()) / 86400000);
  const text = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (dDays < 0) return { text: `Follow-up ${text} · overdue`, cls: 'text-red-400 border-red-400/30 bg-red-400/10' };
  if (dDays === 0) return { text: `Follow-up today`, cls: 'text-amber-400 border-amber-400/30 bg-amber-400/10' };
  return { text: `Follow-up ${text}`, cls: 'text-dim border-[#222]' };
}

export default function BoardPage() {
  const [active, setActive] = useState<BoardCard[]>([]);
  const [won, setWon] = useState<BoardCard[]>([]);
  const [lost, setLost] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<{ won: boolean; lost: boolean }>({ won: false, lost: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, w, l] = await Promise.all([
        fetch('/api/board').then(r => r.json()),
        fetch('/api/board/won').then(r => r.json()),
        fetch('/api/board/lost').then(r => r.json()),
      ]);
      setActive(Array.isArray(a.cards) ? a.cards : []);
      setWon(Array.isArray(w.cards) ? w.cards : []);
      setLost(Array.isArray(l.cards) ? l.cards : []);
    } catch (err) {
      console.error(err);
      setError('Could not load board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const moveTo = async (id: string, col: Column) => {
    // Optimistic update
    setActive(prev => prev.map(c => c.id === id ? { ...c, column: col, movedAt: new Date().toISOString() } : c));
    try {
      await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: col }),
      });
    } catch {
      load(); // fall back to refetch
    }
  };

  const markWon = async (id: string) => {
    setActive(prev => prev.filter(c => c.id !== id));
    try {
      const res = await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'won' }),
      });
      const data = await res.json();
      if (data.card) setWon(prev => [data.card, ...prev]);
    } catch { load(); }
  };

  const markLost = async (id: string) => {
    const reason = window.prompt('Lost reason (optional):', '') || '';
    setActive(prev => prev.filter(c => c.id !== id));
    try {
      const res = await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'lost', lostReason: reason.trim() }),
      });
      const data = await res.json();
      if (data.card) setLost(prev => [data.card, ...prev]);
    } catch { load(); }
  };

  const updateCard = async (id: string, patch: Partial<BoardCard>): Promise<BoardCard | null> => {
    // Optimistic update
    setActive(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    try {
      const res = await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
      // Reconcile with server response (in case any field was normalized)
      setActive(prev => prev.map(c => c.id === id ? data.card : c));
      return data.card;
    } catch (err) {
      console.error('[Board] update failed:', err);
      load();
      return null;
    }
  };

  const removeCard = async (id: string) => {
    if (!confirm('Remove this card from the board?')) return;
    setActive(prev => prev.filter(c => c.id !== id));
    try { await fetch(`/api/board/${id}`, { method: 'DELETE' }); }
    catch { load(); }
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    draggingIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOverCol = (e: React.DragEvent<HTMLDivElement>, col: Column) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== col) setDragOverCol(col);
  };
  const onDropCol = (e: React.DragEvent<HTMLDivElement>, col: Column) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('text/plain') || draggingIdRef.current;
    draggingIdRef.current = null;
    if (!id) return;
    const card = active.find(c => c.id === id);
    if (!card || card.column === col) return;
    moveTo(id, col);
  };

  const totalActive = active.length;
  const wonValue = won.reduce((s, c) => s + (c.value || 0), 0);

  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Closing Board</h1>
          <p className="text-xs text-dim mt-1">Manually curated. Drag cards between columns as deals progress.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition"
        >+ Add Lead</button>
      </div>

      {/* Stats bar */}
      <div className="rounded-xl border border-[#1A1A1A] bg-surface px-4 py-3 mb-6 text-xs text-muted flex flex-wrap gap-x-5 gap-y-2 items-center">
        <span>Board: <span className="text-white font-semibold tabular-nums">{totalActive}</span> active</span>
        <span className="text-[#333]">·</span>
        <span>Won this month: <span className="text-emerald-400 font-semibold tabular-nums">{won.length}</span>{wonValue > 0 ? <span className="text-emerald-400/70"> ({formatGBP(wonValue)})</span> : null}</span>
        <span className="text-[#333]">·</span>
        <span>Lost: <span className="text-red-400 font-semibold tabular-nums">{lost.length}</span></span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map(col => {
          const meta = COLUMN_META[col];
          const cards = active.filter(c => c.column === col);
          const isOver = dragOverCol === col;
          return (
            <div
              key={col}
              onDragOver={e => onDragOverCol(e, col)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => onDropCol(e, col)}
              className={`rounded-2xl bg-[#111] border ${isOver ? 'border-white/40' : 'border-[#1A1A1A]'} p-3 transition-colors min-h-[160px]`}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between mb-3 pb-2 border-b border-[#1A1A1A] border-l-4 pl-2 ${meta.border}`}>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white">{meta.label}</h3>
                <span className="text-[10px] text-dim tabular-nums">{cards.length}</span>
              </div>
              <p className="text-[10px] text-dim mb-2 px-1">{meta.tag}</p>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => <div key={i} className="h-24 bg-[#1A1A1A]/60 rounded-xl animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />)}
                </div>
              ) : cards.length === 0 ? (
                <p className="text-[11px] text-dim italic text-center py-6">Drop here</p>
              ) : (
                <div className="space-y-2">
                  {cards.map(card => (
                    <Card
                      key={card.id}
                      card={card}
                      onDragStart={onDragStart}
                      onMoveTo={moveTo}
                      onWon={markWon}
                      onLost={markLost}
                      onRemove={removeCard}
                      onUpdate={updateCard}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Won section */}
      <CollapsibleSection
        title={`Won this month (${won.length})`}
        valueTag={wonValue > 0 ? formatGBP(wonValue) : null}
        color="emerald"
        collapsed={collapsedSections.won}
        onToggle={() => setCollapsedSections(s => ({ ...s, won: !s.won }))}
      >
        {won.length === 0 ? (
          <p className="text-xs text-dim italic text-center py-6">No wins this month yet.</p>
        ) : (
          <div className="space-y-1">
            {won.map(c => (
              <div key={c.id} className="text-xs text-muted py-2 px-3 border-b border-[#1A1A1A] last:border-0 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-white font-medium">{c.name}</span>
                {c.country && <span className="text-dim">{c.country}</span>}
                {c.magnification.length > 0 && <span className="text-dim">{c.magnification.join(' / ')}</span>}
                {c.px && <span className="text-dim">PX</span>}
                {typeof c.value === 'number' && c.value > 0 && <span className="text-emerald-400 tabular-nums">{formatGBP(c.value)}</span>}
                <span className="ml-auto text-dim">Won {c.wonAt ? new Date(c.wonAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Lost section */}
      <CollapsibleSection
        title={`Lost this month (${lost.length})`}
        valueTag={null}
        color="red"
        collapsed={collapsedSections.lost}
        onToggle={() => setCollapsedSections(s => ({ ...s, lost: !s.lost }))}
      >
        {lost.length === 0 ? (
          <p className="text-xs text-dim italic text-center py-6">No losses this month.</p>
        ) : (
          <div className="space-y-1">
            {lost.map(c => (
              <div key={c.id} className="text-xs text-muted py-2 px-3 border-b border-[#1A1A1A] last:border-0 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-white font-medium">{c.name}</span>
                {c.country && <span className="text-dim">{c.country}</span>}
                {c.magnification.length > 0 && <span className="text-dim">{c.magnification.join(' / ')}</span>}
                <span className="text-dim">Lost {c.lostAt ? new Date(c.lostAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                {c.lostReason && <span className="text-dim italic">&ldquo;{c.lostReason}&rdquo;</span>}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {showAdd && (
        <AddCardModal
          onClose={() => setShowAdd(false)}
          onAdded={card => { setActive(prev => [...prev, card]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================
const FRAMES = ['Rounded', 'Rectangular', 'Not Sure'] as const;
const HEADLIGHTS = ['Ignis 4 Pro', 'Ignis 4 Lite', 'Halo', 'None'] as const;

function Card({
  card, onDragStart, onMoveTo, onWon, onLost, onRemove, onUpdate,
}: {
  card: BoardCard;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onMoveTo: (id: string, col: Column) => void;
  onWon: (id: string) => void;
  onLost: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<BoardCard>) => Promise<BoardCard | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = COLUMN_META[card.column];
  const cfg = useMemo(() =>
    [card.frame, card.magnification.join(' / ') || null, card.headlight].filter(Boolean).join(' · '),
    [card.frame, card.magnification, card.headlight],
  );
  const fu = followUpStyle(card.followUpDate);
  const colIdx = COLUMNS.indexOf(card.column);
  const nextCol = colIdx < COLUMNS.length - 1 ? COLUMNS[colIdx + 1] : null;
  const prevCol = colIdx > 0 ? COLUMNS[colIdx - 1] : null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      draggable={!expanded}
      onDragStart={e => onDragStart(e, card.id)}
      onClick={() => setExpanded(v => !v)}
      className={`group relative rounded-xl bg-[#1A1A1A] border border-[#333] border-l-4 ${meta.border} p-3 ${expanded ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} hover:border-[#444] hover:shadow-lg transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{card.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {card.phone && (
              <a
                href={`tel:${card.phone.replace(/\s/g, '')}`}
                onClick={stop}
                className="text-[11px] text-muted hover:text-white font-mono tabular-nums truncate"
              >{card.phone}</a>
            )}
            {card.country && <span className="text-[10px] text-dim">{card.country}</span>}
            {card.px && <span className="text-[9px] px-1.5 py-0.5 rounded bg-data-blue/20 text-data-blue font-semibold">PX</span>}
          </div>
        </div>
        <span className="text-[10px] text-dim opacity-0 group-hover:opacity-100 transition shrink-0">{expanded ? '▴' : '▾'}</span>
      </div>

      {cfg && <p className="text-[11px] text-muted mt-1.5 truncate">{cfg}</p>}
      {card.notes && !expanded && <p className="text-[11px] text-dim italic mt-1 line-clamp-2">&ldquo;{card.notes}&rdquo;</p>}

      {fu && !expanded && (
        <span className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full border ${fu.cls}`}>{fu.text}</span>
      )}

      {!expanded && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-dim">Added {daysAgo(card.addedAt)}</span>
          <div className="flex items-center gap-1">
            {prevCol && (
              <button
                onClick={e => { stop(e); onMoveTo(card.id, prevCol); }}
                title={`Move to ${COLUMN_META[prevCol].label}`}
                className="w-6 h-6 rounded-md border border-[#333] text-dim hover:text-white hover:border-[#555]"
              >‹</button>
            )}
            {nextCol && (
              <button
                onClick={e => { stop(e); onMoveTo(card.id, nextCol); }}
                title={`Move to ${COLUMN_META[nextCol].label}`}
                className="w-6 h-6 rounded-md border border-[#333] text-dim hover:text-white hover:border-[#555]"
              >›</button>
            )}
          </div>
        </div>
      )}

      {/* Hover-revealed action row (also visible while expanded) */}
      <div className={`mt-2 flex items-center gap-1 ${expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition`}>
        <button
          onClick={e => { stop(e); onWon(card.id); }}
          className="flex-1 text-[10px] px-2 py-1 rounded-md border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10"
        >Won</button>
        <button
          onClick={e => { stop(e); onLost(card.id); }}
          className="flex-1 text-[10px] px-2 py-1 rounded-md border border-red-400/30 text-red-400 hover:bg-red-400/10"
        >Lost</button>
        <button
          onClick={e => { stop(e); onRemove(card.id); }}
          title="Remove from board (not won/lost)"
          className="text-[10px] px-2 py-1 rounded-md border border-[#222] text-dim hover:text-white"
        >Remove</button>
      </div>

      {/* Inline editor */}
      {expanded && (
        <CardEditor
          card={card}
          onUpdate={onUpdate}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// CardEditor — inline form, all fields optional
// ============================================================================
function CardEditor({
  card, onUpdate, onClose,
}: {
  card: BoardCard;
  onUpdate: (id: string, patch: Partial<BoardCard>) => Promise<BoardCard | null>;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<BoardCard['frame']>(card.frame);
  const [mags, setMags] = useState<string[]>(card.magnification || []);
  // Tri-state in the editor: explicit Yes, explicit No, or unset. The card's
  // px is stored as a boolean, so we treat false as "unset" by default — a
  // card from a quick + Board add wasn't actually asked the PX question.
  const [px, setPx] = useState<boolean | null>(card.px === true ? true : null);
  const [headlight, setHeadlight] = useState<BoardCard['headlight']>(card.headlight);
  const [notes, setNotes] = useState(card.notes || '');
  const [followUpDate, setFollowUpDate] = useState(card.followUpDate || '');
  const [value, setValue] = useState(card.value != null ? String(card.value) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMag = (m: string) => {
    setMags(prev => prev.includes(m) ? prev.filter(x => x !== m) : prev.length >= 2 ? [...prev.slice(1), m] : [...prev, m]);
  };

  const toggleFrame = (f: BoardCard['frame']) => setFrame(prev => prev === f ? null : f);
  const toggleHeadlight = (h: BoardCard['headlight']) => setHeadlight(prev => prev === h ? null : h);

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<BoardCard> = {
        frame,
        magnification: mags as BoardCard['magnification'],
        // px tri-state: false when explicitly set, null/undefined when unset
        px: px === true,
        headlight,
        notes: notes.trim(),
        followUpDate: followUpDate || null,
        value: value ? Number(value) : null,
      };
      const updated = await onUpdate(card.id, patch);
      if (updated) onClose();
      else setError('Save failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded-full text-[10px] font-medium border transition ${
        active ? 'bg-white text-black border-white' : 'border-[#333] text-gray-400 hover:border-[#444] hover:text-white'
      }`}
    >{children}</button>
  );

  return (
    <div onClick={e => e.stopPropagation()} className="mt-3 pt-3 border-t border-[#222] space-y-3">
      <div>
        <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Frame</label>
        <div className="flex flex-wrap gap-1">
          {FRAMES.map(f => <Pill key={f} active={frame === f} onClick={e => { e.stopPropagation(); toggleFrame(f); }}>{f}</Pill>)}
        </div>
      </div>

      <div>
        <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Magnification <span className="normal-case tracking-normal text-dim">· up to 2</span></label>
        <div className="flex flex-wrap gap-1">
          {MAGS.map(m => <Pill key={m} active={mags.includes(m)} onClick={e => { e.stopPropagation(); toggleMag(m); }}>{m}</Pill>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">PX</label>
          <div className="flex gap-1">
            <Pill active={px === true} onClick={e => { e.stopPropagation(); setPx(px === true ? null : true); }}>Yes</Pill>
            <Pill active={px === false} onClick={e => { e.stopPropagation(); setPx(px === false ? null : false); }}>No</Pill>
          </div>
        </div>
        <div>
          <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Value (£)</label>
          <input
            value={value}
            onChange={e => setValue(e.target.value.replace(/[^\d.]/g, ''))}
            onClick={e => e.stopPropagation()}
            placeholder="—"
            className="w-full bg-[#0A0A0A] border border-[#222] rounded-md px-2 py-1 text-xs text-white placeholder:text-dim outline-none focus:border-[#444] tabular-nums"
          />
        </div>
      </div>

      <div>
        <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Headlight</label>
        <div className="flex flex-wrap gap-1">
          {HEADLIGHTS.map(h => <Pill key={h} active={headlight === h} onClick={e => { e.stopPropagation(); toggleHeadlight(h); }}>{h}</Pill>)}
        </div>
      </div>

      <div>
        <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onClick={e => e.stopPropagation()}
          rows={2}
          placeholder="Anything to remember..."
          className="w-full bg-[#0A0A0A] border border-[#222] rounded-md px-2 py-1.5 text-xs text-white placeholder:text-dim outline-none focus:border-[#444] resize-none"
        />
      </div>

      <div>
        <label className="text-[9px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Follow-up date</label>
        <input
          type="date"
          value={followUpDate}
          onChange={e => setFollowUpDate(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="bg-[#0A0A0A] border border-[#222] rounded-md px-2 py-1 text-xs text-white outline-none focus:border-[#444]"
        />
      </div>

      {error && <div className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 px-3 py-1.5 rounded-md bg-white text-black text-xs font-semibold disabled:opacity-30 hover:bg-white/90 transition"
        >{saving ? 'Saving...' : 'Save'}</button>
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="px-3 py-1.5 rounded-md text-xs text-dim hover:text-white"
        >Cancel</button>
      </div>
    </div>
  );
}

// ============================================================================
// Collapsible section
// ============================================================================
function CollapsibleSection({
  title, valueTag, color, collapsed, onToggle, children,
}: {
  title: string;
  valueTag: string | null;
  color: 'emerald' | 'red';
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const accent = color === 'emerald' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="mt-6 rounded-2xl border border-[#1A1A1A] bg-surface overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${accent}`}>{title}</span>
          {valueTag && <span className={`text-xs ${accent}`}>{valueTag}</span>}
        </div>
        <span className="text-dim text-xs">{collapsed ? '▾' : '▴'}</span>
      </button>
      {!collapsed && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// Add card modal
// ============================================================================
function AddCardModal({ onClose, onAdded }: { onClose: () => void; onAdded: (c: BoardCard) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [mags, setMags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [value, setValue] = useState('');
  const [column, setColumn] = useState<Column>('interested');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMag = (m: string) => {
    setMags(prev => prev.includes(m) ? prev.filter(x => x !== m) : prev.length >= 2 ? [...prev.slice(1), m] : [...prev, m]);
  };

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          country: country.trim() || null,
          magnification: mags,
          notes: notes.trim(),
          column,
          value: value ? Number(value) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
      onAdded(data.card);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-[#0F0F0F] border border-[#222] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Add to Closing Board</h2>
          <button onClick={onClose} className="text-dim hover:text-white text-lg leading-none">×</button>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Fabian Meinke"
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49 163 1300043"
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333]" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Country</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Germany"
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333]" />
          </div>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Magnification <span className="normal-case tracking-normal text-dim">· up to 2</span></label>
          <div className="flex flex-wrap gap-1.5">
            {MAGS.map(m => (
              <button key={m} type="button" onClick={() => toggleMag(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${mags.includes(m) ? 'bg-white text-black border-white' : 'border-[#333] text-gray-400 hover:border-[#444] hover:text-white'}`}
              >{m}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="What's the deal status?"
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333] resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Column</label>
            <select value={column} onChange={e => setColumn(e.target.value as Column)}
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#333]">
              {COLUMNS.map(c => <option key={c} value={c}>{COLUMN_META[c].label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-dim mb-1.5 block">Value (£, optional)</label>
            <input value={value} onChange={e => setValue(e.target.value.replace(/[^\d.]/g, ''))} placeholder="3690"
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-dim outline-none focus:border-[#333] tabular-nums" />
          </div>
        </div>

        {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-30 hover:bg-white/90 transition">
            {saving ? 'Saving...' : 'Add to board'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-dim hover:text-white">Cancel</button>
        </div>
      </div>
    </div>
  );
}
