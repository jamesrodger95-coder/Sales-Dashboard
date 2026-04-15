'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/calls', label: 'Calls' },
  { href: '/reports', label: 'Reports' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/conversions', label: 'Conversions' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/briefing', label: 'Briefing' },
];

export default function TopNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }));
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-[#E5E5E5]">
        <div className="h-full max-w-[1400px] mx-auto px-6 flex items-center justify-between">

          {/* Left: Logo — SVG monogram + text matching brand identity */}
          <Link href="/" className="flex-shrink-0">
            <span className="text-[22px] font-bold text-black tracking-[-0.02em]">
              Bryant Dental<span className="text-black">.</span>
            </span>
          </Link>

          {/* Center: Tabs */}
          <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2 h-full">
            {navItems.map(item => {
              const isActive = pathname === item.href ||
                (item.href === '/reports' && pathname === '/prep');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    relative h-full flex items-center text-sm font-medium transition-colors duration-200
                    ${isActive ? 'text-black' : 'text-[#999999] hover:text-black'}
                  `}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-black" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: Jarvis + Date + mobile toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open'))}
              className="group flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-[#E5E5E5] hover:border-black transition-colors"
              title="Open Jarvis voice mode (Ctrl+J)"
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 animate-ping opacity-60" />
                <span className="relative rounded-full w-1.5 h-1.5 bg-gradient-to-br from-blue-400 to-purple-500" />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-black">Jarvis</span>
            </button>
            <span className="text-xs text-[#AAAAAA] tabular-nums hidden sm:block">{dateStr}</span>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-[#999999] hover:text-black transition-colors"
              aria-label="Toggle menu"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                {mobileOpen ? (
                  <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M2 5.5H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M2 9H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M2 12.5H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-14 left-0 right-0 z-50 bg-white border-b border-[#E5E5E5] md:hidden">
            <nav className="py-2 px-4">
              {navItems.map(item => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      block py-3 text-sm font-medium border-b border-[#F0F0F0] last:border-0 transition-colors
                      ${isActive ? 'text-black' : 'text-[#999999]'}
                    `}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
