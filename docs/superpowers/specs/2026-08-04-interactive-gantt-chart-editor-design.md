# Interactive Gantt Chart Editor Design

**Date:** 2026-08-04  
**Status:** Approved for implementation planning

## Summary

Build a small Windows desktop Gantt chart editor in which the chart itself is the primary editing surface. Users move tasks by dragging bars, change task duration by dragging either edge, and double-click a bar for precise task and date editing. The application automatically saves one chart locally and exports the complete chart as a high-resolution PNG suitable for email and PowerPoint.

The project will follow the proven structure of `C:\Projects\Active\Inventory_Management`: Tauri 2 and Rust for the desktop shell and native file operations, with a Bun-managed React 19, TypeScript, Vite, and Tailwind CSS v4 frontend.

## Goals

- Make common schedule changes directly on the chart.
- Keep all bar movement and resizing aligned to whole calendar days.
- Provide precise start and end date editing through native-style date inputs.
- Independently show or hide Saturday and Sunday.
- Automatically save and restore one chart on the local computer.
- Export an unclipped, presentation-ready PNG of the entire chart.
- Run the desktop development application with `bun run desktop`.

## Non-goals for the First Milestone

- Multiple named projects or loading older chart files.
- Importing Gantt charts from other formats.
- PowerPoint generation or clipboard image copy.
- Task dependencies, milestones, or critical-path calculations.
- Undo and redo.
- Multiple zoom levels or sub-day scheduling.
- Keyboard-driven bar movement.
- Multi-user or network synchronization.

These features may be added after the direct-editing and PNG-export workflow is stable.

## Product Shape

The initial product is a single-window desktop application named **Gantt Chart Creator**. It manages one active chart at a time and opens directly into the editor. The window uses a clean white chart surface inspired by the supplied execution-timeline example.

The top toolbar contains:

- An editable chart title.
- An **Add Task** button.
- An **Export PNG** button.
- A settings icon at the upper right.

The chart contains:

- A left-hand task-label area.
- A right-hand dated timeline with weekday and date headers.
- Vertical day grid lines.
- Colored task bars.
- A marker for today's date when today is inside the visible range.
- A bottom legend derived from the categories used by tasks.

The settings menu contains separate **Show Saturday** and **Show Sunday** controls. Each setting is independent, so the chart can show neither day, either day, or both.

## Architecture

### Desktop and frontend structure

- Bun owns dependency installation and project scripts.
- Vite serves and builds the React frontend.
- Tauri 2 owns the desktop window and calls into Rust.
- Rust owns local chart persistence and the native PNG save operation.
- React owns the editor state, dialogs, settings UI, pointer interactions, and status messages.
- Tailwind CSS v4 and a small set of application CSS rules define the desktop styling.

The repository will use the same broad split as the reference application:

```text
frontend/
  src/
    app/
    components/
    gantt/
    integrations/tauri/
    shared/
  tests/
backend/
  src/
  tests/
```

The root `package.json` will expose `bun run desktop`, which starts Tauri development mode. Tauri's `beforeDevCommand` will start the Vite frontend.

### Rendering approach

The application uses a hybrid HTML and SVG design:

- HTML renders the window shell, toolbar, menus, dialogs, buttons, inputs, and status messages.
- SVG renders the exportable chart: date header, labels, grid, task bars, today marker, and legend.

The same SVG chart renderer is used for interactive display and PNG export. A shared layout model calculates chart dimensions and coordinates before rendering. This avoids maintaining separate editor and export layouts and ensures that the exported image matches the on-screen chart.

Editor-only SVG elements, such as selection outlines and resize handles, are marked as non-exportable and omitted from the export render.

## Data Model

The root chart document contains:

- A schema version.
- The chart title.
- The Saturday and Sunday visibility settings.
- An ordered list of tasks.

Each task contains:

- A stable unique identifier.
- A task name.
- A start date stored as a date-only ISO value (`YYYY-MM-DD`).
- An inclusive end date stored as a date-only ISO value.
- A category name.
- A category color.

Dates are treated as local calendar dates rather than timestamps. This avoids timezone shifts and daylight-saving errors in a whole-day scheduling tool.

Each task must cover at least one calendar date, so its inclusive end date can never precede its start date. Tasks retain their actual calendar dates when weekends are hidden.

## Timeline and Date Semantics

The visible timeline range is derived from the earliest task start and latest task end, with a small amount of day padding on both sides. The range is recalculated when tasks are added, moved, resized, or edited.

A visible-day sequence is calculated from that calendar range and the weekend settings. Hidden weekend dates do not occupy columns. Because tasks retain calendar dates, a task spanning a hidden weekend appears continuous across the adjacent visible weekdays while its precise dates remain available in the task editor.

Every pointer interaction resolves through the visible-day sequence rather than raw pixels alone. Movement and resizing therefore snap exactly to whole visible dates for all four weekend-display combinations.

Direct dragging can land only on dates that currently have visible columns. The precise date editor may still assign a hidden Saturday or Sunday. For display, a hidden endpoint is compressed to the seam between its neighboring visible dates. A task whose entire duration falls on hidden weekend dates is drawn as a minimum-width marker at that seam so it remains visible, selectable, and editable.

## Editing Interactions

### Selecting and moving a task

- Clicking a task bar selects it and reveals resize handles.
- Dragging the center of a bar previews a move.
- Whole-day displacement is calculated from the pointer position.
- The task duration is preserved.
- Releasing the pointer commits the move and schedules an auto-save.

### Resizing a task

- Dragging the left handle changes the start date.
- Dragging the right handle changes the inclusive end date.
- The opposite edge stays fixed.
- Resizing cannot reduce the task below one calendar date.
- Releasing the pointer commits the resize and schedules an auto-save.

### Precise task editing

Double-clicking a bar opens a compact modal editor containing:

- Task name.
- Start date input with calendar picker.
- End date input with calendar picker.
- Category name.
- Category color.

Saving validates the fields, updates the chart, and schedules an auto-save. Canceling closes the dialog without changing the task.

### Adding a task

**Add Task** opens the same modal in create mode. New-task defaults are based on the current chart range and use a short valid duration. Saving adds the task to the end of the ordered list, selects it, expands the date range if needed, and schedules an auto-save.

Task deletion is available inside the edit dialog and requires confirmation. Deleting the final task leaves an empty chart with a short date range centered on today so another task can be added.

## State and Data Flow

React holds the active chart document and transient interaction state separately:

- Persistent chart state includes the title, settings, and tasks.
- Transient state includes selection, hover, drag preview, open menus, dialog drafts, and status messages.

Pointer movement updates only the transient preview. Pointer release validates and commits one persistent change. This prevents disk writes during every pointer event.

After a committed change, the application debounces a save request through the Tauri bridge. Save success updates a subtle saved-status indicator. Save failure preserves the in-memory edits and shows a retryable error.

## Local Persistence

Rust serializes the versioned chart document as JSON in Tauri's application-data directory. Writes use a temporary sibling file followed by replacement so an interrupted write is less likely to damage the last valid document.

Startup behavior is:

1. Request the saved document from Rust.
2. If no document exists, load an editable starter chart.
3. If a valid document exists, load it.
4. If the document cannot be read or validated, preserve it, report the error, and offer an explicit reset to the starter chart.

The first milestone does not expose the persistence file as a user-managed project file. A future load/save-project feature can migrate the same versioned document format into portable files.

## PNG Export

Export is a primary workflow. Clicking **Export PNG** performs these steps:

1. Build an export-mode SVG from the current chart document and shared layout model.
2. Include every task and the entire calculated date range, independent of the current window size or scroll position.
3. Exclude selection handles, hover states, menus, dialogs, toolbars, and status messages.
4. Use a solid white background and presentation-safe text and colors.
5. Rasterize at a high pixel density so text remains clear when inserted into email or PowerPoint.
6. Open a native save dialog with a sanitized filename based on the chart title.
7. Send the PNG bytes and chosen path to Rust for writing.

Canceling the native dialog makes no changes and is not treated as an error. A failed rasterization or file write displays a clear message and leaves the editor state untouched.

Export dimensions auto-fit the full chart. The exported image is not forced into a 16:9 canvas and never intentionally clips tasks.

## Error Handling and Feedback

- Invalid dialog fields remain visible with specific inline messages.
- The end date cannot be earlier than the start date.
- Dragging and resizing are canceled safely if pointer capture is lost before a valid commit.
- Auto-save failure does not discard current edits.
- Invalid saved data is never silently overwritten.
- Export failures are reported without altering the chart.
- Short, non-blocking status messages report saving, saved, export success, and recoverable failures.

## Accessibility and Usability

- Buttons and icon controls have visible labels or accessible names.
- The settings menu and task dialog support keyboard focus and Escape-to-close behavior.
- Resize handles have sufficient pointer target size even when visually compact.
- Color is not the only category indicator; category names appear in the legend and task editor.
- Bars and labels use readable contrast on the white chart background.

Keyboard-based date movement is deferred, but tasks remain selectable and precisely editable through the keyboard-accessible dialog.

## Verification Strategy

### Frontend unit tests

- Calendar range and visible-day generation.
- All four Saturday/Sunday visibility combinations.
- Hidden-weekend endpoints and weekend-only task markers.
- Date-to-column and column-to-date mapping.
- Whole-day move calculations.
- Left- and right-edge resize calculations.
- Minimum one-day duration enforcement.
- Shared layout dimensions for varying task counts and date ranges.
- Export-mode filtering of editor-only elements.

### Frontend component tests

- Adding, editing, and deleting a task.
- Opening the editor by double-clicking a bar.
- Canceling a dialog without mutation.
- Pointer drag and resize preview followed by commit.
- Settings changes updating the visible timeline.
- Date fields reflecting committed drag and resize changes.
- Auto-save requests occurring after committed changes rather than pointer movement.

### Rust tests

- Saving and loading a valid versioned document in an isolated temporary directory.
- Atomic replacement behavior.
- Missing-file behavior.
- Invalid JSON and invalid schema handling without overwriting the source.
- PNG write success and propagated write errors.

### Completion checks

- Frontend lint passes.
- Frontend tests pass.
- Rust tests and `cargo clippy` pass.
- Production frontend and Tauri builds pass.
- `bun run desktop` launches the application successfully.
- A manual smoke check confirms direct editing, restart persistence, independent weekend settings, and a complete readable PNG export.

## First-Milestone Acceptance Criteria

The milestone is complete when a user can launch the app with `bun run desktop`, add a task, move it by dragging its bar, resize it from either edge, double-click it to enter exact dates, independently toggle Saturday and Sunday, restart the app without losing the chart, and export the complete chart as a high-resolution PNG with no editor controls or clipped content.
