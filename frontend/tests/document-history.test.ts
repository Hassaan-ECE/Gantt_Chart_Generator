import { describe, expect, it } from "vitest";

import {
  HISTORY_LIMIT,
  applyDocumentEdit,
  cloneChartDocument,
  documentsEqual,
  redoDocument,
  replaceDocumentWithoutHistory,
  undoDocument,
  type DocumentHistoryState,
} from "@/gantt/documentHistory";
import { createStarterChart } from "@/gantt/starterChart";

function baseState(document = createStarterChart("2026-08-05")): DocumentHistoryState {
  return { document, past: [], future: [] };
}

describe("documentHistory", () => {
  it("clones documents so mutations do not alias history entries", () => {
    const original = createStarterChart("2026-08-05");
    const clone = cloneChartDocument(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    clone.title = "Mutated";
    expect(original.title).toBe("Execution Timeline");
  });

  it("treats structurally equal documents as equal", () => {
    const left = createStarterChart("2026-08-05");
    const right = cloneChartDocument(left);
    expect(documentsEqual(left, right)).toBe(true);
    right.title = "Other";
    expect(documentsEqual(left, right)).toBe(false);
  });

  it("pushes past and clears future on edit", () => {
    const start = baseState();
    const next = { ...cloneChartDocument(start.document), title: "Updated" };
    const edited = applyDocumentEdit(start, next);
    expect(edited.document.title).toBe("Updated");
    expect(edited.past).toHaveLength(1);
    expect(edited.past[0].title).toBe("Execution Timeline");
    expect(edited.future).toEqual([]);

    const withFuture: DocumentHistoryState = {
      ...edited,
      future: [createStarterChart("2026-08-05")],
    };
    const again = applyDocumentEdit(withFuture, { ...next, title: "Again" });
    expect(again.future).toEqual([]);
  });

  it("no-ops when the next document equals the current document", () => {
    const start = baseState();
    const same = cloneChartDocument(start.document);
    const result = applyDocumentEdit(start, same);
    expect(result).toBe(start);
  });

  it("undoes and redoes committed documents", () => {
    const start = baseState();
    const mid = applyDocumentEdit(start, { ...cloneChartDocument(start.document), title: "Mid" });
    const end = applyDocumentEdit(mid, { ...cloneChartDocument(mid.document), title: "End" });

    const undone = undoDocument(end);
    expect(undone.document.title).toBe("Mid");
    expect(undone.past).toHaveLength(1);
    expect(undone.future).toHaveLength(1);
    expect(undone.future[0].title).toBe("End");

    const redone = redoDocument(undone);
    expect(redone.document.title).toBe("End");
    expect(redone.future).toEqual([]);
  });

  it("no-ops undo and redo on empty stacks", () => {
    const start = baseState();
    expect(undoDocument(start)).toBe(start);
    expect(redoDocument(start)).toBe(start);
  });

  it(`caps past history at ${HISTORY_LIMIT}`, () => {
    let state = baseState();
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      state = applyDocumentEdit(state, {
        ...cloneChartDocument(state.document),
        title: `Title ${index}`,
      });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    // 55 edits (0..54): past keeps last 50 previous docs → Title 4 .. Title 53; current Title 54
    expect(state.past[0].title).toBe("Title 4");
    expect(state.document.title).toBe(`Title ${HISTORY_LIMIT + 4}`);
  });

  it("replaceDocumentWithoutHistory resets stacks", () => {
    const start = baseState();
    const mid = applyDocumentEdit(start, { ...cloneChartDocument(start.document), title: "Mid" });
    const replaced = replaceDocumentWithoutHistory({
      ...cloneChartDocument(mid.document),
      title: "Loaded",
    });
    expect(replaced.document.title).toBe("Loaded");
    expect(replaced.past).toEqual([]);
    expect(replaced.future).toEqual([]);
  });
});
