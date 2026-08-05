# Persistent Timeline Range and Adaptive Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted timeline-range picker, adaptive date headers, clipped task bars, compact task rows, and silent icon-based action feedback while preserving the no-scroll PowerPoint-ready chart workflow.

**Architecture:** An optional `TimelineRange` lives in chart settings; pure range and header modules resolve the effective dates and produce semantic header groups before the SVG layout calculates geometry. The shared `GanttChart` renderer consumes that model for both editor and 16:9 output, while a controlled React popover edits the persisted range through `App` and the existing autosave flow.

**Tech Stack:** React 19, TypeScript 6, SVG, Vite 8, Vitest 4, Testing Library, Bun 1.3, Tauri 2, Rust, Serde, Lucide React.

## Global Constraints

- Preserve every existing uncommitted change; never reset or overwrite unrelated work.
- Before each implementation commit, inspect `git diff --cached` and stage only task-owned files or hunks. If pre-existing work cannot be separated safely, leave that task uncommitted and report it.
- Keep schema version `1`; `settings.timelineRange` is optional and backward compatible.
- Treat range endpoints and task endpoints as inclusive local `YYYY-MM-DD` calendar dates.
- A custom range takes precedence over task extents and today; Auto-fit retains the existing derived range behavior.
- Keep every task label and row. Clip bars at range edges and render no bar for a wholly out-of-range task.
- Never mutate task dates as a consequence of clipping or range selection.
- Show today only inside the effective range, without text, above grid lines and task bars.
- Use the approved tiers: 1–14 days detailed, 15–28 days numeric, 29 days–under six calendar months month/day, and six calendar months or longer month/relative-week.
- Long-range labels are chart-relative (`Week 1`, `Week 2`, …), not ISO week numbers.
- The page and chart expose no scrollbar, density warning, pagination, or manual zoom.
- Editor, Copy Image, and Export PNG consume the same persisted document and rendering rules.
- Do not add a date-picker dependency; use the existing stack.

## File Responsibility Map

- `frontend/src/gantt/model.ts`: `TimelineRange` and frontend document validation.
- `backend/src/chart_document.rs`: Serde representation and backend range validation.
- `frontend/src/gantt/dateMath.ts`: calendar-safe day and month arithmetic.
- `frontend/src/gantt/timelineRange.ts`: Auto-fit/custom resolution, visible-date fallback, and summary formatting.
- `frontend/src/gantt/textMetrics.ts`: shared deterministic SVG text measurement.
- `frontend/src/gantt/timelineHeader.ts`: tier choice, month/week grouping, tick thinning, and grid positions.
- `frontend/src/gantt/layout.ts`: compact metrics, clipped task geometry, legend, and today position.
- `frontend/src/gantt/GanttChart.tsx`: semantic SVG header, task rows, legend, and marker z-order.
- `frontend/src/gantt/TaskBar.tsx`: visible-bar interaction and clipped-endpoint handle rules.
- `frontend/src/gantt/TimelineRangePicker.tsx`: range trigger, draft fields, calendar, keyboard behavior, Apply, and Auto-fit.
- `frontend/src/app/App.tsx`: document updates, autosave, picker composition, output staging, and action state.
- `frontend/src/app/index.css`: picker/calendar, adaptive header, action-state, and screen-reader-only styles.
- `README.md`: user-facing timeline selection, clipping, and adaptive-header behavior.
- `frontend/tests/model.test.ts` and `backend/tests/storage_flow.rs`: compatibility and validation.
- `frontend/tests/timeline-range.test.ts`: pure range and month arithmetic.
- `frontend/tests/timeline-header.test.ts`: tier boundaries, grouping, and thinning.
- `frontend/tests/layout.test.ts`: clipping, compact rows, today, and fitted geometry.
- `frontend/tests/gantt-chart.test.tsx` and `frontend/tests/bar-interactions.test.tsx`: SVG and clipped handles.
- `frontend/tests/timeline-range-picker.test.tsx`: picker interaction and keyboard behavior.
- `frontend/tests/app-shell.test.tsx`, `frontend/tests/copy-image.test.tsx`, and `frontend/tests/editor-flow.test.tsx`: persistence, toolbar feedback, and output integration.

---

### Task 1: Persist an Optional Timeline Range

**Files:**
- Modify: `frontend/src/gantt/model.ts`
- Modify: `frontend/tests/model.test.ts`
- Modify: `backend/src/chart_document.rs`
- Modify: `backend/tests/storage_flow.rs`

**Interfaces:**
- Produces: `TimelineRange { startDate: IsoDate; endDate: IsoDate }` and `ChartSettings.timelineRange?: TimelineRange`.
- Preserves: schema version `1` documents whose settings contain only the two weekend booleans.

- [ ] **Step 1: Add failing frontend compatibility and validation tests**

Add to `frontend/tests/model.test.ts`:

```ts
it("loads a valid optional timeline range", () => {
  const parsed = parseChartDocument({
    schemaVersion: 1,
    title: "Roadmap",
    settings: {
      showSaturday: false,
      showSunday: false,
      timelineRange: { startDate: "2026-08-01", endDate: "2026-08-28" },
    },
    tasks: [],
  });
  expect(parsed.settings.timelineRange).toEqual({
    startDate: "2026-08-01",
    endDate: "2026-08-28",
  });
});

it.each([
  { startDate: "2026-02-30", endDate: "2026-03-02" },
  { startDate: "2026-08-05", endDate: "2026-08-04" },
])("rejects invalid timeline range %#", (timelineRange) => {
  expect(() => parseChartDocument({
    schemaVersion: 1,
    title: "Roadmap",
    settings: { showSaturday: false, showSunday: false, timelineRange },
    tasks: [],
  })).toThrow(/timeline range/i);
});
```

Retain the existing test without `timelineRange`; it is the backward-compatibility assertion.

- [ ] **Step 2: Run the frontend model test and confirm failure**

Run: `bun run test -- frontend/tests/model.test.ts`

Expected: FAIL because `ChartSettings` and `parseChartDocument` do not preserve or validate the new field.

- [ ] **Step 3: Define and parse the frontend type**

Add this public type and field in `model.ts`:

```ts
export interface TimelineRange {
  startDate: IsoDate;
  endDate: IsoDate;
}

export interface ChartSettings {
  showSaturday: boolean;
  showSunday: boolean;
  timelineRange?: TimelineRange;
}
```

Parse the optional nested object explicitly rather than casting all settings:

```ts
let timelineRange: TimelineRange | undefined;
if (settings.timelineRange !== undefined) {
  if (!settings.timelineRange || typeof settings.timelineRange !== "object") {
    throw new Error("timeline range must be an object");
  }
  const range = settings.timelineRange as Record<string, unknown>;
  if (typeof range.startDate !== "string" || typeof range.endDate !== "string"
      || !isValidIsoDate(range.startDate) || !isValidIsoDate(range.endDate)) {
    throw new Error("timeline range dates must use valid YYYY-MM-DD values");
  }
  if (range.endDate < range.startDate) {
    throw new Error("timeline range endDate must not precede startDate");
  }
  timelineRange = { startDate: range.startDate, endDate: range.endDate };
}
```

Return explicit weekend fields plus `...(timelineRange ? { timelineRange } : {})`.

- [ ] **Step 4: Add failing Rust round-trip and rejection tests**

Import `TimelineRange` in `backend/tests/storage_flow.rs`, initialize existing samples with `timeline_range: None`, then add:

```rust
#[test]
fn persists_an_optional_timeline_range() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let mut document = sample();
    document.settings.timeline_range = Some(TimelineRange {
        start_date: "2026-08-01".into(),
        end_date: "2026-08-28".into(),
    });

    save_chart_to(&path, &document).unwrap();
    assert_eq!(load_chart_from(&path).unwrap(), Some(document));
}

#[test]
fn rejects_a_reversed_timeline_range() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let mut document = sample();
    document.settings.timeline_range = Some(TimelineRange {
        start_date: "2026-08-05".into(),
        end_date: "2026-08-04".into(),
    });

    assert!(save_chart_to(&path, &document).is_err());
    assert!(!path.exists());
}
```

Add this legacy JSON assertion:

```rust
let legacy = serde_json::json!({
    "schemaVersion": 1,
    "title": "Legacy",
    "settings": { "showSaturday": false, "showSunday": false },
    "tasks": [],
});
let parsed: ChartDocument = serde_json::from_value(legacy).unwrap();
assert_eq!(parsed.settings.timeline_range, None);
```

- [ ] **Step 5: Run the Rust test and confirm missing types**

Run from `backend`: `cargo test --test storage_flow`

Expected: FAIL because `TimelineRange` and `ChartSettings.timeline_range` do not exist.

- [ ] **Step 6: Implement backend serde and validation**

Add in `backend/src/chart_document.rs`:

```rust
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRange {
    pub start_date: String,
    pub end_date: String,
}

pub struct ChartSettings {
    pub show_saturday: bool,
    pub show_sunday: bool,
    #[serde(default)]
    pub timeline_range: Option<TimelineRange>,
}
```

At the start of `ChartDocument::validate`, validate both range dates with `is_valid_date` and reject `end_date < start_date` using the same wording as the frontend.

- [ ] **Step 7: Run both model suites**

Run: `bun run test -- frontend/tests/model.test.ts`

Run from `backend`: `cargo test --test storage_flow`

Expected: both PASS, including legacy documents without the optional field.

- [ ] **Step 8: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/model.ts frontend/tests/model.test.ts backend/src/chart_document.rs backend/tests/storage_flow.rs`

Stage only Task 1 hunks, inspect `git diff --cached`, and commit `feat: persist gantt timeline range`. If existing hunks cannot be isolated, leave them unstaged and record the passing commands.


---

### Task 2: Extract Effective-Range and Calendar-Month Math

**Files:**
- Modify: `frontend/src/gantt/dateMath.ts`
- Create: `frontend/src/gantt/timelineRange.ts`
- Create: `frontend/tests/timeline-range.test.ts`

**Interfaces:**
- Produces: `addCalendarMonths`, `deriveAutoTimelineRange`, `resolveTimelineRange`, `visibleDatesForTimelineRange`, `rangeContainsDate`, and `formatTimelineRangeSummary`.
- Consumes: Task 1's `TimelineRange` and existing weekend-aware date helpers.

- [ ] **Step 1: Write failing month-arithmetic and resolution tests**

Create `frontend/tests/timeline-range.test.ts` with:

```ts
import { addCalendarMonths } from "@/gantt/dateMath";
import { createStarterChart } from "@/gantt/starterChart";
import {
  formatTimelineRangeSummary,
  rangeContainsDate,
  resolveTimelineRange,
  visibleDatesForTimelineRange,
} from "@/gantt/timelineRange";

it("clamps calendar-month addition to the target month", () => {
  expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addCalendarMonths("2028-01-31", 1)).toBe("2028-02-29");
});

it("uses a custom range exactly without padding it", () => {
  const chart = createStarterChart("2026-08-04");
  chart.settings.timelineRange = { startDate: "2026-08-01", endDate: "2026-08-28" };
  expect(resolveTimelineRange(chart, "2026-08-04")).toEqual(chart.settings.timelineRange);
});

it("keeps the existing auto-fit behavior when no custom range exists", () => {
  const chart = createStarterChart("2026-08-04");
  const range = resolveTimelineRange(chart, "2026-08-04");
  expect(range.startDate).toBe("2026-08-03");
  expect(range.endDate).toBe("2026-08-12");
});

it("returns one boundary date when weekend settings hide the whole range", () => {
  expect(visibleDatesForTimelineRange(
    { startDate: "2026-08-08", endDate: "2026-08-09" },
    { showSaturday: false, showSunday: false },
  )).toEqual(["2026-08-08"]);
});

it("checks inclusive containment and formats a concise summary", () => {
  const range = { startDate: "2026-08-01", endDate: "2026-08-14" };
  expect(rangeContainsDate(range, "2026-08-14")).toBe(true);
  expect(rangeContainsDate(range, "2026-08-15")).toBe(false);
  expect(formatTimelineRangeSummary(range)).toBe("Aug 1, 2026 – Aug 14, 2026");
});
```

- [ ] **Step 2: Run the focused test and confirm missing exports**

Run: `bun run test -- frontend/tests/timeline-range.test.ts`

Expected: FAIL because the new module and `addCalendarMonths` do not exist.

- [ ] **Step 3: Implement calendar-month addition**

Add to `dateMath.ts` using UTC components so DST never changes the date:

```ts
export function addCalendarMonths(value: IsoDate, amount: number): IsoDate {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return [
    targetYear,
    String(targetMonth + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}
```

- [ ] **Step 4: Move automatic range resolution into `timelineRange.ts`**

Implement these exact signatures:

```ts
export function deriveAutoTimelineRange(document: ChartDocument, today: IsoDate): TimelineRange;
export function resolveTimelineRange(document: ChartDocument, today: IsoDate): TimelineRange;
export function visibleDatesForTimelineRange(range: TimelineRange, settings: ChartSettings): IsoDate[];
export function rangeContainsDate(range: TimelineRange, date: IsoDate): boolean;
export function formatTimelineRangeSummary(range: TimelineRange): string;
```

`deriveAutoTimelineRange` must reproduce the current `layout.ts` logic, including today and one visible-day outer padding. For an empty chart, retain five visible days on either side before applying the existing outer padding. `resolveTimelineRange` returns a copied custom range when present, otherwise the derived range.

Use this fallback for a range containing only hidden weekend dates:

```ts
export function visibleDatesForTimelineRange(range: TimelineRange, settings: ChartSettings): IsoDate[] {
  const visible = visibleDatesBetween(range.startDate, range.endDate, settings);
  return visible.length > 0 ? visible : [range.startDate];
}
```

Format each summary endpoint with `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })`.

- [ ] **Step 5: Run range and existing layout tests**

Run: `bun run test -- frontend/tests/timeline-range.test.ts frontend/tests/date-math.test.ts frontend/tests/layout.test.ts`

Expected: the new range tests PASS; existing layout tests remain PASS because `layout.ts` has not switched to the extracted resolver yet.

- [ ] **Step 6: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/dateMath.ts frontend/src/gantt/timelineRange.ts frontend/tests/timeline-range.test.ts`

Stage only Task 2 work, inspect it, and commit `feat: resolve gantt timeline ranges`; otherwise retain the verified uncommitted changes.


---

### Task 3: Build the Adaptive Header Model

**Files:**
- Create: `frontend/src/gantt/textMetrics.ts`
- Create: `frontend/src/gantt/timelineHeader.ts`
- Create: `frontend/tests/timeline-header.test.ts`
- Modify: `frontend/src/gantt/layout.ts`

**Interfaces:**
- Produces: `TimelineHeaderTier`, `TimelineHeaderBand`, `TimelineHeaderLabel`, `TimelineHeaderModel`, `chooseTimelineHeaderTier`, and `buildTimelineHeader`.
- Preserves: `layout.ts` re-exports `estimateTextWidth` so current imports remain valid during incremental work.

- [ ] **Step 1: Write failing tier-boundary tests**

Create `frontend/tests/timeline-header.test.ts`:

```ts
import { visibleDatesBetween } from "@/gantt/dateMath";
import { buildTimelineHeader, chooseTimelineHeaderTier } from "@/gantt/timelineHeader";

const weekdays = { showSaturday: false, showSunday: false };

it.each([
  ["2026-08-01", "2026-08-14", "detailed-days"],
  ["2026-08-01", "2026-08-15", "compact-days"],
  ["2026-08-01", "2026-08-28", "compact-days"],
  ["2026-08-01", "2026-08-29", "month-days"],
  ["2026-01-01", "2026-06-30", "month-days"],
  ["2026-01-01", "2026-07-01", "month-weeks"],
])("maps %s through %s to %s", (startDate, endDate, expected) => {
  expect(chooseTimelineHeaderTier({ startDate, endDate })).toBe(expected);
});
```

- [ ] **Step 2: Add failing grouping and thinning tests**

Add:

```ts
it("creates partial month bands and sampled days", () => {
  const range = { startDate: "2026-08-20", endDate: "2026-10-10" };
  const header = buildTimelineHeader({
    range,
    visibleDates: visibleDatesBetween(range.startDate, range.endDate, weekdays),
    dayWidth: 14,
    fontSize: 11,
  });
  expect(header.tier).toBe("month-days");
  expect(header.bands.map((band) => band.label)).toEqual(["August", "September", "October"]);
  expect(header.bands[0].startIndex).toBe(0);
  expect(header.labels.length).toBeLessThan(header.gridLines.length);
});

it("uses chart-relative weeks and thins them at narrow widths", () => {
  const range = { startDate: "2026-01-15", endDate: "2026-10-15" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 2, fontSize: 11 });
  expect(header.tier).toBe("month-weeks");
  expect(header.labels[0].label).toBe("Week 1");
  expect(header.labels.some((label) => label.label === "Week 2")).toBe(false);
  expect(header.gridLines.length).toBeGreaterThan(header.labels.length);
});

it("keeps both lines for a two-week view", () => {
  const range = { startDate: "2026-08-03", endDate: "2026-08-14" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 60, fontSize: 11 });
  expect(header.labels[0]).toMatchObject({ label: "Mon", secondaryLabel: "Aug 3" });
});
```

- [ ] **Step 3: Run the new tests and confirm the module is missing**

Run: `bun run test -- frontend/tests/timeline-header.test.ts`

Expected: FAIL because `timelineHeader.ts` does not exist.

- [ ] **Step 4: Extract shared text measurement**

Move `glyphWidthFactor` and `estimateTextWidth` from `layout.ts` into `textMetrics.ts`, export only `estimateTextWidth`, import it back into `layout.ts`, and re-export it there:

```ts
import { estimateTextWidth } from "@/gantt/textMetrics";
export { estimateTextWidth } from "@/gantt/textMetrics";
```

This avoids a circular import when both layout and header thinning measure text.

- [ ] **Step 5: Define the semantic header interfaces and tier rule**

Create these interfaces in `timelineHeader.ts`:

```ts
export type TimelineHeaderTier =
  | "detailed-days"
  | "compact-days"
  | "month-days"
  | "month-weeks";

export interface TimelineHeaderBand {
  key: string;
  label: string;
  startIndex: number;
  endIndex: number;
}

export interface TimelineHeaderLabel {
  key: string;
  label: string;
  secondaryLabel?: string;
  position: number;
}

export interface TimelineHeaderModel {
  tier: TimelineHeaderTier;
  bands: TimelineHeaderBand[];
  labels: TimelineHeaderLabel[];
  gridLines: number[];
}

export interface BuildTimelineHeaderOptions {
  range: TimelineRange;
  visibleDates: IsoDate[];
  dayWidth: number;
  fontSize: number;
}
```

Implement the exact boundary order:

```ts
export function chooseTimelineHeaderTier(range: TimelineRange): TimelineHeaderTier {
  const days = calendarDayDifference(range.startDate, range.endDate) + 1;
  if (days <= 14) return "detailed-days";
  if (days <= 28) return "compact-days";
  return range.endDate < addCalendarMonths(range.startDate, 6)
    ? "month-days"
    : "month-weeks";
}
```

- [ ] **Step 6: Implement month/week grouping and deterministic thinning**

Build month bands by scanning contiguous `visibleDates` with the same `YYYY-MM`; store zero-based boundary units (`startIndex` inclusive, `endIndex` exclusive). Use `MMMM` labels inside one calendar year and `MMM yyyy` when the range crosses a year.

Use this thinning rule for day and week candidates:

```ts
function thinLabels(
  candidates: TimelineHeaderLabel[],
  dayWidth: number,
  fontSize: number,
): TimelineHeaderLabel[] {
  if (candidates.length < 2) return candidates;
  const maximumWidth = Math.max(...candidates.map((item) => Math.max(
    estimateTextWidth(item.label, fontSize, 600),
    estimateTextWidth(item.secondaryLabel ?? "", fontSize, 500),
  )));
  const smallestGap = Math.min(...candidates.slice(1).map((item, index) =>
    (item.position - candidates[index].position) * dayWidth));
  const stride = Math.max(1, Math.ceil((maximumWidth + 8) / Math.max(0.01, smallestGap)));
  const kept = candidates.filter((_, index) => index % stride === 0);
  const last = candidates.at(-1)!;
  const prior = kept.at(-1)!;
  if (prior.key !== last.key
      && (last.position - prior.position) * dayWidth >= maximumWidth + 8) kept.push(last);
  return kept;
}
```

Generate header candidates as follows:

- Detailed: one candidate at `index + 0.5`, weekday in `label`, `MMM d` in `secondaryLabel`, then apply the same thinning rule only if the target width cannot fit every candidate; keep every date boundary in `gridLines`.
- Compact: one `MM/dd` label per visible date before thinning; keep all date grid boundaries.
- Month/day: month bands plus one numeric day label per visible date before thinning; keep date and month boundaries.
- Month/week: group each visible date by `Math.floor(calendarDayDifference(range.startDate, date) / 7)`, center `Week ${group + 1}` over its first/last visible column, then thin labels. Keep every relative-week boundary plus month boundaries in `gridLines`.

Deduplicate and numerically sort `gridLines`, always including `0` and `visibleDates.length`.

- [ ] **Step 7: Run header and layout tests**

Run: `bun run test -- frontend/tests/timeline-header.test.ts frontend/tests/layout.test.ts frontend/tests/gantt-chart.test.tsx`

Expected: PASS. Existing consumers continue through the `layout.ts` re-export.

- [ ] **Step 8: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/textMetrics.ts frontend/src/gantt/timelineHeader.ts frontend/src/gantt/layout.ts frontend/tests/timeline-header.test.ts`

Stage only Task 3 changes, inspect, and commit `feat: model adaptive gantt headers`; otherwise retain the verified work without absorbing old hunks.


---

### Task 4: Apply the Range to Compact and Clipped Layout Geometry

**Files:**
- Modify: `frontend/src/gantt/layout.ts`
- Modify: `frontend/tests/layout.test.ts`

**Interfaces:**
- Extends `ChartLayout` with `range: TimelineRange`, `header: TimelineHeaderModel`, and `todayX: number | null`.
- Extends `TaskGeometry` with `isVisible`, `startClipped`, and `endClipped` while retaining existing `x`, `y`, `width`, `height`, and `isMarker` fields.

- [ ] **Step 1: Add failing exact-range and today tests**

Add to `frontend/tests/layout.test.ts`:

```ts
it("uses the saved range exactly and omits today outside it", () => {
  const ranged: ChartDocument = {
    ...document,
    settings: {
      ...document.settings,
      timelineRange: { startDate: "2026-09-01", endDate: "2026-09-14" },
    },
  };
  const layout = calculateChartLayout(ranged, "2026-08-04", { width: 1000, height: 600 });
  expect(layout.range).toEqual(ranged.settings.timelineRange);
  expect(layout.visibleDates[0]).toBe("2026-09-01");
  expect(layout.visibleDates.at(-1)).toBe("2026-09-14");
  expect(layout.todayX).toBeNull();
});

it("keeps today inside an automatic range", () => {
  const layout = calculateChartLayout(document, "2026-08-04", { width: 1000, height: 600 });
  expect(layout.todayX).not.toBeNull();
});
```

- [ ] **Step 2: Add failing bar-clipping tests**

Use a custom weekday range and four tasks:

```ts
it("clips intersecting bars and retains wholly out-of-range rows", () => {
  const ranged: ChartDocument = {
    ...document,
    settings: {
      ...document.settings,
      timelineRange: { startDate: "2026-08-05", endDate: "2026-08-10" },
    },
    tasks: [
      { ...document.tasks[0], id: "before", startDate: "2026-08-01", endDate: "2026-08-03" },
      { ...document.tasks[0], id: "left", startDate: "2026-08-01", endDate: "2026-08-06" },
      { ...document.tasks[0], id: "right", startDate: "2026-08-07", endDate: "2026-08-15" },
      { ...document.tasks[0], id: "both", startDate: "2026-08-01", endDate: "2026-08-15" },
    ],
  };
  const layout = calculateChartLayout(ranged, "2026-08-06", { width: 1000, height: 600 });
  const byId = Object.fromEntries(layout.tasks.map((task) => [task.id, task]));

  expect(byId.before).toMatchObject({ isVisible: false, width: 0 });
  expect(byId.left).toMatchObject({ isVisible: true, startClipped: true, endClipped: false });
  expect(byId.right).toMatchObject({ isVisible: true, startClipped: false, endClipped: true });
  expect(byId.both).toMatchObject({ isVisible: true, startClipped: true, endClipped: true });
  expect(byId.both.width).toBe(layout.visibleDates.length * layout.metrics.dayWidth);
});
```

- [ ] **Step 3: Add failing compact-row tests**

```ts
it("uses preferred compact rows instead of stretching a short task list", () => {
  const layout = calculateChartLayout(document, "2026-08-04", { width: 1200, height: 640 });
  expect(layout.metrics.rowHeight).toBeLessThanOrEqual(ROW_HEIGHT);
  expect(layout.tasks[1].y - layout.tasks[0].y).toBe(layout.metrics.rowHeight);
  expect(layout.tasks.at(-1)!.y + layout.tasks.at(-1)!.height).toBeLessThan(
    layout.height - layout.metrics.legendHeight,
  );
});

it("still shrinks a dense task list into the viewport", () => {
  const dense = {
    ...document,
    tasks: Array.from({ length: 40 }, (_, index) => ({
      ...document.tasks[0], id: `dense-${index}`,
    })),
  };
  const layout = calculateChartLayout(dense, "2026-08-04", { width: 900, height: 500 });
  expect(layout.metrics.rowHeight).toBeLessThan(ROW_HEIGHT);
  expect(layout.tasks.at(-1)!.y + layout.tasks.at(-1)!.height).toBeLessThanOrEqual(
    layout.height - layout.metrics.legendHeight,
  );
});
```

- [ ] **Step 4: Run layout tests and confirm the new contracts fail**

Run: `bun run test -- frontend/tests/layout.test.ts`

Expected: FAIL because layout still pads its own range, stretches rows, and cannot represent hidden/clipped bars or a conditional today position.

- [ ] **Step 5: Replace local range derivation and compact row metrics**

Delete `chartDateRange`. Resolve dates with:

```ts
const range = resolveTimelineRange(document, today);
const visibleDates = visibleDatesForTimelineRange(range, document.settings);
```

Inside `calculateMetrics`, replace the stretched row formula with:

```ts
const availableTaskHeight = positive(height - headerHeight - legendHeight);
const preferredRowHeight = positive(ROW_HEIGHT * verticalScale);
const rowHeight = positive(Math.min(preferredRowHeight, availableTaskHeight / taskSlots));
```

Stop fitting `dateFontSize` into one daily column, because medium and long headers intentionally span or skip daily columns. Use `positive(Math.min(12, headerHeight * 0.25, 12 * verticalScale))`; `buildTimelineHeader` is responsible for thinning horizontally.

After metrics are known, build the header once:

```ts
const header = buildTimelineHeader({
  range,
  visibleDates,
  dayWidth: metrics.dayWidth,
  fontSize: metrics.dateFontSize,
});
```

- [ ] **Step 6: Calculate explicit intersection geometry**

For every task, initialize flags with:

```ts
const startClipped = task.startDate < range.startDate;
const endClipped = task.endDate > range.endDate;
const clippedStart = task.startDate < range.startDate ? range.startDate : task.startDate;
const clippedEnd = task.endDate > range.endDate ? range.endDate : task.endDate;
const intersects = clippedStart <= clippedEnd;
```

When `intersects` is false, return the normal row `y` and bar `height`, but set `x: metrics.labelWidth`, `width: 0`, `isVisible: false`, and both clip flags. When it intersects, calculate included visible dates from the clipped endpoints. Return `isVisible: true`; use normal bar geometry when dates exist and the existing seam marker when the intersection contains hidden weekend dates only. Clamp marker `x` inside the timeline bounds.

Return `range`, `header`, and `todayX`. Compute `todayX` only when `rangeContainsDate(range, today)`; use the visible column center or the hidden-date seam, otherwise return `null`.

- [ ] **Step 7: Run all pure geometry suites**

Run: `bun run test -- frontend/tests/timeline-range.test.ts frontend/tests/timeline-header.test.ts frontend/tests/layout.test.ts`

Expected: PASS, including compact rows and all clipping cases.

- [ ] **Step 8: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/layout.ts frontend/tests/layout.test.ts`

Stage only Task 4 hunks, inspect, and commit `feat: clip gantt layout to saved range`; otherwise retain the verified uncommitted changes.


---

### Task 5: Render Semantic Headers and Clipped Bars

**Files:**
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `frontend/src/gantt/TaskBar.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/gantt-chart.test.tsx`
- Modify: `frontend/tests/bar-interactions.test.tsx`

**Interfaces:**
- Consumes: Task 4's `ChartLayout.header`, `todayX`, and task visibility/clip flags.
- Produces: adaptive SVG header groups and zero, one, or two resize handles according to visible real endpoints.

- [ ] **Step 1: Add failing header-render tests**

Add a helper in `gantt-chart.test.tsx` that sets `chart.settings.timelineRange`, then cover all four modes:

```tsx
it.each([
  [{ startDate: "2026-08-03", endDate: "2026-08-14" }, "detailed-days", "Aug 3"],
  [{ startDate: "2026-08-01", endDate: "2026-08-28" }, "compact-days", "08/03"],
  [{ startDate: "2026-08-01", endDate: "2026-10-31" }, "month-days", "August"],
  [{ startDate: "2026-01-01", endDate: "2026-07-01" }, "month-weeks", "Week 1"],
])("renders %s as %s", (timelineRange, tier, expectedText) => {
  const chart = createStarterChart("2026-08-04");
  chart.settings.timelineRange = timelineRange;
  const { container } = render(
    <GanttChart document={chart} mode="editor" selectedTaskId={null} viewport={{ width: 1000, height: 500 }} />,
  );
  expect(container.querySelector(".gantt-header")).toHaveAttribute("data-tier", tier);
  expect(screen.getAllByText(expectedText)[0]).toBeVisible();
});
```

- [ ] **Step 2: Add failing clipped-row and marker tests**

```tsx
it("keeps every task name but omits wholly out-of-range bars", () => {
  const chart = createStarterChart("2026-08-04");
  chart.settings.timelineRange = { startDate: "2026-09-01", endDate: "2026-09-14" };
  render(<GanttChart document={chart} mode="editor" selectedTaskId={null} />);
  expect(screen.getAllByTestId("task-row")).toHaveLength(chart.tasks.length);
  expect(screen.getByText(chart.tasks[0].name)).toBeVisible();
  expect(screen.queryByTestId("task-bar")).not.toBeInTheDocument();
});

it("does not render today outside a custom range", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00"));
  const chart = createStarterChart("2026-09-01");
  chart.settings.timelineRange = { startDate: "2026-09-01", endDate: "2026-09-14" };
  const { container } = render(<GanttChart document={chart} mode="editor" selectedTaskId={null} />);
  expect(container.querySelector(".gantt-today")).toBeNull();
});
```

Add this clipped-handle case:

```tsx
const chart = createStarterChart("2026-08-04");
chart.settings.timelineRange = { startDate: "2026-08-05", endDate: "2026-08-10" };
chart.tasks = [{ ...chart.tasks[0], startDate: "2026-08-01", endDate: "2026-08-06" }];
const { rerender } = render(
  <GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />,
);
expect(screen.getAllByTestId("resize-handle")).toHaveLength(1);
chart.tasks = [{ ...chart.tasks[0], endDate: "2026-08-15" }];
rerender(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);
expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
```

In `bar-interactions.test.tsx`, parameterize a one-day drag over ranges `2026-08-03`–`2026-08-14`, `2026-08-01`–`2026-08-28`, `2026-06-01`–`2026-10-31`, and `2026-05-01`–`2026-11-01`. Calculate each layout with the rendered viewport, move the bar by exactly `layout.metrics.dayWidth`, and assert Start commits from `2026-08-04` to `2026-08-05` in every tier.

- [ ] **Step 3: Run rendering tests and confirm failure**

Run: `bun run test -- frontend/tests/gantt-chart.test.tsx frontend/tests/bar-interactions.test.tsx`

Expected: FAIL because SVG rendering still loops over raw visible dates, always mounts every bar, always renders today, and always shows two handles.

- [ ] **Step 4: Render header bands, labels, and grid positions**

Replace the `visibleDates.map` header block with one `<g className="gantt-header" data-tier={layout.header.tier}>`. Convert every returned column-unit position with:

```ts
const timelineX = (position: number) => metrics.labelWidth + position * metrics.dayWidth;
```

Render:

```tsx
{layout.header.gridLines.map((position) => (
  <line key={`grid-${position}`} className="gantt-grid-line"
    x1={timelineX(position)} y1={0} x2={timelineX(position)} y2={gridBottom} />
))}
{layout.header.bands.map((band) => (
  <g key={band.key} className="gantt-month-band">
    <text x={(timelineX(band.startIndex) + timelineX(band.endIndex)) / 2}
      y={metrics.headerHeight * 0.3}>{band.label}</text>
  </g>
))}
{layout.header.labels.map((label) => (
  <text key={label.key} className="gantt-header-label"
    x={timelineX(label.position)} y={label.secondaryLabel ? metrics.headerHeight * 0.42 : metrics.headerHeight * 0.72}>
    <tspan x={timelineX(label.position)}>{label.label}</tspan>
    {label.secondaryLabel && (
      <tspan x={timelineX(label.position)} dy={metrics.headerHeight * 0.36}>{label.secondaryLabel}</tspan>
    )}
  </text>
))}
```

Set `gridBottom = layout.height - metrics.legendHeight` so grid lines extend through unused clean chart space and the legend remains pinned to the bottom.

- [ ] **Step 5: Suppress hidden bars and clipped resize handles**

Always render the task-name `<text>`, but render `TaskBar` only when `geometry.isVisible`.

In `TaskBar`, define `showStartHandle = isEditor && selected && !geometry.startClipped` and `showEndHandle = isEditor && selected && !geometry.endClipped`. Wrap the existing start-handle rectangle with `showStartHandle` and the existing end-handle rectangle with `showEndHandle`; their pointer handlers and geometry remain unchanged.

The bar body remains draggable when partially clipped. Do not fabricate handles at clipped chart edges.

- [ ] **Step 6: Render today conditionally and last**

Delete the local `todayIndex`/seam calculation. As the final SVG child, render only:

```tsx
{layout.todayX !== null && (
  <g className="gantt-today" pointerEvents="none">
    <line className="gantt-today-marker"
      x1={layout.todayX} y1={metrics.headerHeight}
      x2={layout.todayX} y2={gridBottom} />
  </g>
)}
```

- [ ] **Step 7: Add adaptive-header CSS**

In `index.css`, center `.gantt-header-label` and `.gantt-month-band text`, use the existing cool-gray header colors and weights, and add a subtle month-band divider. Keep the orange marker at 3px and do not add backgrounds, cards, rotated text, or overflow.

- [ ] **Step 8: Run SVG and interaction suites**

Run: `bun run test -- frontend/tests/gantt-chart.test.tsx frontend/tests/bar-interactions.test.tsx frontend/tests/layout.test.ts`

Expected: PASS with every task row retained and the marker still last when present.

- [ ] **Step 9: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/GanttChart.tsx frontend/src/gantt/TaskBar.tsx frontend/src/app/index.css frontend/tests/gantt-chart.test.tsx frontend/tests/bar-interactions.test.tsx`

Stage only Task 5 hunks, inspect, and commit `feat: render ranged gantt headers and bars`; otherwise retain the passing uncommitted changes.


---

### Task 6: Build the Styled Timeline Range Picker

**Files:**
- Create: `frontend/src/gantt/TimelineRangePicker.tsx`
- Create: `frontend/tests/timeline-range-picker.test.tsx`
- Modify: `frontend/src/app/index.css`

**Interfaces:**
- Produces: `TimelineRangePicker({ effectiveRange, customRange, onChange })`.
- Emits: a validated `TimelineRange` on Apply or `undefined` on Auto-fit.

- [ ] **Step 1: Write failing trigger, Apply, and Auto-fit tests**

Create `frontend/tests/timeline-range-picker.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TimelineRangePicker } from "@/gantt/TimelineRangePicker";

afterEach(cleanup);
const effectiveRange = { startDate: "2026-08-01", endDate: "2026-08-14" };

it("shows the effective range and applies a valid custom draft", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
  await user.clear(screen.getByRole("textbox", { name: "Timeline start" }));
  await user.type(screen.getByRole("textbox", { name: "Timeline start" }), "2026-08-05");
  await user.clear(screen.getByRole("textbox", { name: "Timeline end" }));
  await user.type(screen.getByRole("textbox", { name: "Timeline end" }), "2026-08-28");
  await user.click(screen.getByRole("button", { name: "Apply range" }));

  expect(onChange).toHaveBeenCalledWith({ startDate: "2026-08-05", endDate: "2026-08-28" });
});

it("disables Apply for a reversed draft without showing a warning", async () => {
  const user = userEvent.setup();
  render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
  await user.clear(screen.getByRole("textbox", { name: "Timeline start" }));
  await user.type(screen.getByRole("textbox", { name: "Timeline start" }), "2026-08-20");
  expect(screen.getByRole("button", { name: "Apply range" })).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("clears a custom range with Auto-fit", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TimelineRangePicker effectiveRange={effectiveRange} customRange={effectiveRange} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
  await user.click(screen.getByRole("button", { name: "Auto-fit" }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});
```

- [ ] **Step 2: Add failing cancellation and keyboard-calendar tests**

Add an Escape test that opens the popover, edits Start, presses Escape, and asserts the `Timeline range` dialog closes without calling `onChange`. Add an outside-click case with the same no-mutation assertion.

Add this keyboard case:

```tsx
const augustFirst = screen.getByRole("button", { name: "Saturday, August 1, 2026" });
augustFirst.focus();
await user.keyboard("{ArrowRight}");
expect(screen.getByRole("button", { name: "Sunday, August 2, 2026" })).toHaveFocus();
await user.keyboard("{PageDown}");
expect(screen.getByRole("button", { name: "Wednesday, September 2, 2026" })).toHaveFocus();
```

Also assert the trigger has `aria-expanded` and `title="Choose timeline range"`.

- [ ] **Step 3: Run picker tests and confirm the component is missing**

Run: `bun run test -- frontend/tests/timeline-range-picker.test.tsx`

Expected: FAIL because `TimelineRangePicker.tsx` does not exist.

- [ ] **Step 4: Create the controlled picker shell**

Use this public contract:

```ts
export interface TimelineRangePickerProps {
  effectiveRange: TimelineRange;
  customRange?: TimelineRange;
  onChange: (range: TimelineRange | undefined) => void;
}
```

Track `isOpen`, `draft`, `activeEndpoint: "startDate" | "endDate"`, `monthStart`, and `focusedDate`. Each time the trigger opens, reset the draft to `customRange ?? effectiveRange`, activate Start, and show its month. Register document `mousedown` and `keydown` listeners only while open; outside click and Escape close without emitting.

Render the trigger with Lucide `CalendarRange`, `aria-label="Choose timeline range"`, `aria-expanded`, `title="Choose timeline range"`, and `formatTimelineRangeSummary(effectiveRange)`.

- [ ] **Step 5: Render draft fields and validation**

Use styled text inputs rather than `type="date"` so the component does not expose an unstyled native popup:

```tsx
<input aria-label="Timeline start" inputMode="numeric" value={draft.startDate}
  onFocus={() => setActiveEndpoint("startDate")}
  onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
<input aria-label="Timeline end" inputMode="numeric" value={draft.endDate}
  onFocus={() => setActiveEndpoint("endDate")}
  onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
```

Compute `isValidDraft` from two `isValidIsoDate` checks and `endDate >= startDate`. Disable Apply when false. Apply emits a copied draft and closes; Auto-fit emits `undefined` and closes. Do not render an alert for incomplete or reversed intermediate input.

- [ ] **Step 6: Build the 42-day calendar and endpoint selection**

Derive the first visible calendar cell from the month start and its UTC weekday, then create exactly 42 dates with `addCalendarDays`. Render weekday headings and day buttons with full accessible names from `Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" })`.

Each day button gets `data-date`, an outside-month class, and state classes for today, Start, End, and inclusive in-range dates. Selecting a day updates the active endpoint; after selecting Start, activate End. Previous/next buttons use `addCalendarMonths(monthStart, -1 | 1)`.

- [ ] **Step 7: Add roving keyboard focus**

Handle day-button keys with:

```ts
const nextDate = event.key === "ArrowLeft" ? addCalendarDays(date, -1)
  : event.key === "ArrowRight" ? addCalendarDays(date, 1)
  : event.key === "ArrowUp" ? addCalendarDays(date, -7)
  : event.key === "ArrowDown" ? addCalendarDays(date, 7)
  : event.key === "PageUp" ? addCalendarMonths(date, -1)
  : event.key === "PageDown" ? addCalendarMonths(date, 1)
  : null;
```

Prevent default for handled keys, update `focusedDate` and `monthStart`, then focus the matching `[data-date="YYYY-MM-DD"]` button in a layout effect. Enter and Space retain native button selection.

- [ ] **Step 8: Style the picker as part of the existing UI**

Add `.timeline-range-picker`, `.timeline-range-trigger`, `.timeline-range-popover`, `.timeline-range-fields`, `.calendar-header`, `.calendar-weekdays`, `.calendar-grid`, and calendar state classes. Reuse the settings popover's white background, `#dbe3ee` border, 10–12px radius, blue focus ring, and subtle shadow. Use a seven-column grid, 32px day buttons, blue endpoint fills, a pale-blue selected-range fill, and muted outside-month dates. Keep the popover above the chart without changing shell overflow.

- [ ] **Step 9: Run picker tests and lint**

Run: `bun run test -- frontend/tests/timeline-range-picker.test.tsx`

Run: `bun run lint`

Expected: PASS with no hook or accessible-name errors.

- [ ] **Step 10: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/TimelineRangePicker.tsx frontend/tests/timeline-range-picker.test.tsx frontend/src/app/index.css`

Stage only Task 6 hunks, inspect, and commit `feat: add gantt timeline range picker`; otherwise retain the verified uncommitted changes.


---

### Task 7: Integrate Range State and Silent Toolbar Feedback

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/app-shell.test.tsx`
- Modify: `frontend/tests/copy-image.test.tsx`
- Modify: `frontend/tests/editor-flow.test.tsx`

**Interfaces:**
- Consumes: `resolveTimelineRange` and `TimelineRangePicker`.
- Produces: persisted Apply/Auto-fit updates, range-aware new-task defaults, hidden live announcements, and icon-only retry states.

- [ ] **Step 1: Add a failing persisted-range integration test**

In `app-shell.test.tsx`, open `Choose timeline range`, enter `2026-08-05` through `2026-08-28`, Apply, advance the autosave timer 300ms, and assert:

```ts
expect(saveChart).toHaveBeenLastCalledWith(expect.objectContaining({
  settings: expect.objectContaining({
    timelineRange: { startDate: "2026-08-05", endDate: "2026-08-28" },
  }),
}));
```

Add a startup case whose mocked saved chart already has a custom range; assert the trigger shows `Aug 5, 2026 – Aug 28, 2026`. Add a new-task case asserting Start defaults to the custom range's Start.

In the same flow, reopen the picker, click Auto-fit, advance 300ms, and assert the last saved document's settings do not have an own `timelineRange` property.

- [ ] **Step 2: Replace visible success expectations with hidden announcements**

Update `copy-image.test.tsx` after clicking Copy:

```tsx
const announcement = await screen.findByRole("status", { name: "Image action status" });
expect(announcement).toHaveTextContent("Copied");
expect(announcement).toHaveClass("sr-only");
expect(document.querySelector(".image-action-status")).toBeNull();
```

For failure, assert the same `Copy image` button has `data-state="error"` and an error tooltip, then click that same button to retry. Remove expectations for separate retry buttons and visible `Saved` or `Copied` text.

- [ ] **Step 3: Run integration tests and confirm missing behavior**

Run: `bun run test -- frontend/tests/app-shell.test.tsx frontend/tests/copy-image.test.tsx frontend/tests/editor-flow.test.tsx`

Expected: FAIL because App does not mount the picker and still reserves visible status text.

- [ ] **Step 4: Mount the picker and update chart settings immutably**

Create one stable `today` value and derive the effective range:

```ts
const today = useMemo(() => currentLocalIsoDate(), []);
const effectiveRange = useMemo(
  () => resolveTimelineRange(document, today),
  [document, today],
);

const changeTimelineRange = (timelineRange: TimelineRange | undefined) => {
  setDocument((current) => {
    const settings = { ...current.settings };
    if (timelineRange) settings.timelineRange = timelineRange;
    else delete settings.timelineRange;
    return { ...current, settings };
  });
  setSelectedTaskId(null);
};
```

Render `TimelineRangePicker` after Add Task and before the Copy/Export icon group. Pass `effectiveRange`, `document.settings.timelineRange`, and `changeTimelineRange`. Keep the hidden export chart unchanged so it receives the same document automatically.

Update `openNewTask` to use `document.settings.timelineRange?.startDate` first, then the first task Start, then `today`. This keeps newly added tasks visible in a custom range.

- [ ] **Step 5: Replace visible autosave and image status blocks**

Remove `.autosave-status` and `.image-action-status` markup. Add two hidden regions:

```tsx
<span className="sr-only" role="status" aria-label="Save status" aria-live="polite">
  {autosave.phase === "saving" ? "Saving" : autosave.phase === "saved" ? "Saved" :
    autosave.phase === "error" ? `Could not save: ${autosave.message}` : ""}
</span>
<span className="sr-only" role="status" aria-label="Image action status" aria-live="polite">
  {imagePhase === "preparing" ? "Preparing image" : imagePhase === "copied" ? "Copied" :
    imagePhase === "exported" ? "PNG exported" : imagePhase === "error" ? imageError : ""}
</span>
```

When autosave fails, show one compact `CircleAlert` icon button named `Retry save`, titled with the message, and wired to `autosave.retry`. Do not show anything for autosave idle/saving/success.

- [ ] **Step 6: Put progress and retry state on Copy/Export icons**

Keep accessible names exactly `Copy image` and `Export PNG`. Set `aria-busy` only on the active action while preparing. Set `data-state="error"` and an error-specific `title` only on `lastImageActionRef.current` after a failure. Clicking either icon always calls `requestImageAction(action)`, so the same button retries. Use a CSS busy animation or Lucide `LoaderCircle` only for the active icon; successful actions immediately return to their normal icon.

- [ ] **Step 7: Remove reserved widths and add compact status styles**

Delete CSS for `.autosave-status` and `.image-action-status`. Add the standard one-pixel `.sr-only` clipping utility. Add `.icon-action[aria-busy="true"]` and `.icon-action[data-state="error"]` treatments without changing button dimensions. Keep Copy and Export adjacent inside `.toolbar-icon-group`.

- [ ] **Step 8: Extend the end-to-end editor flow**

In `editor-flow.test.tsx`, set a custom four-week range before Copy and Export, advance autosave, and assert the saved document contains it. Make the `svgToPngArtifact` mock inspect its SVG argument and assert the export-stage text contains the expected compact boundary labels and excludes a date beyond the range. Retain the assertion that both actions call the rasterizer, and assert no visible success-status container occupies toolbar space.

```ts
vi.mocked(svgToPngArtifact).mockImplementation(async (svg) => {
  expect(svg.textContent).toContain("08/03");
  expect(svg.textContent).toContain("08/28");
  expect(svg.textContent).not.toContain("08/31");
  return artifact;
});
```

- [ ] **Step 9: Run all application integration tests**

Run: `bun run test -- frontend/tests/app-shell.test.tsx frontend/tests/autosave.test.tsx frontend/tests/copy-image.test.tsx frontend/tests/export-bridge.test.ts frontend/tests/editor-flow.test.tsx frontend/tests/settings-menu.test.tsx`

Expected: PASS. Weekend changes preserve `timelineRange` because `SettingsMenu` continues spreading the complete settings object.

- [ ] **Step 10: Record a safe task boundary**

Run: `git diff --check -- frontend/src/app/App.tsx frontend/src/app/index.css frontend/tests/app-shell.test.tsx frontend/tests/copy-image.test.tsx frontend/tests/editor-flow.test.tsx`

Stage only Task 7 hunks, inspect, and commit `feat: integrate ranged gantt workflow`; otherwise retain the verified uncommitted changes.


---

### Task 8: Document and Verify the Complete Workflow

**Files:**
- Modify: `README.md`
- Verification only: all frontend and backend files from Tasks 1–7
- Browser target: `http://127.0.0.1:5174/gantt-browser-preview.html`

**Interfaces:**
- Consumes: the complete persisted range, adaptive header, clipping, picker, and silent-status workflow.
- Produces: documentation, automated evidence, and live browser evidence for all four header tiers.

- [ ] **Step 1: Update user-facing documentation**

Add to README's editing instructions:

```markdown
Use the timeline control to choose the exact inclusive Start and End dates shown in the chart. The custom range is saved and reused by Copy Image and Export PNG. Auto-fit returns to a range derived from the tasks and today. Task names remain listed when their bars are outside the range; intersecting bars are clipped at the chart edges.
```

Mention that headers automatically change from detailed dates to numeric dates, month/day bands, and relative week labels as the selected span grows.

- [ ] **Step 2: Run the complete frontend quality gate**

Run from the repository root:

```powershell
bun run test
bun run lint
bun run build:frontend
```

Expected: all tests PASS, lint exits 0, and the production build exits 0.

- [ ] **Step 3: Run the complete Rust quality gate**

Run from `backend`:

```powershell
cargo fmt --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Expected: every command exits 0 with no warnings.

- [ ] **Step 4: Reload the already-open Codex browser preview**

Before controlling the browser, invoke `browser:control-in-app-browser` and follow its runtime initialization rules. Reload `http://127.0.0.1:5174/gantt-browser-preview.html` so the user sees the latest source without opening another browser.

Confirm the toolbar shows Add Task, the timeline control, adjacent Copy/Export icons, and Settings with no visible `Saved` or `Copied` text.

- [ ] **Step 5: Verify all four header tiers live**

Use the picker to review representative inclusive ranges:

1. `2026-08-03`–`2026-08-14`: weekday plus month/day.
2. `2026-08-01`–`2026-08-28`: compact `MM/DD` labels.
3. `2026-08-01`–`2026-12-31`: month bands plus thinned day numbers.
4. `2026-01-01`–`2026-07-01`: month bands plus chart-relative `Week 1`, `Week 2`, and thinned later weeks.

For each case, confirm labels do not collide or rotate and the orange today line appears only when August 5, 2026 lies inside the range.

- [ ] **Step 6: Verify clipping, compact rows, and picker behavior live**

Choose a range that excludes at least one task and cuts through another. Confirm every task name remains, the outside bar disappears, the intersecting bar ends at the edge, and only real visible endpoints receive resize handles. Confirm the compact rows remain grouped beneath the header rather than stretching vertically.

Open the picker again and confirm Escape and outside click cancel drafts, reversed dates disable Apply without a warning, Auto-fit restores the derived range, and reopening shows the last saved effective state.

- [ ] **Step 7: Measure overflow and output behavior**

Read browser metrics for `document.documentElement`, `.app-shell`, `.chart-surface`, and `.chart-viewport`. For each element, assert `scrollWidth - clientWidth === 0` and `scrollHeight - clientHeight === 0`.

Click Copy Image and confirm no visible success text appears; verify its hidden status announces `Copied`. Click Export PNG and confirm the output uses the same selected range. Inspect the staged/export SVG or resulting PNG to ensure the toolbar, picker, selection outline, and resize handles are absent.

- [ ] **Step 8: Inspect final repository scope**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm every pre-existing uncommitted change remains present. Stage and commit only clearly attributable remaining feature hunks with `feat: complete persistent gantt timeline`; leave inseparable existing hunks uncommitted and report them.

- [ ] **Step 9: Record final evidence**

Report exact frontend and Rust command results, browser overflow values, the four header-tier checks, picker/clipping behavior, Copy/Export result, files changed, commits created, and any intentionally uncommitted overlapping work.
