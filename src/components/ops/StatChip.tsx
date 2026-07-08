'use client';

interface Props {
  label: string;
  value: number | string;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent';
  sub?: string;
}

const TONE = {
  default: 'text-white',
  good:    'text-emerald-400',
  warn:    'text-amber-400',
  bad:     'text-red-400',
  accent:  'text-emerald-300',
};

export default function StatChip({ label, value, tone = 'default', sub }: Props) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-semibold tracking-[0.15em] uppercase text-dim">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${TONE[tone]}`}>{value}</span>
      {sub && <span className="text-[10px] text-dim mt-0.5">{sub}</span>}
    </div>
  );
}
