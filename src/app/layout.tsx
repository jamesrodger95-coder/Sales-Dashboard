import type { Metadata } from "next";
import "./globals.css";
import SalesChrome from "@/components/SalesChrome";

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
        <SalesChrome>{children}</SalesChrome>
      </body>
    </html>
  );
}
