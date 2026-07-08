'use client';

import { usePathname } from 'next/navigation';
import TopNav from './TopNav';
import ChatAssistant from './ChatAssistant';
import JarvisMode from './JarvisMode';
import QuickLog from './QuickLog';
import SplashScreen from './SplashScreen';

// Renders the sales-dashboard chrome (top nav, Jarvis, chat, quick-log, splash)
// on every route EXCEPT /ops. The ops dashboard mounts its own nav and shouldn't
// show any sales-side assistants — VAs don't need Jarvis or the closing board
// prompts.
export default function SalesChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOps = pathname?.startsWith('/ops');

  if (isOps) {
    // Ops routes provide their own layout — render children without sales chrome
    // and without the pt-14 spacer that offsets the sales top nav.
    return <>{children}</>;
  }

  return (
    <>
      <SplashScreen />
      <TopNav />
      <main className="pt-14 min-h-screen">{children}</main>
      <ChatAssistant />
      <JarvisMode />
      <QuickLog />
    </>
  );
}
