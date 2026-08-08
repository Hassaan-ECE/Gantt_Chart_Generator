import { useCallback, useState } from "react";

import {
  applyDocumentEdit,
  redoDocument,
  replaceDocumentWithoutHistory,
  undoDocument,
  type DocumentHistoryState,
} from "@/gantt/documentHistory";
import type { ChartDocument } from "@/gantt/model";

export interface UseDocumentHistoryResult {
  document: ChartDocument;
  canUndo: boolean;
  canRedo: boolean;
  commitDocument: (next: ChartDocument | ((current: ChartDocument) => ChartDocument)) => void;
  replaceDocument: (next: ChartDocument) => void;
  undo: () => void;
  redo: () => void;
}

export function useDocumentHistory(initialDocument: ChartDocument): UseDocumentHistoryResult {
  const [state, setState] = useState<DocumentHistoryState>(() =>
    replaceDocumentWithoutHistory(initialDocument),
  );

  const commitDocument = useCallback(
    (next: ChartDocument | ((current: ChartDocument) => ChartDocument)) => {
      setState((current) => {
        const resolved = typeof next === "function" ? next(current.document) : next;
        return applyDocumentEdit(current, resolved);
      });
    },
    [],
  );

  const replaceDocument = useCallback((next: ChartDocument) => {
    setState(replaceDocumentWithoutHistory(next));
  }, []);

  const undo = useCallback(() => {
    setState((current) => undoDocument(current));
  }, []);

  const redo = useCallback(() => {
    setState((current) => redoDocument(current));
  }, []);

  return {
    document: state.document,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commitDocument,
    replaceDocument,
    undo,
    redo,
  };
}
