# Inline Task Names and Week Bands Design

**Date:** 2026-08-08  
**Status:** Approved design; ready for implementation planning

## Summary

Two related chart UX improvements:

1. **Inline task name editing** — click a task name in the label column to rename it in place, using the same interaction model as the chart title.
2. **Week bands and thicker week dividers** — on timelines longer than about one week, show centered “Week of …” bands and stronger vertical lines at week boundaries so weeks are visually distinct.

Double-click on the task bar still opens the full task dialog for dates, category, and color. Export PNG continues to render plain text names and the same week structure without editor controls.

## Goals

- Rename tasks without opening the full dialog.
- Match chart-title inline edit behavior: click, edit, Enter/blur commit, Escape cancel.
- Inline renames participate in document undo/redo.
- Make week cutoffs obvious on compact-days, month-days, and month-weeks ranges.
- Label weeks as date ranges of visible days (e.g. “Week of Aug 4 – Aug 8”).
- Keep detailed-days (≤14 day) headers day-focused without a competing week band row.
- Preserve export fidelity (no editor chrome; week visuals included).

## Non-goals

- Inline editing of category or color.
- Configurable week start day (fixed Monday-based calendar weeks).
- Week band header row on detailed-days.
- Changing timeline range auto-fit or range picker behavior.
- Drag-reorder of task rows.

## Inline task name editing

### Interaction (editor mode only)

- Clicking the **task name** area focuses an inline text field over the label column for that row.
- **Enter** or **blur** commits the trimmed value.
- **Escape** restores the value from before the edit and blurs without committing.
- **Blank commit:** restore the previous name (do not clear to empty or force “New task”).
- Pointer events on the name control **stop propagation** so the click does not clear selection via the chart background.
- Clicking the name may select the task if useful for consistency; it must not open the full dialog.
- **Double-click on the bar** still opens the full task dialog (existing behavior).
- Successful name commits use the existing task commit / `commitDocument` path so **undo/redo** works.

### Rendering

- **Not editing:** keep current multi-line wrapped bold task name text.
- **Editing:** single-line input in the label column (same spirit as `InlineChartTitle`), sized to the label width and row metrics.
- Prefer a small reusable component (e.g. `InlineTaskName`) or a shared inline-text pattern with title, without forcing a large abstract framework.
- The editor control is marked `data-editor-only="true"` and stripped from PNG export.
- **Export mode:** always render plain SVG text for the task name (current export path).

### Layout constraints

- The input lives in a `foreignObject` (or equivalent) aligned with the task row’s label cell.
- Editing does not change row height or timeline geometry mid-drag.
- Adaptive font size follows existing task label metrics.

## Week bands and thicker week dividers

### When they apply

| Header tier | Week bands | Thicker week body lines |
|-------------|------------|-------------------------|
| `detailed-days` (≤14 days) | No | No (keep day grid only) |
| `compact-days` | Yes | Yes |
| `month-days` | Yes | Yes |
| `month-weeks` | Yes (labels use “Week of …” style) | Yes |

### Week grouping

- Build week bands from **visible dates** only (respects Saturday/Sunday settings).
- Group by **calendar week starting Monday** (UTC date math consistent with existing ISO date helpers).
- Each band: `{ key, label, startIndex, endIndex }` over the visible-date index range.

### Labels

- Primary: **`Week of Aug 4 – Aug 8`** using the first and last **visible** day in that band (en-US short month + day, no year unless the band spans a year boundary—then include year on the end or both as needed for clarity).
- Fitting fallbacks when the band is narrow (same idea as month bands):
  1. Full: `Week of Aug 4 – Aug 8`
  2. Concise range: `Aug 4 – Aug 8`
  3. Ultra-short: `W2` (ordinal week within the visible range, 1-based)
  4. Empty string if nothing fits

### Header composition

- **compact-days:** week bands in the upper header area; day labels (MM/DD) below.
- **month-days:** existing month bands on top; week bands as a clear secondary header layer; day numbers remain the lowest header labels where space allows.
- **month-weeks:** keep month bands; replace relative “Week N”-only primary labels with **Week of …** (with the same fitting fallbacks). Week boundary grid aligns with band edges.
- Header height may increase slightly if needed so two band rows remain readable; adaptive layout continues to shrink fonts when density is high.

### Body grid

- Day (or existing) grid lines stay thin.
- At each week band `startIndex` (except chart left edge if redundant), draw a **thicker, slightly darker** vertical divider from the header through the task area down to the legend top (`gantt-week-divider` or equivalent).
- Today marker remains above grid/bars as today.

### Export

- Week bands and week dividers appear in export mode.
- No editor-only nodes.

## Architecture notes

- **Timeline header:** extend `TimelineHeaderModel` (or adjacent types) with explicit `weekBands` and/or reuse `bands` carefully so month vs week bands are distinguishable for styling (prefer explicit `weekBands` + existing month `bands` rather than overloading one list without a kind field).
- **Layout:** if header metrics need a second band row, update `calculateChartLayout` / metrics so header height accounts for week bands when present.
- **GanttChart:** render week band labels, week dividers, and inline task name editors in editor mode.
- **App:** pass through name commit via existing task update (`onCommitTask` or a thin `onTaskNameCommit` that maps to the same history path). Prefer reusing `onCommitTask` with an updated task object.

## Error handling and edge cases

- Single-day or partial weeks at range edges still get a band over the visible days only.
- Empty chart: no week bands required beyond existing empty layout.
- Very narrow day width: labels fall back or hide; thicker lines still mark boundaries.
- Concurrent selection: renaming one task does not require multi-select.

## Testing

### Inline names

- Click name → editable field appears; type + Enter commits; chart shows new name.
- Escape restores previous name.
- Blank blur restores previous name.
- Export/copy path contains text only (no input control).
- Undo after rename restores prior name.

### Week bands

- Unit tests for week grouping with weekends hidden.
- Labels format “Week of …” for known ranges.
- Fitting fallbacks when width is constrained.
- `detailed-days` has no week bands; `compact-days` and longer do.
- Chart/markup tests assert week divider presence at expected indices for a multi-week range.

## Implementation order

1. Week band model + thicker dividers + unit tests.
2. Header/body rendering and any header-height metric adjustments.
3. Inline task name component + GanttChart/App wiring + tests.
4. README + full `bun run test`.

## Success criteria

- Users can rename tasks inline like the chart title, with undo.
- On ranges longer than ~1 week, weeks are visually separated by labels and stronger vertical lines.
- Detailed short ranges remain day-oriented.
- Export matches on-screen structure without editor chrome.
- Full existing suite remains green with new coverage for both features.
