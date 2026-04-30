"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { BatchResultEntry, EvaluationResult } from "@/lib/api";

type EvaluationContextValue = {
  single: EvaluationResult | null;
  batch: BatchResultEntry[] | null;
  batchNotice: string | null;
  setSingle: (r: EvaluationResult | null) => void;
  setBatch: (rows: BatchResultEntry[] | null, notice?: string | null) => void;
  clear: () => void;
};

const EvaluationContext = createContext<EvaluationContextValue | null>(null);

export function EvaluationProvider({ children }: { children: React.ReactNode }) {
  const [single, setSingleState] = useState<EvaluationResult | null>(null);
  const [batch, setBatchState] = useState<BatchResultEntry[] | null>(null);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  const setSingle = useCallback((r: EvaluationResult | null) => {
    setSingleState(r);
    if (r) {
      setBatchState(null);
      setBatchNotice(null);
    }
  }, []);

  const setBatch = useCallback((rows: BatchResultEntry[] | null, notice?: string | null) => {
    setBatchState(rows);
    setBatchNotice(notice ?? null);
    if (rows) {
      setSingleState(null);
    }
  }, []);

  const clear = useCallback(() => {
    setSingleState(null);
    setBatchState(null);
    setBatchNotice(null);
  }, []);

  const value = useMemo(
    () => ({ single, batch, batchNotice, setSingle, setBatch, clear }),
    [single, batch, batchNotice, setSingle, setBatch, clear],
  );

  return <EvaluationContext.Provider value={value}>{children}</EvaluationContext.Provider>;
}

export function useEvaluation() {
  const ctx = useContext(EvaluationContext);
  if (!ctx) throw new Error("useEvaluation must be used within EvaluationProvider");
  return ctx;
}
