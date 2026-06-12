'use client';

import { useState } from 'react';

interface CallInfo {
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
}

interface Props {
  call: CallInfo;
  isOnBoard: boolean;
  onAdded: (call: CallInfo) => void;
  size?: 'sm' | 'xs';
}

// Small "+ Board" button used on call rows. Adds the lead to the Closing Board
// in the Interested column with just name + phone + email + country — no
// product fields required. Once added, flips to "On Board" and disables.
export default function AddToBoardButton({ call, isOnBoard, onAdded, size = 'sm' }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]';

  if (isOnBoard) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${padding} rounded-full font-medium border bg-emerald-400/10 text-emerald-400/70 border-emerald-400/20 cursor-default`}
        title="Already on Closing Board"
      >
        <span className="w-1 h-1 rounded-full bg-current" />
        On Board
      </span>
    );
  }

  const add = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: call.name,
          email: call.email || null,
          phone: call.phone || null,
          country: call.country || null,
          column: 'interested',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
      onAdded(call);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={add}
      disabled={saving}
      title={error || 'Add to Closing Board (no product info required)'}
      className={`inline-flex items-center gap-1 ${padding} rounded-full font-medium border transition-colors ${
        error
          ? 'border-red-400/30 text-red-400 bg-red-400/10'
          : 'border-data-blue/30 text-data-blue hover:bg-data-blue/10 hover:border-data-blue/50'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {saving ? '...' : error ? 'Retry' : '+ Board'}
    </button>
  );
}
