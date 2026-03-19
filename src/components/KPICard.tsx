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

export default function KPICard({ title, value, subtitle, status = 'default', loading, href, badge }: KPICardProps) {
  const dotColor = {
    default: 'bg-white/20',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[status];

  const content = (
    <div className={`rounded-card border border-subtle bg-surface p-6 transition-all duration-200 hover:border-subtle-hover ${href ? 'cursor-pointer hover:bg-surface-hover' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        {status !== 'default' && (
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        )}
        <p className="text-xs font-medium uppercase tracking-heading text-muted">{title}</p>
        {badge && (
          <span className="ml-auto text-[10px] text-dim border border-subtle rounded-full px-2 py-0.5">{badge}</span>
        )}
      </div>
      {loading ? (
        <div className="h-12 w-20 bg-subtle rounded-lg animate-pulse" />
      ) : (
        <p className="text-kpi-sm lg:text-kpi text-white tabular-nums">{value}</p>
      )}
      {subtitle && <p className="text-[11px] text-dim mt-3 leading-relaxed">{subtitle}</p>}
      {href && (
        <p className="text-[11px] text-muted mt-3 opacity-0 group-hover:opacity-100 transition-opacity">View details</p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="group">{content}</Link>;
  }
  return content;
}
