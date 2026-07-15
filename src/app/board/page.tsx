'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { whatsappHref } from '@/lib/ops-utils';

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
      const activeCards = Array.isArray(a.cards) ? a.cards : [];
      const wonCards = Array.isArray(w.cards) ? w.cards : [];
      const lostCards = Array.isArray(l.cards) ? l.cards : [];
      setActive(activeCards);
      setWon(wonCards);
      setLost(lostCards);
      // Mirror to localStorage as a browser-side backup — survives the server
      // losing its state (ephemeral /tmp on Vercel between deploys). This is a
      // safety net; the server / KV remains source of truth on read.
      try {
        localStorage.setItem('bd-board-cards', JSON.stringify({
          active: activeCards, won: wonCards, lost: lostCards,
          savedAt: new Date().toISOString(),
        }));
      } catch { /* quota exceeded or private mode — ignore */ }
    } catch (err) {
      console.error(err);
      // Server unreachable — fall back to whatever the browser last saw.
      try {
        const raw = localStorage.getItem('bd-board-cards');
        if (raw) {
          const cached = JSON.parse(raw);
          setActive(Array.isArray(cached.active) ? cached.active : []);
          setWon(Array.isArray(cached.won) ? cached.won : []);
          setLost(Array.isArray(cached.lost) ? cached.lost : []);
          setError(`Server unreachable — showing browser backup from ${cached.savedAt ? new Date(cached.savedAt).toLocaleString('en-GB') : 'earlier'}`);
        } else {
          setError('Could not load board.');
        }
      } catch {
        setError('Could not load board.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Export all board data as a downloadable JSON file
  const exportBoard = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      active,
      won,
      lost,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bd-board-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [active, won, lost]);

  // Import a backup file — creates new cards (server assigns fresh IDs) so
  // existing cards aren't disturbed. If James wants a true restore he can
  // delete active cards first, then import.
  const importInputRef = useRef<HTMLInputElement>(null);
  const importBoard = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cardsToImport: BoardCard[] = [
        ...(Array.isArray(parsed.active) ? parsed.active : []),
        ...(Array.isArray(parsed.won) ? parsed.won : []),
        ...(Array.isArray(parsed.lost) ? parsed.lost : []),
        ...(Array.isArray(parsed) ? parsed : []),
      ];
      if (cardsToImport.length === 0) throw new Error('No cards found in that file.');
      const confirmed = confirm(`Import ${cardsToImport.length} card(s)? They will be added to the board with fresh IDs (existing cards untouched).`);
      if (!confirmed) return;
      // POST each card sequentially — cheap for ~50 cards, avoids overwhelming
      // the API. Skip Won/Lost outcome flags on import so they land in the
      // Interested column and James can review before marking outcomes.
      let ok = 0, failed = 0;
      for (const c of cardsToImport) {
        try {
          const res = await fetch('/api/board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: c.name,
              phone: c.phone,
              email: c.email,
              country: c.country,
              frame: c.frame,
              magnification: c.magnification,
              px: c.px,
              headlight: c.headlight,
              notes: c.notes,
              column: c.column || 'interested',
              value: c.value,
              followUpDate: c.followUpDate,
            }),
          });
          if (res.ok) ok++; else failed++;
        } catch { failed++; }
      }
      await load();
      alert(`Imported ${ok} card(s). ${failed > 0 ? `${failed} failed — check console.` : ''}`);
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }, [load]);

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
          <p className="text-xs text-gray-400 mt-1">Manually curated. Drag cards between columns as deals progress.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportBoard}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-[#333] text-gray-200 hover:text-white hover:border-[#555] transition"
            title="Download a JSON backup of every card"
          >Export Board</button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-[#333] text-gray-200 hover:text-white hover:border-[#555] transition"
            title="Restore cards from a JSON backup"
          >Import Board</button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) importBoard(file);
              e.target.value = ''; // let the user re-select the same file later
            }}
          />
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition"
          >+ Add Lead</button>
        </div>
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
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-200">{meta.label}</h3>
                <span className="text-xs font-semibold text-white bg-white/10 rounded-full px-2 py-0.5 tabular-nums">{cards.length}</span>
              </div>
              <p className="text-[10px] text-gray-400 mb-2 px-1">{meta.tag}</p>

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
              <div key={c.id} className="text-xs text-gray-200 py-2 px-3 border-b border-[#1A1A1A] last:border-0 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-white font-medium">{c.name}</span>
                {c.country && <span className="text-gray-300">{c.country}</span>}
                {c.magnification.length > 0 && <span className="text-gray-300">{c.magnification.join(' / ')}</span>}
                {c.px && <span className="text-gray-300">PX</span>}
                {typeof c.value === 'number' && c.value > 0 && <span className="text-emerald-400 tabular-nums">{formatGBP(c.value)}</span>}
                <span className="ml-auto text-gray-400">Won {c.wonAt ? new Date(c.wonAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
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
              <div key={c.id} className="text-xs text-gray-200 py-2 px-3 border-b border-[#1A1A1A] last:border-0 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-white font-medium">{c.name}</span>
                {c.country && <span className="text-gray-300">{c.country}</span>}
                {c.magnification.length > 0 && <span className="text-gray-300">{c.magnification.join(' / ')}</span>}
                <span className="text-gray-400">Lost {c.lostAt ? new Date(c.lostAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                {c.lostReason && <span className="text-gray-400 italic">&ldquo;{c.lostReason}&rdquo;</span>}
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
          <p className="text-[15px] font-semibold text-white leading-tight truncate">{card.name}</p>
          {/* Phone — prominent second line, WhatsApp-tappable */}
          {card.phone && (
            <a
              href={whatsappHref(card.phone) || `tel:${card.phone.replace(/\s/g, '')}`}
              target={whatsappHref(card.phone) ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={stop}
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-mono tabular-nums text-[#25D366] hover:text-[#34D399] transition-colors"
              title="Open in WhatsApp"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
              </svg>
              {card.phone}
            </a>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {card.country && <span className="text-[11px] text-gray-300">{card.country}</span>}
            {card.px && <span className="text-[10px] px-1.5 py-0.5 rounded bg-data-blue/20 text-data-blue font-semibold">PX</span>}
          </div>
        </div>
        <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition shrink-0">{expanded ? '▴' : '▾'}</span>
      </div>

      {cfg && <p className="text-[12px] text-white mt-2 truncate">{cfg}</p>}
      {card.notes && !expanded && <p className="text-[11px] text-gray-400 italic mt-1 line-clamp-2">&ldquo;{card.notes}&rdquo;</p>}

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
