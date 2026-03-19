'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/calls', label: 'Calls' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/reports', label: 'Agents' },
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
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <svg width="32" height="28" viewBox="0 0 64 52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="bd monogram">
              <path d="M16 4C16 4 16 20 16 28C16 36.837 23.163 44 32 44C36.418 44 40.418 42.209 43.314 39.314" stroke="black" strokeWidth="7" strokeLinecap="round" />
              <path d="M48 4C48 4 48 20 48 28C48 36.837 40.837 44 32 44C27.582 44 23.582 42.209 20.686 39.314" stroke="black" strokeWidth="7" strokeLinecap="round" />
              <circle cx="10" cy="6" r="5" fill="black" />
              <circle cx="54" cy="6" r="5" fill="black" />
            </svg>
            <span className="text-[17px] font-bold text-black tracking-[-0.01em]">
              Bryant Dental<span className="text-[#999]">.</span>
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

          {/* Right: Date + mobile toggle */}
          <div className="flex items-center gap-4">
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
