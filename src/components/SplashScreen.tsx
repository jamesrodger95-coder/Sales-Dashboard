'use client';

import { useState, useEffect } from 'react';

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1500);
    const hideTimer = setTimeout(() => setVisible(false), 2000);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center transition-opacity duration-500 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <span className="splash-text text-[26px] font-bold text-black tracking-[-0.02em]">
        Bryant Dental.
      </span>
      <span className="splash-sub text-sm font-medium tracking-[0.2em] uppercase text-[#AAAAAA] mt-2">
        Sales Intelligence
      </span>
    </div>
  );
}
