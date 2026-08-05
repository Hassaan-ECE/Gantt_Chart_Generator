# Responsive Flat Gantt Workspace Design

**Date:** 2026-08-05
**Status:** Approved design; written specification ready for user review

## Summary

Redesign the Gantt Chart Creator as one flat, grouped workspace that always fits inside the application window. The page and chart must never expose scrollbars. Instead, the chart geometry and typography adapt to the available area so the complete task list, timeline, bars, current-day marker, and legend remain visible together.

The redesign also makes the chart title directly editable, improves task-label prominence, adds reusable category and color suggestions, makes task selection dismissible, and places icon-only Copy Image and Export PNG actions beside each other. Copy Image and Export PNG use the same 16:9 PowerPoint-ready renderer.

## Goals

- Use one visually continuous white workspace rather than card-like sections or containers.
- Group related controls through alignment, spacing, and subtle dividers.
- Keep the toolbar at a stable readable size.
- Fit the complete chart into all remaining window space with no page or chart scrollbars.
- Automatically shrink chart geometry and text whenever task or date density increases.
- Preserve whole-day drag and resize behavior at every adaptive size.
- Match the supplied reference's compact two-line dates, pale vertical grid, saturated rounded bars, and foreground orange date marker.
- Let users edit the chart title directly in its displayed position.
- Make task names slightly larger and bold.
- Reuse existing category names and colors without preventing new values.
- Copy the same PowerPoint-ready image used by PNG export directly to the Windows clipboard.
- Keep the Codex browser preview usable while implementing and reviewing the redesign.

## Non-goals

- Pagination, separate pages, collapsible panels, or card dashboards.
- Page-level or chart-level scrolling.
- Density warnings or limits on task/date counts.
- Timeline zoom controls; fitting is automatic.
- Task dependencies, critical-path display, undo/redo, or multiple project documents.
- Native PowerPoint file generation.

## Page Structure and Visual Language

The application shell is a two-row grid: a fixed-height toolbar followed by one flexible chart workspace. The shell uses the full window height and width with overflow hidden.

The toolbar is a flat white row. The product name remains on the left. Related actions appear as compact groups separated by spacing or a subtle vertical rule. The chart-title input is removed from the toolbar. Add Task remains a labeled primary action. Copy Image, Export PNG, and Chart Settings form a compact icon group; every icon button has a tooltip and accessible name. Toolbar gaps may tighten responsively, but its controls retain their normal readable size and the toolbar itself never scrolls.

The chart workspace has no rounded outer border, card shadow, inset panel, or padded gray frame. It is a continuous white surface. A thin divider may separate the toolbar from the chart, and pale grid rules may separate dates and task rows inside the chart.

Visual details follow the supplied reference:

- Weekday and date render on two compact, centered lines.
- Task labels are slightly larger than the current labels and use bold weight.
- Bars are saturated, rounded rectangles with a strong solid fill.
- Grid lines are thin and cool gray.
- The current-day marker is orange, contains no text label, and renders after grid lines and task bars so it remains in the foreground.
- The legend remains part of the complete fitted chart and uses category names plus matching swatches.

## Adaptive Chart Layout

The editor measures the chart workspace with `ResizeObserver`. Measurement is isolated in a small hook or component that reports a stable `{ width, height }` pair after the workspace has nonzero dimensions.

`calculateChartLayout` accepts the chart document, current date, and target viewport dimensions. It returns both task geometry and adaptive metrics, including:

- task-label width;
- day-column width;
- header and legend heights;
- row and bar heights;
- title, date, task-label, and legend font sizes;
- resize-handle and pointer-hit dimensions;
- the exact chart width and height, equal to the available viewport.

The layout reserves a proportional label area based on the available width and the longest task label. The remaining width is divided evenly across every visible date. The available vertical space is divided between the header, all task rows, and the legend. Base sizes act as maximums, not minimums: when content density rises, rows, bars, font sizes, swatches, and handles continue shrinking so all content remains visible. No warning, clipping, pagination, or scrolling is introduced.

Long task and legend labels are measured against their allocated space and shrink with the overall typography scale. They are not intentionally truncated. Empty charts still show a short centered date range and reserve the remaining area cleanly.

The on-screen SVG uses the target viewport dimensions directly rather than placing a fixed-size SVG inside an overflow container. The export renderer invokes the same layout rules with the fixed PowerPoint slide area, preserving the same content hierarchy while fitting the chart inside the 16:9 export canvas.

## Pointer Coordinate Mapping

Adaptive day widths must not change the date semantics. Pointer input is converted from screen coordinates into SVG user coordinates through the SVG screen transformation matrix. Move and resize displacement is then calculated from the adaptive day-column width.

Dragging a bar center preserves duration. Dragging either resize handle changes only that endpoint. All operations continue snapping to whole visible dates and retain the existing hidden-weekend behavior.

Clicking a task selects it and reveals resize handles. Clicking any empty chart or workspace area clears selection and hides the handles. Pressing Escape also clears selection. Task-bar and handle pointer events stop propagation so selecting or dragging a task does not immediately trigger background deselection.

## Direct Title Editing

The title is displayed in the chart header rather than duplicated in the toolbar. In editor mode, it behaves like directly editable text with no permanent input border or filled control background. Clicking or focusing the title enters edit mode and selects its text naturally.

- Enter or blur commits a trimmed value.
- A blank committed value normalizes to `Untitled Gantt Chart`.
- Escape restores the value from before editing.
- Export mode renders normal SVG text and never includes the editor control or focus treatment.

## Task Editor Suggestions

The task editor receives unique existing categories and colors derived from the current chart document. This avoids a schema migration and keeps suggestions synchronized with actual chart usage.

Category becomes an editable combobox. It lists existing category names, allows keyboard selection, and still accepts a new typed value.

Color becomes a swatch dropdown showing unique colors already used by chart tasks. Choosing a swatch updates the draft immediately. A custom color control remains available so a user can introduce a new color. The selected color and its hex value remain unambiguous and accessible.

## Copy Image and Export PNG

Copy Image and Export PNG share one export preparation pipeline:

1. Render the complete chart in export mode using the PowerPoint slide layout.
2. Rasterize it onto the same white 16:9 canvas at 3840×2160 pixels.
3. Return the PNG as both a `Blob` and byte array without performing duplicate rasterization.
4. Export PNG opens the native save dialog and writes those bytes.
5. Copy Image writes the decoded PNG image to the system clipboard.

The desktop implementation uses Tauri's official clipboard-manager plugin with only image-write permission enabled. The PNG bytes are decoded through Tauri's image API and passed to the clipboard plugin; temporary native image resources are released after the write. The browser preview uses the browser `ClipboardItem` image path when available, or a preview mock when the embedded browser blocks native clipboard access.

The two actions appear beside each other as icon-only buttons. Copy uses a copy/image icon and Export uses a download icon. Both provide accessible labels and hover tooltips. A fixed-width status area reports `Copying…`, `Copied`, `Preparing PNG…`, `PNG exported`, or a concise retryable failure without shifting toolbar controls.

## State and Data Flow

`App` continues to own the chart document, selected task, dialog state, drag preview, autosave state, and export state. It adds a copy phase alongside export phase and passes existing category/color suggestions to the task dialog.

The adaptive layout is derived state and is never persisted. Resizing the window recalculates geometry without modifying or auto-saving the chart document. Title edits, task edits, weekend settings, dragging, resizing, adding, and deleting remain the only persistent chart changes.

The browser preview continues to supply safe Tauri command mocks for load/save/export. It is extended for the clipboard command so UI behavior and success/error status can be reviewed in the already-open Codex browser.

## Error Handling

- A temporarily zero-size workspace delays chart rendering until valid dimensions are available.
- Copy and export failures leave the active document unchanged and expose retry through the same action.
- Clipboard denial or unsupported browser clipboard behavior is reported as `Could not copy image`; it does not fall back to downloading automatically.
- Invalid task fields remain in the dialog with field-specific errors.
- Density never causes an error, warning, scrollbar, or task omission; the chart continues shrinking.
- Existing persistence recovery and autosave retry behavior remains unchanged.

## Accessibility

- Icon-only actions have stable accessible names and visible tooltips.
- The inline title supports focus, Enter, Escape, and blur behavior.
- The category combobox supports typing, arrow navigation, selection, and an associated label.
- Color suggestions expose a textual color value in addition to a swatch.
- Selected task state is announced with `aria-pressed` or an equivalent selected-state attribute.
- Background click and Escape produce the same deselection result.
- Focus outlines remain visible without appearing in export output.

## Verification Strategy

### Layout tests

- The calculated chart width and height exactly match the workspace remaining inside 1440×900 and 1050×650 application windows after toolbar space is removed.
- Dense date ranges and large task sets produce smaller positive geometry with no overflow.
- All task rows, the header, and legend fit within the returned height.
- Long task labels scale to fit their label allocation.
- The current-day marker is rendered after task bars and has no `Today` text.

### Interaction tests

- Clicking blank workspace and pressing Escape each clear task selection.
- Task pointer events do not trigger background deselection.
- Drag and resize calculations remain correct with non-default adaptive day widths.
- Direct title editing commits on Enter/blur, restores on Escape, and normalizes blank text.
- Category suggestions are unique, reusable, and allow a new typed category.
- Color suggestions are unique, reusable, and allow a new custom color.

### Copy/export tests

- Copy and export request the same PNG renderer and same 3840×2160 output.
- The clipboard bridge writes an image through the Tauri plugin and reports errors.
- Export continues to write the selected PNG path.
- Editor-only title controls, focus state, selection, and resize handles are absent from both outputs.

### Full verification

- Frontend tests, lint, and production build pass.
- Rust tests, format check, and clippy pass.
- Browser inspection confirms no page or chart scrollbars at the available Codex preview size.
- Desktop inspection confirms Copy Image pastes a readable full chart into PowerPoint and Export PNG produces the same visual result.

## Acceptance Criteria

The redesign is complete when the entire chart always fits inside the desktop window without scrollbars; the workspace appears as one flat grouped surface; task/date density causes automatic shrinking; the title edits directly; task names are larger and bold; the orange unlabeled current-day line is foregrounded; selection can be dismissed; category and color values can be reused or newly entered; Copy Image and Export PNG sit together as icon-only actions; and both produce the same complete 16:9 PowerPoint-ready chart.
