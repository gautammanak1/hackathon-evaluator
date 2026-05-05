import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Fetch.ai Hackathon Evaluator",
  description: "Sign in with GitHub to deeply analyse your Fetch.ai project and auto-create a remediation issue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-white font-mono text-[#000D3E] antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
