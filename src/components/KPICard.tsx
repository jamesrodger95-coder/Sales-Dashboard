'use client';

import Link from 'next/link';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: 'default' | 'success' | 'warning' | 'danger';
  loading?: boolean;
  href?: string;
  badge?: string;
}

const accentBorder = {
  default: 'border-b-white/10',
  success: 'border-b-success/40',
  warning: 'border-b-warning/40',
  danger: 'border-b-danger/40',
};

export default function KPICard({ title, value, subtitle, status = 'default', loading, href, badge }: KPICardProps) {
  const content = (
    <div className={`rounded-2xl border border-[#1A1A1A] border-b-2 ${accentBorder[status]} bg-surface p-6 transition-all duration-200 hover:border-[#222] ${href ? 'cursor-pointer hover:bg-surface-hover' : ''}`}>
      {loading ? (
        <>
          <div className="skeleton h-3 w-20 mb-5" />
          <div className="skeleton h-12 w-16" />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555]">{title}</p>
            {badge && (
              <span className="ml-auto text-[9px] text-dim border border-subtle rounded-full px-1.5 py-0.5">{badge}</span>
            )}
          </div>
          <p className="text-[3.2rem] leading-none font-light text-white tabular-nums tracking-tight">{value}</p>
          {subtitle && <p className="text-[11px] text-dim mt-3 leading-relaxed">{subtitle}</p>}
        </>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="group">{content}</Link>;
  }
  return content;
}
