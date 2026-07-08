'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/ops', label: 'Home' },
  { href: '/ops/measurements', label: 'Measurements' },
  { href: '/ops/production', label: 'Production' },
  { href: '/ops/post-delivery', label: 'Post-Delivery' },
];

export default function OpsNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-[#0A0A0A]/95 backdrop-blur border-b border-emerald-400/20">
      <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center justify-between gap-4">
        <Link href="/ops" className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="text-white font-bold tracking-tight text-[15px]">
            Bryant Dental <span className="text-emerald-400">Operations</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/40'
                    : 'text-muted border border-transparent hover:text-white hover:border-[#333]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
