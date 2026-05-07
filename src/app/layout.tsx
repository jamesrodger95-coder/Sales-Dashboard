import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SplashScreen from "@/components/SplashScreen";
import ChatAssistant from "@/components/ChatAssistant";
import JarvisMode from "@/components/JarvisMode";
import QuickLog from "@/components/QuickLog";

export const metadata: Metadata = {
  title: "Bryant Dental — Sales Intelligence",
  description: "Sales intelligence dashboard for Bryant Dental",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">
        <SplashScreen />
        <TopNav />
        <main className="pt-14 min-h-screen">
          {children}
        </main>
        <ChatAssistant />
        <JarvisMode />
        <QuickLog />
      </body>
    </html>
  );
}
