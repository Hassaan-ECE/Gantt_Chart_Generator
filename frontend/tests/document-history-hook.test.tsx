import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDocumentHistory } from "@/gantt/useDocumentHistory";
import { createStarterChart } from "@/gantt/starterChart";

describe("useDocumentHistory", () => {
  it("starts with empty stacks and supports commit, undo, and redo", () => {
    const initial = createStarterChart("2026-08-05");
    const { result } = renderHook(() => useDocumentHistory(initial));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.commitDocument({ ...initial, title: "Next" });
    });
    expect(result.current.document.title).toBe("Next");
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.document.title).toBe("Execution Timeline");
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.document.title).toBe("Next");
  });

  it("replaceDocument resets history stacks", () => {
    const initial = createStarterChart("2026-08-05");
    const { result } = renderHook(() => useDocumentHistory(initial));

    act(() => {
      result.current.commitDocument({ ...initial, title: "Edited" });
      result.current.replaceDocument(createStarterChart("2026-08-06"));
    });

    expect(result.current.document.title).toBe("Execution Timeline");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
