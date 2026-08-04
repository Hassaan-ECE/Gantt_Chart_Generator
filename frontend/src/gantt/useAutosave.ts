import { useCallback, useEffect, useRef, useState } from "react";

import type { ChartDocument } from "@/gantt/model";
import { saveChart } from "@/integrations/tauri/chartBridge";

export type AutosavePhase = "idle" | "saving" | "saved" | "error";

export interface AutosaveState {
  phase: AutosavePhase;
  message: string;
  retry: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAutosave(document: ChartDocument, enabled: boolean): AutosaveState {
  const [phase, setPhase] = useState<AutosavePhase>("idle");
  const [message, setMessage] = useState("");
  const previousDocument = useRef(document);
  const latestDocument = useRef(document);
  const documentVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (candidate: ChartDocument, version: number) => {
    setPhase("saving");
    setMessage("");
    try {
      await saveChart(candidate);
      if (documentVersion.current === version) {
        setPhase("saved");
      }
    } catch (error) {
      if (documentVersion.current === version) {
        setPhase("error");
        setMessage(errorMessage(error));
      }
    }
  }, []);

  useEffect(() => {
    latestDocument.current = document;
    const changed = previousDocument.current !== document;
    previousDocument.current = document;
    if (!changed) return;

    documentVersion.current += 1;
    if (!enabled) return;

    setPhase("idle");
    setMessage("");
    const version = documentVersion.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      void persist(document, version);
    }, 300);

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [document, enabled, persist]);

  const retry = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void persist(latestDocument.current, documentVersion.current);
  }, [persist]);

  return { phase, message, retry };
}
