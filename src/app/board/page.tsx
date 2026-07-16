'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { whatsappHref } from '@/lib/ops-utils';

// ============================================================================
// Types
// ============================================================================
type Column = 'interested' | 'quoted' | 'deciding' | 'closing';
type Filter = 'all' | Column | 'won' | 'lost';
type SortKey = 'status' | 'name' | 'country' | 'followUp' | 'added';

const COLUMNS: Column[] = ['interested', 'quoted', 'deciding', 'closing'];
const MAGS = ['2.9x', '3.8x', '5.7x', '7.8x', 'MagniFlex'];

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

// ============================================================================
// Meta — colours, labels, sort priority
// ============================================================================
const STATUS_META: Record<Column | 'won' | 'lost', {
  label: string;
  pill: string;    // classes for the pill background + text
  dot: string;     // matching dot colour for the filter tab
  border: string;  // left border tint for rows in this state
}> = {
  interested: { label: 'Interested', pill: 'bg-[#60A5FA]/15 text-[#60A5FA] border-[#60A5FA]/40', dot: 'bg-[#60A5FA]', border: 'border-l-[#60A5FA]/40' },
  quoted:     { label: 'Quoted',     pill: 'bg-[#A78BFA]/15 text-[#A78BFA] border-[#A78BFA]/40', dot: 'bg-[#A78BFA]', border: 'border-l-[#A78BFA]/40' },
  deciding:   { label: 'Deciding',   pill: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/40', dot: 'bg-[#F59E0B]', border: 'border-l-[#F59E0B]/40' },
  closing:    { label: 'Closing',    pill: 'bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40', dot: 'bg-[#34D399]', border: 'border-l-[#34D399]/40' },
  won:        { label: 'Won',        pill: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/50', dot: 'bg-emerald-400', border: 'border-l-emerald-400/40' },
  lost:       { label: 'Lost',       pill: 'bg-red-400/15 text-red-400 border-red-400/40',           dot: 'bg-red-400', border: 'border-l-red-400/40' },
};

// Sort priority for default order — closest to sale at top.
const STATUS_RANK: Record<Column, number> = { closing: 0, deciding: 1, quoted: 2, interested: 3 };

// ============================================================================
// Helpers
// ============================================================================
function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

// Compact product string: "Rect · 5.7x · Pro · PX" instead of "Rectangular · 5.7x · Ignis 4 Pro · PX".
// Abbreviations chosen so the whole config fits a narrow column.
function productShort(card: BoardCard): string {
  const parts: string[] = [];
  const frameShort = card.frame === 'Rectangular' ? 'Rect'
    : card.frame === 'Rounded' ? 'Round'
    : null; // "Not Sure" and null skipped
  if (frameShort) parts.push(frameShort);
  if (card.magnification.length > 0) parts.push(card.magnification.join(' / '));
  const headlightShort = card.headlight === 'Ignis 4 Pro' ? 'Pro'
    : card.headlight === 'Ignis 4 Lite' ? 'Lite'
    : card.headlight === 'Halo' ? 'Halo'
    : null; // "None" and null skipped
  if (headlightShort) parts.push(headlightShort);
  if (card.px) parts.push('PX');
  return parts.length > 0 ? parts.join(' · ') : '—';
}

// Follow-up display state — controls text + tone in the Follow Up column.
function followUpMeta(dateStr: string | null): { text: string; tone: 'overdue' | 'today' | 'future' | 'none' } {
  if (!dateStr) return { text: '—', tone: 'none' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dateStr);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dDays = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
  const display = due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (dDays < 0) {
    const late = Math.abs(dDays);
    return { text: `${late}d overdue`, tone: 'overdue' };
  }
  if (dDays === 0) return { text: 'Today', tone: 'today' };
  return { text: display, tone: 'future' };
}

// Date-input value (YYYY-MM-DD) from a stored ISO string.
function dateInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================================
// Page
// ============================================================================
export default function BoardPage() {
  const [active, setActive] = useState<BoardCard[]>([]);
  const [won, setWon] = useState<BoardCard[]>([]);
  const [lost, setLost] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortAsc, setSortAsc] = useState(true);

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
      try {
        localStorage.setItem('bd-board-cards', JSON.stringify({
          active: activeCards, won: wonCards, lost: lostCards,
          savedAt: new Date().toISOString(),
        }));
      } catch { /* private mode / quota — ignore */ }
    } catch (err) {
      console.error(err);
      // Fall back to whatever the browser last saw
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

  // ============================================================================
  // Mutations — optimistic where possible, refetch on error
  // ============================================================================
  const moveTo = useCallback(async (id: string, col: Column) => {
    setActive(prev => prev.map(c => c.id === id ? { ...c, column: col, movedAt: new Date().toISOString() } : c));
    try {
      await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: col }),
      });
    } catch { load(); }
  }, [load]);

  const markWon = useCallback(async (id: string) => {
    const card = active.find(c => c.id === id);
    setActive(prev => prev.filter(c => c.id !== id));
    try {
      const res = await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'won' }),
      });
      const data = await res.json();
      if (data.card) setWon(prev => [data.card, ...prev]);
      else if (card) setWon(prev => [{ ...card, outcome: 'won', wonAt: new Date().toISOString() }, ...prev]);
    } catch { load(); }
  }, [active, load]);

  const markLost = useCallback(async (id: string) => {
    const reason = window.prompt('Lost reason (optional):', '') || '';
    const card = active.find(c => c.id === id);
    setActive(prev => prev.filter(c => c.id !== id));
    try {
      const res = await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'lost', lostReason: reason.trim() }),
      });
      const data = await res.json();
      if (data.card) setLost(prev => [data.card, ...prev]);
      else if (card) setLost(prev => [{ ...card, outcome: 'lost', lostAt: new Date().toISOString(), lostReason: reason.trim() }, ...prev]);
    } catch { load(); }
  }, [active, load]);

  const removeCard = useCallback(async (id: string) => {
    if (!confirm('Remove this card from the board?')) return;
    setActive(prev => prev.filter(c => c.id !== id));
    setWon(prev => prev.filter(c => c.id !== id));
    setLost(prev => prev.filter(c => c.id !== id));
    try { await fetch(`/api/board/${id}`, { method: 'DELETE' }); }
    catch { load(); }
  }, [load]);

  // Generic patch — used for notes edit + follow-up date edit
  const updateCard = useCallback(async (id: string, patch: Partial<BoardCard>) => {
    setActive(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    try {
      await fetch(`/api/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch { load(); }
  }, [load]);

  // ============================================================================
  // Export / Import
  // ============================================================================
  const exportBoard = useCallback(() => {
    const payload = { exportedAt: new Date().toISOString(), active, won, lost };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bd-board-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [active, won, lost]);

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
      if (!confirm(`Import ${cardsToImport.length} card(s)? They will be added with fresh IDs (existing cards untouched).`)) return;
      let ok = 0, failed = 0;
      for (const c of cardsToImport) {
        try {
          const res = await fetch('/api/board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: c.name, phone: c.phone, email: c.email, country: c.country,
              frame: c.frame, magnification: c.magnification, px: c.px, headlight: c.headlight,
              notes: c.notes, column: c.column || 'interested', value: c.value, followUpDate: c.followUpDate,
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

  // ============================================================================
  // Filtered + sorted rows
  // ============================================================================
  const counts = useMemo(() => {
    const c: Record<Column, number> = { interested: 0, quoted: 0, deciding: 0, closing: 0 };
    for (const card of active) c[card.column]++;
    return c;
  }, [active]);

  const rows: BoardCard[] = useMemo(() => {
    let source: BoardCard[];
    if (filter === 'won') source = won;
    else if (filter === 'lost') source = lost;
    else if (filter === 'all') source = active;
    else source = active.filter(c => c.column === filter);

    const sorted = [...source];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'country') cmp = (a.country || 'zzz').localeCompare(b.country || 'zzz');
      else if (sortKey === 'followUp') {
        // Nulls last regardless of direction; overdue first (smallest dates)
        if (!a.followUpDate && !b.followUpDate) cmp = 0;
        else if (!a.followUpDate) cmp = 1;
        else if (!b.followUpDate) cmp = -1;
        else cmp = new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime();
      }
      else if (sortKey === 'added') cmp = new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      else {
        // 'status' — default: closing → deciding → quoted → interested, then follow-up urgency
        if (filter === 'won' || filter === 'lost') {
          cmp = new Date(b.wonAt || b.lostAt || b.addedAt).getTime() - new Date(a.wonAt || a.lostAt || a.addedAt).getTime();
        } else {
          const ra = STATUS_RANK[a.column]; const rb = STATUS_RANK[b.column];
          cmp = ra - rb;
          if (cmp === 0) {
            // Both same status → by follow-up urgency (nulls last)
            if (!a.followUpDate && !b.followUpDate) cmp = 0;
            else if (!a.followUpDate) cmp = 1;
            else if (!b.followUpDate) cmp = -1;
            else cmp = new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime();
          }
        }
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [filter, sortKey, sortAsc, active, won, lost]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const totalActive = active.length;
  const wonValue = won.reduce((s, c) => s + (c.value || 0), 0);

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="px-5 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Closing Board</h1>
          <p className="text-xs text-gray-400 mt-1">Manually curated. Click the status pill to move a card.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportBoard} className="px-3 py-2 rounded-xl text-xs font-medium border border-[#333] text-gray-200 hover:text-white hover:border-[#555] transition" title="Download JSON backup">Export</button>
          <button onClick={() => importInputRef.current?.click()} className="px-3 py-2 rounded-xl text-xs font-medium border border-[#333] text-gray-200 hover:text-white hover:border-[#555] transition" title="Restore from JSON">Import</button>
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importBoard(f); e.target.value = ''; }} />
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition">+ Add</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="rounded-xl border border-[#1A1A1A] bg-surface px-4 py-3 mb-4 text-xs text-gray-300 flex flex-wrap gap-x-5 gap-y-2 items-center">
        <span>Board: <span className="text-white font-semibold tabular-nums">{totalActive}</span> active</span>
        <span className="text-[#333]">·</span>
        <span>Won this month: <span className="text-emerald-400 font-semibold tabular-nums">{won.length}</span>{wonValue > 0 && <span className="text-emerald-400/70"> ({formatGBP(wonValue)})</span>}</span>
        <span className="text-[#333]">·</span>
        <span>Lost: <span className="text-red-400 font-semibold tabular-nums">{lost.length}</span></span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-400/10 text-xs text-amber-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline whitespace-nowrap">Retry</button>
        </div>
      )}

      {/* Filter tabs — same visual language as the calls page month tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <FilterTab label="All"          count={totalActive}      active={filter === 'all'}        onClick={() => setFilter('all')} />
        <FilterTab label="Interested"   count={counts.interested} active={filter === 'interested'} onClick={() => setFilter('interested')} dotColor={STATUS_META.interested.dot} />
        <FilterTab label="Quoted"       count={counts.quoted}     active={filter === 'quoted'}     onClick={() => setFilter('quoted')}     dotColor={STATUS_META.quoted.dot} />
        <FilterTab label="Deciding"     count={counts.deciding}   active={filter === 'deciding'}   onClick={() => setFilter('deciding')}   dotColor={STATUS_META.deciding.dot} />
        <FilterTab label="Closing"      count={counts.closing}    active={filter === 'closing'}    onClick={() => setFilter('closing')}    dotColor={STATUS_META.closing.dot} />
        <span className="h-6 w-px bg-[#222] mx-1" aria-hidden="true" />
        <FilterTab label="Won"          count={won.length}        active={filter === 'won'}        onClick={() => setFilter('won')}        dotColor={STATUS_META.won.dot} />
        <FilterTab label="Lost"         count={lost.length}       active={filter === 'lost'}       onClick={() => setFilter('lost')}       dotColor={STATUS_META.lost.dot} />
      </div>

      {/* Table */}
      <div className="rounded-card border border-subtle bg-surface overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-0">
            {[...Array(8)].map((_, i) => <div key={i} className="h-11 bg-subtle/40 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            {filter === 'all' ? 'No cards on the board. Click + Add to get started.' : `Nothing in ${filter}.`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-subtle">
                <SortHeader label="#" align="left" className="w-10 pl-6" />
                <SortHeader label="Name"      onClick={() => toggleSort('name')}     active={sortKey === 'name'}     asc={sortAsc} />
                <SortHeader label="Phone"     className="hidden sm:table-cell" />
                <SortHeader label="Country"   onClick={() => toggleSort('country')}  active={sortKey === 'country'}  asc={sortAsc} className="hidden md:table-cell" />
                <SortHeader label="Product"   className="hidden md:table-cell" />
                <SortHeader label="Status"    onClick={() => toggleSort('status')}   active={sortKey === 'status'}   asc={sortAsc} />
                <SortHeader label="Follow Up" onClick={() => toggleSort('followUp')} active={sortKey === 'followUp'} asc={sortAsc} className="hidden lg:table-cell" />
                <SortHeader label="Notes"     className="hidden lg:table-cell" />
                <SortHeader label=""          className="pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((card, i) => (
                <Row
                  key={card.id}
                  index={i + 1}
                  card={card}
                  onMoveTo={moveTo}
                  onWon={markWon}
                  onLost={markLost}
                  onRemove={removeCard}
                  onPatch={updateCard}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

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
// FilterTab — the pill-shaped "All (44)" / "Closing (4)" chips at the top
// ============================================================================
function FilterTab({
  label, count, active, onClick, dotColor,
}: { label: string; count: number; active: boolean; onClick: () => void; dotColor?: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors flex items-center gap-1.5 ${
        active ? 'bg-white text-black border-white' : 'text-gray-300 border-[#333] hover:text-white hover:border-[#555]'
      }`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {label}
      <span className={`tabular-nums ${active ? 'text-black/60' : 'text-gray-500'}`}>({count})</span>
    </button>
  );
}

// ============================================================================
// SortHeader
// ============================================================================
function SortHeader({
  label, onClick, active, asc, align = 'left', className = '',
}: { label: string; onClick?: () => void; active?: boolean; asc?: boolean; align?: 'left' | 'right'; className?: string }) {
  const base = `py-3 text-[11px] font-medium uppercase tracking-heading text-dim ${align === 'right' ? 'text-right' : ''} ${className}`;
  if (!onClick) return <th className={base}>{label}</th>;
  return (
    <th className={base}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-white transition-colors ${active ? 'text-white' : ''}`}>
        {label}
        {active && <span className="text-[9px]">{asc ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

// ============================================================================
// Row — one card as a slim table row
// ============================================================================
function Row({
  index, card, onMoveTo, onWon, onLost, onRemove, onPatch,
}: {
  index: number;
  card: BoardCard;
  onMoveTo: (id: string, col: Column) => void;
  onWon: (id: string) => void;
  onLost: (id: string) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, patch: Partial<BoardCard>) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(card.notes || '');
  const [editingDate, setEditingDate] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // Close the status popover on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [statusOpen]);

  const stateKey = card.outcome || card.column;
  const meta = STATUS_META[stateKey as Column | 'won' | 'lost'];
  const fu = followUpMeta(card.followUpDate);
  const rowBorder = fu.tone === 'overdue' ? 'border-l-2 border-l-red-400/60'
    : card.column === 'closing' && !card.outcome ? 'border-l-2 border-l-emerald-400/60'
    : 'border-l-2 border-l-transparent';

  const commitNotes = () => {
    const next = notesDraft.trim();
    if (next !== card.notes) onPatch(card.id, { notes: next });
    setEditingNotes(false);
  };
  const commitDate = (value: string) => {
    const iso = value ? new Date(value + 'T12:00:00').toISOString() : null;
    onPatch(card.id, { followUpDate: iso });
    setEditingDate(false);
  };

  const cleanPhone = card.phone ? card.phone.replace(/\s/g, '') : '';

  const isTerminal = !!card.outcome;

  return (
    <tr className={`transition-colors hover:bg-white/[0.03] ${index % 2 === 0 ? '' : 'bg-white/[0.02]'} ${rowBorder}`}>
      <td className="py-2.5 pl-6 pr-2 text-gray-500 tabular-nums text-xs">{index}</td>

      {/* Name */}
      <td className="py-2.5 pr-2">
        <div className="text-white font-medium truncate">{card.name}</div>
        {/* On mobile the Phone column is hidden — surface the phone here as a WhatsApp link */}
        {card.phone && (
          <div className="sm:hidden mt-0.5">
            <PhoneLink phone={card.phone} />
          </div>
        )}
      </td>

      {/* Phone — WhatsApp link */}
      <td className="py-2.5 pr-2 hidden sm:table-cell">
        {card.phone ? <PhoneLink phone={card.phone} /> : <span className="text-gray-500">—</span>}
      </td>

      {/* Country */}
      <td className="py-2.5 pr-2 text-gray-300 hidden md:table-cell">{card.country || <span className="text-gray-500">—</span>}</td>

      {/* Product */}
      <td className="py-2.5 pr-2 text-white hidden md:table-cell">{productShort(card)}</td>

      {/* Status pill (clickable) */}
      <td className="py-2.5 pr-2 relative">
        <div ref={statusRef} className="inline-block">
          <button
            onClick={() => !isTerminal && setStatusOpen(o => !o)}
            disabled={isTerminal}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${meta.pill} ${isTerminal ? 'cursor-default opacity-90' : 'cursor-pointer hover:bg-opacity-25'}`}
            title={isTerminal ? '' : 'Change status'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
            {!isTerminal && <span className="text-[8px] opacity-70">▾</span>}
          </button>
          {statusOpen && !isTerminal && (
            <div className="absolute z-30 left-0 top-full mt-1 min-w-[160px] rounded-xl bg-[#0F0F0F] border border-[#222] shadow-xl py-1">
              {COLUMNS.map(col => {
                const cm = STATUS_META[col];
                const isCurrent = col === card.column;
                return (
                  <button
                    key={col}
                    onClick={() => { setStatusOpen(false); if (!isCurrent) onMoveTo(card.id, col); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/5 ${isCurrent ? 'text-gray-500' : 'text-gray-200'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cm.dot}`} />
                    {cm.label}
                    {isCurrent && <span className="ml-auto text-[9px] text-gray-500">current</span>}
                  </button>
                );
              })}
              <div className="my-1 h-px bg-[#222]" />
              <button onClick={() => { setStatusOpen(false); onWon(card.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-emerald-400 hover:bg-emerald-400/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Mark as Won
              </button>
              <button onClick={() => { setStatusOpen(false); onLost(card.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-red-400 hover:bg-red-400/10">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />Mark as Lost
              </button>
            </div>
          )}
        </div>
      </td>

      {/* Follow up */}
      <td className="py-2.5 pr-2 hidden lg:table-cell">
        {editingDate ? (
          <input
            type="date"
            defaultValue={dateInputValue(card.followUpDate)}
            autoFocus
            onBlur={e => commitDate(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitDate((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditingDate(false);
            }}
            className="bg-[#0A0A0A] border border-[#222] rounded-md px-2 py-1 text-xs text-white outline-none focus:border-[#444]"
          />
        ) : (
          <button
            onClick={() => setEditingDate(true)}
            title="Click to set follow-up date"
            className={`text-xs hover:underline ${
              fu.tone === 'overdue' ? 'text-red-400 font-semibold'
              : fu.tone === 'today' ? 'text-amber-400 font-semibold'
              : fu.tone === 'future' ? 'text-gray-300'
              : 'text-gray-500'
            }`}
          >{fu.text}</button>
        )}
      </td>

      {/* Notes — click to edit inline */}
      <td className="py-2.5 pr-2 hidden lg:table-cell max-w-[280px]">
        {editingNotes ? (
          <input
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            autoFocus
            onBlur={commitNotes}
            onKeyDown={e => {
              if (e.key === 'Enter') commitNotes();
              if (e.key === 'Escape') { setNotesDraft(card.notes || ''); setEditingNotes(false); }
            }}
            placeholder="Add a note…"
            className="w-full bg-[#0A0A0A] border border-[#222] rounded-md px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none focus:border-[#444]"
          />
        ) : (
          <button
            onClick={() => { setNotesDraft(card.notes || ''); setEditingNotes(true); }}
            title={card.notes || 'Click to add a note'}
            className={`text-left text-xs truncate max-w-full ${card.notes ? 'text-gray-300 hover:text-white' : 'text-gray-500 italic hover:text-gray-300'}`}
          >{card.notes || 'Add note…'}</button>
        )}
      </td>

      {/* Row actions */}
      <td className="py-2 pr-4">
        <div className="flex items-center justify-end gap-1">
          {!isTerminal && (
            <>
              <button
                onClick={() => onWon(card.id)}
                title="Mark as Won"
                className="w-7 h-7 rounded-md border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10 text-xs"
              >✓</button>
              <button
                onClick={() => onLost(card.id)}
                title="Mark as Lost"
                className="w-7 h-7 rounded-md border border-red-400/30 text-red-400 hover:bg-red-400/10 text-xs"
              >✗</button>
            </>
          )}
          <a
            href={card.phone ? `tel:${cleanPhone}` : undefined}
            onClick={e => { if (!card.phone) e.preventDefault(); }}
            title={card.phone ? `Call ${card.phone}` : 'No phone'}
            className={`w-7 h-7 rounded-md border border-[#333] flex items-center justify-center text-xs ${card.phone ? 'text-gray-300 hover:text-white hover:border-[#555]' : 'text-gray-600 opacity-50 pointer-events-none'}`}
            aria-label="Call"
          >☏</a>
          <button
            onClick={() => onRemove(card.id)}
            title="Remove"
            className="w-7 h-7 rounded-md border border-[#333] text-gray-500 hover:text-red-400 hover:border-red-400/40 text-xs"
          >🗑</button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// PhoneLink — the WhatsApp-green phone link used in the Phone column and
// on the mobile-collapsed row.
// ============================================================================
function PhoneLink({ phone }: { phone: string }) {
  const href = whatsappHref(phone);
  if (!href) {
    return <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-gray-300 hover:text-white font-mono tabular-nums text-xs">{phone}</a>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[#25D366] hover:text-[#34D399] font-mono tabular-nums text-xs"
      title="Open WhatsApp"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
      </svg>
      {phone}
    </a>
  );
}

// ============================================================================
// AddCardModal — simplified per spec: Name / Phone / Country / Magnification /
// Status / Notes. Product details (frame, PX, headlight, follow-up date) can
// be added later via inline edits or a subsequent redesign.
// ============================================================================
function AddCardModal({ onClose, onAdded }: { onClose: () => void; onAdded: (c: BoardCard) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [mags, setMags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
      onAdded(data.card);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-[#0F0F0F] border border-[#222] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Add to Closing Board</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 mb-1.5 block">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Dr. Fabian Meinke"
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-[#333]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 mb-1.5 block">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49 163 1300043"
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-[#333]" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 mb-1.5 block">Country</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Germany"
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-[#333]" />
          </div>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 mb-1.5 block">Magnification <span className="normal-case tracking-normal text-gray-500">· up to 2</span></label>
          <div className="flex flex-wrap gap-1.5">
            {MAGS.map(m => (
              <button key={m} type="button" onClick={() => toggleMag(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${mags.includes(m) ? 'bg-white text-black border-white' : 'border-[#333] text-gray-300 hover:border-[#444] hover:text-white'}`}
              >{m}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 mb-1.5 block">Status</label>
          <select value={column} onChange={e => setColumn(e.target.value as Column)}
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#333]">
            {COLUMNS.map(c => <option key={c} value={c}>{STATUS_META[c].label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-gray-400 mb-1.5 block">Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Quick note…"
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-[#333]" />
        </div>

        {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-30 hover:bg-white/90 transition">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white">Cancel</button>
        </div>
      </div>
    </div>
  );
}
