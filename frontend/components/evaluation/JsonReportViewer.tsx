"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  data: unknown;
  className?: string;
};

export function JsonReportViewer({ data, className }: Props) {
  const [open, setOpen] = React.useState(false);
  const text = JSON.stringify(data, null, 2);

  return (
    <div className={cn("rounded-lg border border-gh-border bg-gh-bg", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 p-3 text-left text-sm text-gh-text hover:bg-gh-card/50"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        Raw JSON report
      </button>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-gh-border p-3">
          <div className="mb-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(text);
                toast.success("Copied JSON");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          <pre className="max-h-[420px] overflow-auto rounded-md bg-[#010409] p-4 font-mono text-xs leading-relaxed text-gh-muted">
            {text}
          </pre>
        </motion.div>
      )}
    </div>
  );
}
