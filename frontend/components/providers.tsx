"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EvaluationProvider } from "@/context/EvaluationContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          dedupingInterval: 3000,
        }}
      >
        <TooltipProvider delayDuration={200}>
          <EvaluationProvider>{children}</EvaluationProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              className:
                "!border !border-gh-border !bg-gh-card !text-gh-text",
              duration: 4000,
            }}
          />
        </TooltipProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
