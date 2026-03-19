'use client';

interface DateRangePickerProps {
  value: string;
  onChange: (range: string) => void;
  options?: { label: string; value: string }[];
  size?: 'sm' | 'md';
}

const DEFAULT_OPTIONS = [
  { label: 'This Month', value: '1m' },
  { label: '30 Days', value: '30d' },
  { label: '3 Months', value: '3m' },
  { label: '6 Months', value: '6m' },
];

export default function DateRangePicker({ value, onChange, options = DEFAULT_OPTIONS, size = 'md' }: DateRangePickerProps) {
  const px = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`${px} rounded-lg font-medium transition-all duration-200 ${
            value === opt.value
              ? 'bg-white text-black'
              : 'text-dim hover:text-muted border border-transparent hover:border-subtle'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
