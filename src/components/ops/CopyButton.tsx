'use client';

import { useState } from 'react';

interface Props {
  value: string | null | undefined;
  label: string;
  size?: 'sm' | 'md';
}

export default function CopyButton({ value, label, size = 'sm' }: Props) {
  const [copied, setCopied] = useState(false);
  const disabled = !value;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — copy failed silently
    }
  };

  const padding = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-[11px]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${padding} rounded-md border border-[#333] text-muted hover:border-[#555] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
      title={disabled ? 'Nothing to copy' : `Copy ${label.toLowerCase()}`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}
