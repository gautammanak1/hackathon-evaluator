"use client";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { TopNav } from "@/components/layout/TopNav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gh-bg">
      <div
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="animate-bg-drift absolute -left-[20%] top-0 h-[120%] w-[140%] bg-[radial-gradient(ellipse_80%_60%_at_30%_20%,rgba(120,120,120,0.14),transparent_55%),radial-gradient(ellipse_60%_50%_at_70%_75%,rgba(100,100,100,0.1),transparent_50%)] opacity-90 dark:opacity-40 dark:bg-[radial-gradient(ellipse_70%_55%_at_40%_25%,rgba(80,80,80,0.35),transparent_55%),radial-gradient(ellipse_50%_45%_at_75%_80%,rgba(60,60,60,0.25),transparent_50%)]" />
      </div>
      <TopNav />
      <div className="mt-12 flex h-[calc(100vh-3rem)] min-h-0 w-full overflow-hidden">
        <AppSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Breadcrumbs />
          <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-transparent p-3 sm:p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
