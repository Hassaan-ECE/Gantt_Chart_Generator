import type { ChartDocument } from "@/gantt/model";

export const HISTORY_LIMIT = 50;

export interface DocumentHistoryState {
  document: ChartDocument;
  past: ChartDocument[];
  future: ChartDocument[];
}

export function cloneChartDocument(document: ChartDocument): ChartDocument {
  return JSON.parse(JSON.stringify(document)) as ChartDocument;
}

export function documentsEqual(left: ChartDocument, right: ChartDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyDocumentEdit(
  state: DocumentHistoryState,
  nextDocument: ChartDocument,
): DocumentHistoryState {
  if (documentsEqual(state.document, nextDocument)) return state;
  const past = [...state.past, cloneChartDocument(state.document)];
  const trimmedPast = past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;
  return {
    document: cloneChartDocument(nextDocument),
    past: trimmedPast,
    future: [],
  };
}

export function undoDocument(state: DocumentHistoryState): DocumentHistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    document: cloneChartDocument(previous),
    past: state.past.slice(0, -1),
    future: [...state.future, cloneChartDocument(state.document)],
  };
}

export function redoDocument(state: DocumentHistoryState): DocumentHistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[state.future.length - 1];
  return {
    document: cloneChartDocument(next),
    past: [...state.past, cloneChartDocument(state.document)],
    future: state.future.slice(0, -1),
  };
}

export function replaceDocumentWithoutHistory(
  document: ChartDocument,
): DocumentHistoryState {
  return { document: cloneChartDocument(document), past: [], future: [] };
}
