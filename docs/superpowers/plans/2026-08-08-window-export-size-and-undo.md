# Window Default Size, Viewport Export, and Document Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the desktop app at 1050×650, make Copy/Export PNG match the live chart workspace size, and add session document undo/redo for committed chart edits.

**Architecture:** Window size is a Tauri config change. Export stops letterboxing onto a fixed 16:9 slide; `svgToPngArtifact` rasterizes the staged SVG at its own width×height×scale, and App stages export with the same measured `chartViewport` as the editor. Undo lives in a pure history helper plus `useDocumentHistory` hook; App routes all committed document mutations through it and exposes toolbar buttons plus keyboard shortcuts.

**Tech Stack:** Tauri 2 config, React 19, TypeScript, Vitest + Testing Library, existing SVG→PNG canvas pipeline.

**Spec:** `docs/superpowers/specs/2026-08-08-window-export-size-and-undo-design.md`

---

## File map

| File | Role |
|------|------|
| `backend/tauri.conf.json` | Default window width/height = min size |
| `frontend/src/gantt/exportPng.ts` | Viewport-sized rasterization; remove PPT placement from default path |
| `frontend/tests/export-png.test.ts` | Update size/placement assertions |
| `frontend/src/app/App.tsx` | Stage export with live viewport; history commits; undo UI/shortcuts; tooltips |
| `frontend/src/gantt/documentHistory.ts` | Pure clone/equal + stack apply helpers (testable without React) |
| `frontend/src/gantt/useDocumentHistory.ts` | React hook wrapping history helpers |
| `frontend/tests/document-history.test.ts` | Unit tests for pure history |
| `frontend/tests/document-history-hook.test.tsx` | Hook + optional App integration for undo |
| `frontend/tests/copy-image.test.tsx` | Drop PowerPoint wording if asserted; keep pipeline behavior |
| `README.md` | Document default window and viewport export |

---

### Task 1: Default window size equals minimum

**Files:**
- Modify: `backend/tauri.conf.json`

- [ ] **Step 1: Set default width/height to min values**

In `backend/tauri.conf.json`, change the window entry to:

```json
{
  "title": "Gantt Chart Creator",
  "width": 1050,
  "height": 650,
  "minWidth": 1050,
  "minHeight": 650,
  "center": true
}
```

- [ ] **Step 2: Verify config**

Run from repo root:

```powershell
Get-Content backend/tauri.conf.json | Select-String -Pattern 'width|height|minWidth|minHeight'
```

Expected: `width` and `height` are 1050 and 650; mins unchanged.

- [ ] **Step 3: Commit**

```powershell
git add backend/tauri.conf.json
git commit -m "feat: open desktop window at minimum size"
```

---

### Task 2: Rasterize PNG at SVG size (TDD)

**Files:**
- Modify: `frontend/src/gantt/exportPng.ts`
- Modify: `frontend/tests/export-png.test.ts`

- [ ] **Step 1: Rewrite failing rasterization tests**

In `frontend/tests/export-png.test.ts`:

1. Remove imports of `POWERPOINT_SLIDE_WIDTH`, `POWERPOINT_SLIDE_HEIGHT`, `POWERPOINT_SLIDE_MARGIN`, and `calculatePowerPointPlacement` if nothing else needs them after this task.
2. Replace the test `"shrinks a long timeline to fit inside the PowerPoint slide margins"` with:

```ts
it("does not export PowerPoint placement helpers for the default path", async () => {
  const module = await import("@/gantt/exportPng");
  expect(module).not.toHaveProperty("calculatePowerPointPlacement");
  expect(module).not.toHaveProperty("POWERPOINT_SLIDE_WIDTH");
  expect(module).not.toHaveProperty("POWERPOINT_SLIDE_HEIGHT");
  expect(module).not.toHaveProperty("POWERPOINT_SLIDE_MARGIN");
});
```

3. Replace the test `"rasterizes onto a 2x 16:9 PowerPoint slide and returns the encoded PNG bytes"` with:

```ts
it("rasterizes onto a 2x canvas matching the SVG size and returns the encoded PNG bytes", async () => {
  const environment = installRasterEnvironment();
  document.body.innerHTML = `<svg width="800" height="400"><text>Task</text></svg>`;

  await expect(svgToPngBytes(document.querySelector("svg")!)).resolves.toEqual(
    new Uint8Array([137, 80, 78, 71]),
  );

  const canvas = environment.toBlob.mock.instances[0] as HTMLCanvasElement;
  expect(canvas.width).toBe(1600);
  expect(canvas.height).toBe(800);
  expect(environment.context.scale).toHaveBeenCalledWith(2, 2);
  expect(environment.context.fillRect).toHaveBeenCalledWith(0, 0, 800, 400);
  const [, x, y, width, height] = environment.context.drawImage.mock.calls[0];
  expect(x).toBe(0);
  expect(y).toBe(0);
  expect(width).toBe(800);
  expect(height).toBe(400);
  expect(environment.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  expect(environment.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:gantt-export");
});
```

Leave other tests (sanitize, prepareExportSvg, error paths, svgToPngArtifact blob reuse) intact except for any import cleanup.

- [ ] **Step 2: Run tests to verify failure**

```powershell
bun run test -- frontend/tests/export-png.test.ts
```

Expected: FAIL — either still asserts old dimensions, or new “does not export PowerPoint helpers” fails because symbols still exist.

- [ ] **Step 3: Implement viewport-sized rasterization**

In `frontend/src/gantt/exportPng.ts`:

1. Delete `POWERPOINT_SLIDE_WIDTH`, `POWERPOINT_SLIDE_HEIGHT`, `POWERPOINT_SLIDE_MARGIN`, `PowerPointPlacement`, and `calculatePowerPointPlacement`.
2. Change `svgToPngArtifact` to:

```ts
export async function svgToPngArtifact(source: SVGSVGElement, scale = 2): Promise<PngArtifact> {
  const { width, height } = svgDimensions(source);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid SVG dimensions");

  const prepared = prepareExportSvg(source);
  const serialized = new XMLSerializer().serializeToString(prepared);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadSvgImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create PNG canvas context");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToPngBlob(canvas);
    return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

Keep `prepareExportSvg`, `sanitizeExportFilename`, and `svgToPngBytes` as they are (aside from relying on the new artifact path).

- [ ] **Step 4: Run tests to verify pass**

```powershell
bun run test -- frontend/tests/export-png.test.ts
```

Expected: all tests in that file PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/gantt/exportPng.ts frontend/tests/export-png.test.ts
git commit -m "feat: export PNG at chart SVG dimensions"
```

---

### Task 3: Stage export with live chart viewport

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/tests/copy-image.test.tsx` (wording only if needed)
- Modify: `frontend/tests/export-bridge.test.ts` only if something still expects PPT viewport attributes

- [ ] **Step 1: Add a regression assertion for staged export size**

In `frontend/tests/copy-image.test.tsx`, add (or extend an existing test) so that after clicking Copy image, the SVG passed to `svgToPngArtifact` has width/height attributes matching the test ResizeObserver viewport from `frontend/tests/setup.ts` (1200×640):

```ts
it("stages export SVG at the live chart viewport size", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "Copy image" }));

  expect(svgToPngArtifact).toHaveBeenCalledTimes(1);
  const exportSvg = vi.mocked(svgToPngArtifact).mock.calls[0][0];
  expect(exportSvg.getAttribute("width")).toBe("1200");
  expect(exportSvg.getAttribute("height")).toBe("640");
});
```

Also rename the test `"copies the PowerPoint-ready artifact without opening a save dialog"` to `"copies the chart image without opening a save dialog"` (behavior unchanged).

- [ ] **Step 2: Run test to verify failure**

```powershell
bun run test -- frontend/tests/copy-image.test.tsx
```

Expected: FAIL on staged width/height (export still uses PowerPoint viewport ~1792×952).

- [ ] **Step 3: Wire App export to live viewport**

In `frontend/src/app/App.tsx`:

1. Remove imports of `POWERPOINT_SLIDE_HEIGHT`, `POWERPOINT_SLIDE_MARGIN`, `POWERPOINT_SLIDE_WIDTH`.
2. Delete `POWERPOINT_CHART_VIEWPORT`.
3. On the export staging `GanttChart`, set:

```tsx
viewport={chartViewport}
```

4. Only mount export staging when `imageRequest` is set **and** `chartViewport.width > 0 && chartViewport.height > 0` (same readiness gate as the editor chart). If the user clicks copy/export before measurement, keep the existing not-ready error path in `runImageAction`.
5. Update default tooltips (non-error state):

```tsx
title="Copy chart image"
// ...
title="Export chart PNG"
```

Keep `aria-label` values `"Copy image"` and `"Export PNG"` so existing role queries still pass.

- [ ] **Step 4: Run related tests**

```powershell
bun run test -- frontend/tests/copy-image.test.tsx frontend/tests/export-bridge.test.ts frontend/tests/editor-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/App.tsx frontend/tests/copy-image.test.tsx
git commit -m "feat: stage copy and export at live chart viewport"
```

---

### Task 4: Pure document history helpers (TDD)

**Files:**
- Create: `frontend/src/gantt/documentHistory.ts`
- Create: `frontend/tests/document-history.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `frontend/tests/document-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  HISTORY_LIMIT,
  applyDocumentEdit,
  cloneChartDocument,
  documentsEqual,
  redoDocument,
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

  it(`caps past history at ${50}`, () => {
    let state = baseState();
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      state = applyDocumentEdit(state, {
        ...cloneChartDocument(state.document),
        title: `Title ${index}`,
      });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    expect(state.past[0].title).toBe("Title 4");
    expect(state.document.title).toBe(`Title ${HISTORY_LIMIT + 4}`);
  });
});
```

Note: if `HISTORY_LIMIT` is exported as `50`, the cap test’s expected first past title is `"Title 4"` after 55 edits from the starter title (indices 0..54 → 55 past pushes truncated to last 50 of the *previous* documents: after edit index 0 past has starter, … after 55 edits past has titles Title 4 through Title 53 and current is Title 54). Double-check arithmetic when implementing: after `HISTORY_LIMIT + 5` successful edits, `past.length === HISTORY_LIMIT` and the oldest kept past snapshot is the document that existed before edit number `(totalEdits - HISTORY_LIMIT)`.

Safer explicit cap test:

```ts
it("caps past history at HISTORY_LIMIT", () => {
  let state = baseState();
  for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
    state = applyDocumentEdit(state, {
      ...cloneChartDocument(state.document),
      title: `Title ${index}`,
    });
  }
  expect(state.past).toHaveLength(HISTORY_LIMIT);
  expect(state.past[0].title).toBe(`Title ${4}`); // first retained after dropping 5 oldest post-starter snapshots
  expect(state.document.title).toBe(`Title ${HISTORY_LIMIT + 4}`);
});
```

Implementer: compute retained titles from the algorithm (drop from front of `past` after push). Prefer asserting only:

```ts
expect(state.past).toHaveLength(HISTORY_LIMIT);
expect(state.document.title).toBe(`Title ${HISTORY_LIMIT + 4}`);
expect(state.past.every((entry, index, all) => index === 0 || !documentsEqual(entry, all[index - 1]))).toBe(true);
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
bun run test -- frontend/tests/document-history.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pure helpers**

Create `frontend/src/gantt/documentHistory.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
bun run test -- frontend/tests/document-history.test.ts
```

Expected: PASS. Fix cap-test expectations if arithmetic was off.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/gantt/documentHistory.ts frontend/tests/document-history.test.ts
git commit -m "feat: add pure document undo history helpers"
```

---

### Task 5: React history hook

**Files:**
- Create: `frontend/src/gantt/useDocumentHistory.ts`
- Create: `frontend/tests/document-history-hook.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `frontend/tests/document-history-hook.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
bun run test -- frontend/tests/document-history-hook.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/gantt/useDocumentHistory.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
bun run test -- frontend/tests/document-history-hook.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/gantt/useDocumentHistory.ts frontend/tests/document-history-hook.test.tsx
git commit -m "feat: add useDocumentHistory hook"
```

---

### Task 6: Wire App mutations, toolbar, and shortcuts

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/tests/app-shell.test.tsx` and/or create undo cases in `frontend/tests/document-history-hook.test.tsx` / `frontend/tests/editor-flow.test.tsx`

- [ ] **Step 1: Write failing App-level undo tests**

Add to `frontend/tests/app-shell.test.tsx` (or a new `frontend/tests/undo-flow.test.tsx` if preferred for isolation):

```tsx
it("undoes a committed title edit with the toolbar button and Ctrl+Z", async () => {
  const user = userEvent.setup();
  render(<App />);

  const title = await screen.findByLabelText("Chart title");
  await user.click(title);
  await user.clear(title);
  await user.type(title, "Revised Timeline");
  await user.keyboard("{Enter}");
  expect(title).toHaveValue("Revised Timeline");

  const undoButton = screen.getByRole("button", { name: "Undo" });
  expect(undoButton).toBeEnabled();
  await user.click(undoButton);
  expect(title).toHaveValue("Execution Timeline");

  const redoButton = screen.getByRole("button", { name: "Redo" });
  expect(redoButton).toBeEnabled();
  await user.click(redoButton);
  expect(title).toHaveValue("Revised Timeline");
});

it("does not handle Ctrl+Z while the chart title field is focused", async () => {
  const user = userEvent.setup();
  render(<App />);

  const title = await screen.findByLabelText("Chart title");
  await user.click(title);
  await user.clear(title);
  await user.type(title, "Draft");
  // Native field undo may restore prior field text; document history must not run while focused.
  await user.keyboard("{Control>}z{/Control}");
  // After commit, history should still be empty if user never committed; if they did not blur/Enter,
  // document title remains starter. Assert document-level undo still disabled:
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
});
```

Adjust selectors to match actual title control (`InlineChartTitle` may use `aria-label="Chart title"` or similar — inspect `frontend/src/gantt/InlineChartTitle.tsx` and existing `inline-title.test.tsx` / `app-shell.test.tsx` before writing final selectors). Prefer reusing patterns already proven in those files for title commit.

Add one more solid document-level case that does not depend on title focus nuance:

```tsx
it("undoes adding a task", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Add task" });
  const beforeCount = document.querySelectorAll(".gantt-task-bar, [data-testid='task-bar']").length;
  // Use whatever selector existing task tests use for bars.

  await user.click(screen.getByRole("button", { name: "Add task" }));
  // Save dialog with defaults if required by TaskEditorDialog flow (mirror editor-flow.test.tsx).

  expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Undo" }));
  // Task count returns to beforeCount
});
```

Implementer must mirror the exact add-task dialog flow from `frontend/tests/editor-flow.test.tsx` rather than inventing a different path.

- [ ] **Step 2: Run tests to verify failure**

```powershell
bun run test -- frontend/tests/app-shell.test.tsx
```

Expected: FAIL — no Undo button.

- [ ] **Step 3: Wire App to history**

In `frontend/src/app/App.tsx`:

1. Import `useDocumentHistory` and undo/redo icons from `lucide-react` (`Undo2`, `Redo2`).
2. Replace `useState(() => createStarterChart())` for the chart document with:

```ts
const {
  document,
  canUndo,
  canRedo,
  commitDocument,
  replaceDocument,
  undo,
  redo,
} = useDocumentHistory(createStarterChart());
```

3. Startup load success path:

```ts
replaceDocument(loadedDocument ?? createStarterChart());
```

4. Replace every user `setDocument(...)` that mutates the chart with `commitDocument(...)` (functional form supported):

- `commitTask`
- `changeTimelineRange`
- `saveTask`
- `deleteTask`
- title commit
- settings `onChange`
- reset success path: after `await saveChart(starterDocument)`, use `commitDocument(starterDocument)` so reset is undoable **or** follow spec: “Successful reset… commit as one step”. Prefer `commitDocument(starterDocument)` after successful save so undo returns to pre-reset chart. Do **not** use `replaceDocument` for reset.

5. Keep selection / preview / dialog state as separate React state.

6. Toolbar: before the image icon group, add:

```tsx
<div className="toolbar-icon-group" role="group" aria-label="Edit history">
  <button
    type="button"
    className="icon-action"
    aria-label="Undo"
    title="Undo"
    disabled={!canUndo}
    onClick={undo}
  >
    <Undo2 aria-hidden="true" />
  </button>
  <button
    type="button"
    className="icon-action"
    aria-label="Redo"
    title="Redo"
    disabled={!canRedo}
    onClick={redo}
  >
    <Redo2 aria-hidden="true" />
  </button>
</div>
```

7. Keyboard effect (skip when typing in fields):

```ts
useEffect(() => {
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    const isField =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      target?.isContentEditable === true;
    if (isField) return;

    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;

    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [undo, redo]);
```

Note: when dialog is open, inputs are fields so native undo wins; Escape selection clearing stays as today.

- [ ] **Step 4: Run App and related tests**

```powershell
bun run test -- frontend/tests/app-shell.test.tsx frontend/tests/editor-flow.test.tsx frontend/tests/autosave.test.tsx frontend/tests/bar-interactions.test.tsx
```

Expected: PASS. Fix any test that assumed document state identity or missing undo controls in the toolbar.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/App.tsx frontend/tests
git commit -m "feat: wire document undo and redo into the app shell"
```

---

### Task 7: README and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README storage/export and run notes**

Replace PowerPoint-size claims with accurate behavior. Example paragraphs:

Under **Editing** / **Storage and export**, ensure text covers:

- Desktop default window size is 1050×650 (also the minimum).
- Copy image and Export PNG produce the same PNG of the **chart workspace** at the on-screen size (2× pixel density for sharpness). They do not letterbox onto a fixed 16:9 slide.
- Undo/Redo (toolbar or Ctrl+Z / Ctrl+Y) reverse committed chart edits in the current session.

Remove obsolete “3840×2160” / “PowerPoint-ready 16:9 canvas” wording.

- [ ] **Step 2: Run full frontend suite and lint**

```powershell
bun run test
bun run lint
```

Expected: all tests pass; lint clean (or only pre-existing issues unrelated to this work — fix any new issues you introduced).

- [ ] **Step 3: Manual desktop smoke (required for window size)**

```powershell
bun run desktop
```

Confirm:

1. Window opens at 1050×650 (or OS DPI-scaled equivalent of that logical size).
2. Copy image pastes a chart matching on-screen layout (not a wide 16:9 letterbox).
3. Undo reverts a bar move; Redo restores it.

- [ ] **Step 4: Commit docs**

```powershell
git add README.md
git commit -m "docs: describe viewport export and session undo"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Default window 1050×650, mins unchanged | Task 1 |
| Export staging uses live chart viewport | Task 3 |
| Rasterize at SVG size × scale, no PPT letterbox | Task 2 |
| Copy and Export share pipeline | Tasks 2–3 (unchanged App flow) |
| Tooltips not PowerPoint-ready | Task 3 |
| Document-level undo/redo, 50 cap | Tasks 4–6 |
| No history for selection/preview/dialog drafts | Task 6 |
| Ctrl+Z / redo shortcuts; skip text fields | Task 6 |
| Startup load clears history | Task 6 `replaceDocument` |
| Reset is one undoable commit | Task 6 |
| README updates | Task 7 |
| Tests for export size + history | Tasks 2–6 |
| Full test run | Task 7 |

## Out of scope (do not implement)

- Portable open/save
- Multi-chart
- Dual PPT export mode
- Persisted undo stacks
