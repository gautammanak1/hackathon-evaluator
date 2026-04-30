"use client";

import { Toaster } from "react-hot-toast";
import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EvaluationProvider } from "@/context/EvaluationContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
              "!border !border-gh-border !bg-gh-lightgray !text-gh-text dark:!bg-[#1a1a1a] dark:!text-white dark:!border-neutral-600",
            duration: 4000,
          }}
        />
      </TooltipProvider>
    </SWRConfig>
  );
}
