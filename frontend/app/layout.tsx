import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Submission Intelligence · Hackathon Evaluator",
  description:
    "Score and narrate hackathon repos at scale: GitHub, PDF, or spreadsheet uploads. Structured reports for judges and organizers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
