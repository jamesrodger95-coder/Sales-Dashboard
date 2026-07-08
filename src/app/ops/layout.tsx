import type { Metadata } from 'next';
import OpsNav from '@/components/ops/OpsNav';

export const metadata: Metadata = {
  title: 'Bryant Dental Operations',
  description: 'Post-sale operations dashboard — measurements, production, post-delivery.',
};

// The ops dashboard renders inside the root layout (so it inherits fonts and
// global CSS) but replaces the top navigation with an ops-specific bar in
// emerald green. No Jarvis, no notification bell — VAs don't need those.
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <OpsNav />
      <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
    </div>
  );
}
