# Persistent Timeline Range and Adaptive Header Design

**Date:** 2026-08-05
**Status:** Approved design; written specification ready for user review

## Summary

Add a saved, user-controlled timeline range and adapt the date header to the amount of time shown. The chosen range drives the editor, clipboard image, and PNG export. Every task name remains visible, while task bars are clipped at the chosen boundaries.

This change also tightens task-row spacing, introduces an application-styled range picker, and removes the persistent `Saved` and `Copied` toolbar words. The complete chart must continue fitting without page or chart scrollbars.

## Goals

- Select an inclusive start and end date and persist that selection with the chart.
- Offer Auto-fit for existing documents and users who do not want a fixed range.
- Use the same range and header behavior on screen, in copied images, and in exports.
- Keep all task labels even when their bars do not intersect the selected range.
- Adapt from detailed daily labels to relative week labels as the range grows.
- Compact small task lists and shrink dense task lists enough to avoid scrolling.
- Match the range picker to the application's visual language.
- Remove persistent success text from the toolbar.

## Non-goals

- Hiding out-of-range tasks or changing their stored dates.
- Chart scrolling, pagination, density warnings, or a separate export range.
- Time-of-day scheduling or ISO calendar-week numbering.

## Toolbar and Range Picker

Add one compact timeline control near Copy Image and Export PNG. It combines a calendar-range icon with a concise effective-range summary and uses the toolbar's existing border, radius, typography, hover, and focus styles.

The control opens a custom popover containing labeled Start and End fields, a compact month calendar for the active endpoint, month navigation, Apply, and Auto-fit. The calendar visually distinguishes today, both endpoints, and the dates between them. Start and End remain directly accessible to keyboard and assistive-technology users.

Apply is disabled while either value is incomplete or End precedes Start. Escape and outside click cancel the draft. Applying sets a custom range; Auto-fit removes it and immediately returns to derived-range behavior. The toolbar summary always reports the effective range.

## Persisted Data Model

Add an optional range to chart settings:

```ts
interface TimelineRange {
  startDate: IsoDate;
  endDate: IsoDate;
}

interface ChartSettings {
  showSaturday: boolean;
  showSunday: boolean;
  timelineRange?: TimelineRange;
}
```

The Rust model mirrors this as an optional nested structure with a Serde default. Frontend and backend validation require valid date-only ISO values and an inclusive End no earlier than Start.

The additive optional field remains compatible with schema-version-1 documents. Missing `timelineRange` means Auto-fit. Applying a range sets it, Auto-fit removes it, and both use the existing document update and autosave flow.

## Range Resolution

Layout resolves one effective range before calculating geometry:

1. Use a valid saved `timelineRange` when present.
2. Otherwise use the existing automatic range derivation.
3. Treat both endpoints as inclusive local calendar dates.
4. Apply Saturday and Sunday visibility when building visible dates.

A custom range takes precedence over tasks and today; it never expands automatically. Weekend settings do not alter its stored endpoints. The orange today line appears only when today maps inside the effective range, contains no text, and renders above the grid and bars.

## Adaptive Date Header

The inclusive calendar span selects a semantic tier. Available pixel width then thins labels within that tier, keeping behavior predictable without collisions.

### One through fourteen days

Show each visible date on two lines: abbreviated weekday above short month/day, such as `Tue` above `Jul 28`. Hidden weekends have no columns.

### Fifteen through twenty-eight days

Show numeric month/day labels such as `08/24`. If necessary, omit evenly spaced intermediate labels while retaining aligned grid positions and attempting to keep the first and last visible labels.

### Twenty-nine days through six calendar months

Use two levels. An upper month band spans the visible part of each month and includes the year when needed for clarity. Evenly sampled day-of-month markers appear below. Month boundaries stay visible even when intermediate days are skipped; partial first and last months use partial-width bands.

The medium tier applies while End is earlier than Start shifted forward by six calendar months.

### Longer than six calendar months

When End reaches or passes Start shifted forward by six calendar months, retain month bands and replace day labels with chart-relative groups named `Week 1`, `Week 2`, and so on. Count from the selected start rather than the ISO calendar. A final partial week is valid. When dense, skip week labels at a regular interval while preserving week grid positions.

Task bars retain whole-day precision in every tier. Header grouping changes labels and grid emphasis, not stored dates or drag/resize semantics.

## Label Thinning

Header layout compares estimated rendered label width with spacing between candidate ticks and chooses a deterministic regular stride that prevents overlap. It favors the first and last visible dates, month boundaries, and the first relative week. An anchor may replace a nearby sampled label to preserve minimum spacing. Labels never rotate, overflow, or create a scrollbar.

## Task Visibility and Clipping

The ordered task list is independent of range intersection, so every task name remains visible in the editor and output.

- A task inside the range renders normally.
- A task crossing one boundary clips exactly at that chart edge.
- A task spanning both boundaries fills the timeline width.
- A task wholly outside the range has no visible bar but keeps its label and row.

Clipping is presentational and never mutates task dates. Selection handles appear only for visible, unclipped endpoints. A wholly hidden bar cannot be selected from empty timeline space; adjusting the range or choosing Auto-fit brings it back into view for bar editing. Existing hidden-weekend seam behavior remains in effect when the seam is within the range.

## Compact Vertical Layout

Rows no longer expand merely to consume all space between header and legend. The layout uses:

```text
rowStep = min(preferredRowStep, availableTaskHeight / taskCount)
```

Small task lists form a compact, top-aligned group below the header. Unused height stays as clean chart space before the bottom legend rather than becoming excessive gaps. Dense lists continue shrinking row step, bar height, task-label type, and handles together so all tasks fit without warnings or scrolling. The grid may span the available chart area for visual continuity. The export layout applies the same rule to its 16:9 canvas.

## Copy, Export, and Status Feedback

Remove the visible `Saved` and `Copied` text. Copy and Export remain adjacent icon-only actions.

- A busy icon treatment represents an in-progress copy or export.
- Success silently restores the normal icon.
- Failure marks the relevant icon and exposes an explanatory tooltip; clicking retries.
- Autosave success is silent, while autosave failure may show a compact error icon.
- A visually hidden polite live region announces progress and results without reserving toolbar width.

Copy and export continue sharing one PowerPoint-ready PNG pipeline. Both receive the current document and therefore resolve the same range and adaptive header behavior.

## State and Component Responsibilities

`App` continues owning the persisted document and transient menu/action states. It adds range-popover state and a draft range discarded on cancel. The range picker handles calendar navigation, endpoint selection, validation, and emitting Apply or Auto-fit; it never saves directly.

The layout layer owns effective-range resolution, tier selection, month/day/week header groups, collision-safe label stride, bar clipping, and compact vertical metrics. `GanttChart` only renders the resulting semantic geometry and must not duplicate thresholds or clipping rules in JSX.

## Error Handling and Accessibility

- Start and End have programmatic labels, active-endpoint state, and visible focus styles.
- Calendar days expose complete dates through accessible names rather than numeric day text alone.
- Keyboard users can navigate days and months, select either endpoint, apply, use Auto-fit, and cancel with Escape.
- The range control exposes the current effective range in its accessible description.
- Invalid saved custom ranges are rejected by document validation rather than silently corrected.
- If weekend settings remove every date in a very short range, layout shows a minimal boundary representation so the picker remains reachable.
- Icon-only Copy and Export retain stable accessible names and tooltips.
- Hidden announcements do not cause layout shifts.

## Verification Strategy

### Model and persistence

- Frontend and Rust parsers accept a valid optional range and reject malformed or reversed dates.
- Existing schema-version-1 documents without the field still load.
- Apply persists a range; Auto-fit removes it; both use normal autosave.

### Header and layout

- Boundaries at 14/15 days, 28/29 days, exactly six calendar months, and beyond six months select the intended tier.
- Short ranges show weekday plus month/day; four-week ranges show numeric month/day.
- Medium ranges create correct partial/full month bands and thinned day ticks.
- Long ranges create relative weeks beginning at `Week 1` and thin labels deterministically.
- Narrow layouts do not overlap labels or overflow.
- Small task lists stay compact; dense lists shrink enough to fit.
- Weekend settings preserve range endpoints while removing hidden-day columns.

### Clipping and interactions

- Labels remain for tasks before, after, and spanning the selected range.
- Bars clip at either or both boundaries without mutating task dates.
- A wholly out-of-range task produces no bar but keeps its row.
- Today renders only inside the range, without text, above grid and bars.
- Drag and resize preserve whole-day semantics in every header tier.

### Components and output

- The picker applies valid dates, disables invalid drafts, cancels without mutation, and restores Auto-fit.
- Keyboard calendar navigation and Escape behavior work.
- The toolbar contains no visible `Saved` or `Copied` text.
- Progress and results are announced through the hidden live region.
- Copy and export receive the same current range and header rules.

### Full verification

- Frontend tests, lint, and production build pass.
- Rust tests, format check, and clippy pass.
- Browser inspection confirms zero page and chart overflow.
- Browser review covers two-week, four-week, multi-month, and longer-than-six-month ranges.
- Copied and exported PNGs preserve the selected range, clipped bars, compact rows, and adaptive header on the 16:9 canvas.

## Acceptance Criteria

The change is complete when a user can select and persist an inclusive range from an application-styled picker; restore Auto-fit; reopen the chart with the same custom range; see the requested daily, numeric-date, month/day, and relative-week header tiers; retain every task label while bars clip cleanly; view compact task spacing without a scrollbar; see no persistent `Saved` or `Copied` words; and copy or export a matching 16:9 chart image.
