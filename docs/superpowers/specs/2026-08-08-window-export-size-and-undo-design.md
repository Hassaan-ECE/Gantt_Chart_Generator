# Window Default Size, Viewport Export, and Document Undo Design

**Date:** 2026-08-08  
**Status:** Approved design; ready for implementation planning

## Summary

Three related product changes for Gantt Chart Creator:

1. Open the desktop window at the current **minimum** size so that size is the default layout.
2. Make **Copy image** and **Export PNG** produce a PNG of the **live chart workspace** (same geometry and dimensions as on screen), not a fixed PowerPoint 16:9 letterboxed canvas.
3. Add **document-level undo/redo** for committed chart edits, with toolbar controls and keyboard shortcuts.

Portable open/save, multi-chart documents, native PPTX, and dual export modes remain out of scope.

## Goals

- Default window size equals today’s minimum: **1050×650**.
- User can still resize the window larger; minimum constraints stay **1050×650**.
- Copy and Export share one pipeline and both match the **chart area only** (workspace under the toolbar), not the full app chrome.
- Export staging uses the same viewport metrics as the editor chart so layout, typography, and bars match what the user sees.
- Undo restores previous `ChartDocument` snapshots for committed edits; redo restores forward.
- History is in-memory only and does not persist across app restarts.

## Non-goals

- Capturing the full app window including the toolbar.
- Keeping a separate “PowerPoint 16:9 slide” export mode in this pass.
- Undo of selection, dialog drafts, drag previews, or image action side effects.
- Persisting undo history to disk.
- Portable project open/save or multiple concurrent charts.

## Window defaults

Update `backend/tauri.conf.json` window entry:

| Field | Value |
|-------|--------|
| `width` | `1050` |
| `height` | `650` |
| `minWidth` | `1050` (unchanged) |
| `minHeight` | `650` (unchanged) |
| `center` | `true` (unchanged) |

On first launch and subsequent cold starts without OS-restored geometry, the window opens at the minimum usable size. Growing the window remains allowed.

## Copy and Export PNG

### Current behavior (to replace)

- A hidden export `GanttChart` is staged with a fixed PowerPoint chart viewport derived from `1920×1080` minus margins.
- `svgToPngArtifact` letterboxes the SVG onto a fixed white 1920×1080 slide and scales by 2 for rasterization.

### Target behavior

1. **Staging viewport:** When preparing copy/export, the hidden export chart uses the same `chartViewport` measured for the on-screen editor (`useElementSize` on the chart workspace). Do not use `POWERPOINT_CHART_VIEWPORT`.
2. **Rasterization:** Canvas logical size equals the staged SVG’s width and height. Optional device scale remains `2` so the PNG is 2× pixel density for crisp paste; geometry still matches the window chart 1:1 (no letterboxing, no fixed slide size).
3. **Pipeline:** Copy image and Export PNG continue to share `svgToPngArtifact` / the same artifact bytes.
4. **Chrome:** Continue stripping `[data-editor-only='true']` nodes and forcing a white export background.
5. **Not ready:** If the chart viewport has not been measured (width/height ≤ 0) or the export SVG is missing, keep a clear error (“export chart is not ready” or equivalent).
6. **Copy / export UI copy:** Tooltips and accessible names should describe matching the on-screen chart, not “PowerPoint-ready.” Example titles: “Copy image” / “Export PNG” (optionally “matches chart size”).

### Module cleanup

- Remove or stop using PowerPoint placement helpers from the default export path (`POWERPOINT_SLIDE_*`, `calculatePowerPointPlacement`, and the fixed canvas size).
- Prefer a single clear API: rasterize prepared SVG at its own dimensions × scale.
- Update tests that assert 1920/1080 or letterbox placement to assert viewport-sized output instead.

### README

Replace claims about PowerPoint-ready 3840×2160 / 16:9 letterboxing with: copy and export produce a PNG of the chart workspace at the size shown in the window (2× pixel scale for sharpness).

## Document undo / redo

### Scope of history entries

Each **committed** change to `ChartDocument` is one history step:

- Add task, save task from dialog, delete task
- Bar move/resize **commit** (not live `previewTask` during drag)
- Title commit
- Settings changes (e.g. Saturday/Sunday visibility)
- Timeline range set / auto-fit (clear custom range)
- Successful reset to starter chart

### Out of history

- Selected task id / clear selection
- Dialog open/close and uncommitted dialog field edits
- In-progress drag preview
- Copy / export success or failure
- Autosave phase (history is independent; applying undo/redo updates the document and will autosave like any other edit)

### Stack model

Implement a small hook (e.g. `useDocumentHistory`) used by `App`:

- State: current `document`, `past: ChartDocument[]`, `future: ChartDocument[]`
- Cap `past` length at **50** (drop oldest)
- On user edit via `commitDocument(next)`:
  - If `next` is equal to current (stable JSON stringify of the document is acceptable), no-op
  - Else push a clone of current onto `past`, clear `future`, set current to `next`
- **Undo:** if `past` non-empty, push current to `future`, pop last past into current
- **Redo:** if `future` non-empty, push current to `past`, pop last future into current
- Startup load and initial starter document: history stacks empty (cannot undo past load)
- Deep clone snapshots so later mutations do not mutate history entries (structured clone or JSON round-trip of the document)

### UI and shortcuts

- Toolbar: **Undo** and **Redo** icon buttons next to image actions (or immediately before them). Disable when the respective stack is empty. Tooltips and `aria-label`s required.
- Shortcuts:
  - Undo: `Ctrl+Z` (Windows) / `Cmd+Z` (macOS if ever relevant)
  - Redo: `Ctrl+Y` and `Ctrl+Shift+Z` / `Cmd+Shift+Z`
- When focus is inside a text input/textarea/contenteditable that owns native undo (chart title field, task editor fields), **do not** intercept—let the browser handle field-level undo.
- History is session-only; app restart starts empty stacks after load.

### Integration with App state

- Replace raw `setDocument` for user edits with the history-aware commit path.
- Keep selection and preview state outside the history hook.
- Autosave continues to observe the live document; undoing/redoing is a normal document change.
- Reset-to-starter: after successful save of the starter document, replace current document through history (or commit as one step so undo can return to the pre-reset chart).

## Error handling

- Export readiness errors remain user-visible via existing image action error phase.
- History operations never throw for empty stacks; buttons disabled and shortcuts no-op.
- Document equality / clone failures should not corrupt state; prefer simple JSON clone of `ChartDocument` which is already JSON-serializable.

## Testing

### Export

- Staging / App-level tests: export chart viewport equals live chart viewport dimensions.
- `exportPng` unit tests: canvas output size = SVG width×height×scale; no fixed 1920×1080; no letterbox placement.
- Preserve coverage for editor-chrome stripping, white background, and filename sanitization.
- Copy and export still share the same artifact pipeline.

### Window

- Config-only change; verified by inspection of `tauri.conf.json` and manual `bun run desktop` smoke (opens at 1050×650).

### Undo

- Unit tests for the history helper: push, undo, redo, new edit clears redo, cap at 50, no-op on equal document.
- Integration: bar move commit → undo restores dates; add task → undo removes it; title commit → undo restores title.
- Shortcuts: Ctrl+Z undoes when focus is not in a text field; does not steal undo from title/dialog inputs.
- After load, undo is disabled until the first user edit.

## Implementation order

1. Window default size in `tauri.conf.json`.
2. Viewport-sized export pipeline, tests, tooltips.
3. `useDocumentHistory` (or equivalent), wire mutations, toolbar + shortcuts, tests.
4. README updates.
5. Full `bun run test` (and lint if needed).

## Success criteria

- Cold start opens at 1050×650 with mins unchanged.
- Copy and Export PNG match the on-screen chart layout and size (2× pixels).
- Committed chart edits can be undone and redone within the session cap.
- Existing non-export, non-history behaviors remain green under the full test suite.
