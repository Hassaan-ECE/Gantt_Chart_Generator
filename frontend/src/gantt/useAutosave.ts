import { useCallback, useEffect, useRef, useState } from "react";

import type { ChartDocument } from "@/gantt/model";
import { saveChart } from "@/integrations/tauri/chartBridge";

export type AutosavePhase = "idle" | "saving" | "saved" | "error";

export interface AutosaveState {
  phase: AutosavePhase;
  message: string;
  retry: () => void;
}

interface PendingSave {
  document: ChartDocument;
  version: number;
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
  const inFlight = useRef(false);
  const queuedSave = useRef<PendingSave | null>(null);

  const drainSaveQueue = useCallback(async (initial: PendingSave) => {
    inFlight.current = true;
    let pending = initial;

    while (true) {
      setPhase("saving");
      setMessage("");
      let succeeded = false;
      let failure: unknown;
      try {
        await saveChart(pending.document);
        succeeded = true;
      } catch (error) {
        failure = error;
      }

      const next = queuedSave.current;
      queuedSave.current = null;
      if (next) {
        pending = next;
        continue;
      }

      inFlight.current = false;
      if (documentVersion.current === pending.version) {
        if (succeeded) {
          setPhase("saved");
        } else {
          setPhase("error");
          setMessage(errorMessage(failure));
        }
      }
      return;
    }
  }, []);

  const enqueueSave = useCallback((pending: PendingSave) => {
    if (inFlight.current) {
      queuedSave.current = pending;
      return;
    }
    void drainSaveQueue(pending);
  }, [drainSaveQueue]);

  useEffect(() => {
    latestDocument.current = document;
    const changed = previousDocument.current !== document;
    previousDocument.current = document;
    if (!changed) return;

    documentVersion.current += 1;
    queuedSave.current = null;
    if (!enabled) return;

    if (!inFlight.current) setPhase("idle");
    setMessage("");
    const version = documentVersion.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      enqueueSave({ document, version });
    }, 300);

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [document, enabled, enqueueSave]);

  const retry = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    enqueueSave({
      document: latestDocument.current,
      version: documentVersion.current,
    });
  }, [enqueueSave]);

  return { phase, message, retry };
}
