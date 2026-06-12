'use client';

import { useEffect } from 'react';

interface Props {
  message: string | null;
  onClose: () => void;
  tone?: 'success' | 'info' | 'error';
  durationMs?: number;
}

export default function Toast({ message, onClose, tone = 'success', durationMs = 2500 }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onClose]);

  if (!message) return null;

  const cls = tone === 'success'
    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
    : tone === 'error'
      ? 'bg-red-500/15 border-red-400/40 text-red-300'
      : 'bg-data-blue/15 border-data-blue/40 text-data-blue';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
      <div className={`pointer-events-auto px-4 py-2.5 rounded-xl border ${cls} text-sm font-medium shadow-lg backdrop-blur-sm`}>
        {message}
      </div>
    </div>
  );
}
