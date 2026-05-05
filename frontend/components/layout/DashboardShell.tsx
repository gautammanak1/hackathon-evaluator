"use client";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { TopNav } from "@/components/layout/TopNav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-white">
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
