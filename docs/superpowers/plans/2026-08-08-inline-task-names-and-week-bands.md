# Inline Task Names and Week Bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename tasks by clicking the name inline (like the chart title), and make multi-week timelines show “Week of …” header bands plus thicker vertical week dividers.

**Architecture:** Extend `TimelineHeaderModel` with explicit `weekBands` and week-boundary indices built from Monday-based calendar weeks over visible dates. `GanttChart` renders week band labels and thicker week body lines for compact-days and longer tiers. Task names use a new `InlineTaskName` editor (`foreignObject` + input) that commits via existing `onCommitTask` so undo works; export keeps plain text.

**Tech Stack:** React 19, TypeScript, existing SVG chart layout, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-08-inline-task-names-and-week-bands-design.md`

---

## File map

| File | Role |
|------|------|
| `frontend/src/gantt/timelineHeader.ts` | Week band model, Monday grouping, “Week of” labels, fitting fallbacks |
| `frontend/tests/timeline-header.test.ts` | Unit tests for week bands and tier rules |
| `frontend/src/gantt/GanttChart.tsx` | Render week bands, week dividers, inline task names |
| `frontend/src/app/index.css` | Styles for week dividers / week band labels |
| `frontend/src/gantt/InlineTaskName.tsx` | Inline rename control |
| `frontend/tests/inline-task-name.test.tsx` | Component + chart integration tests |
| `frontend/tests/gantt-chart.test.tsx` | Week divider / band rendering assertions |
| `README.md` | Editing notes |

---

### Task 1: Week band model (TDD)

**Files:**
- Modify: `frontend/src/gantt/timelineHeader.ts`
- Modify: `frontend/tests/timeline-header.test.ts`

- [ ] **Step 1: Write failing tests for week bands**

Append to `frontend/tests/timeline-header.test.ts`:

```ts
it("builds Monday calendar week bands with Week of labels on compact-days", () => {
  // 2026-08-03 is Monday; weekends hidden → visible Mon–Fri only
  const range = { startDate: "2026-08-03", endDate: "2026-08-21" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 40, fontSize: 11 });

  expect(header.tier).toBe("compact-days");
  expect(header.weekBands.length).toBeGreaterThanOrEqual(2);
  expect(header.weekBands[0].label).toMatch(/^Week of /);
  // First visible week Mon Aug 3 – Fri Aug 7
  expect(header.weekBands[0].label).toContain("Aug 3");
  expect(header.weekBands[0].label).toContain("Aug 7");
  expect(header.weekBoundaryIndices.length).toBeGreaterThan(0);
  // detailed day labels still present
  expect(header.labels.length).toBeGreaterThan(0);
});

it("omits week bands on detailed-days", () => {
  const range = { startDate: "2026-08-03", endDate: "2026-08-14" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 60, fontSize: 11 });

  expect(header.tier).toBe("detailed-days");
  expect(header.weekBands).toEqual([]);
  expect(header.weekBoundaryIndices).toEqual([]);
});

it("uses Week of labels for month-weeks instead of only Week N", () => {
  const range = { startDate: "2026-01-15", endDate: "2026-10-15" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 8, fontSize: 11 });

  expect(header.tier).toBe("month-weeks");
  expect(header.weekBands.length).toBeGreaterThan(0);
  expect(header.weekBands[0].label === "" || header.weekBands[0].label.startsWith("Week of ")
    || header.weekBands[0].label.startsWith("W")
    || /–/.test(header.weekBands[0].label)).toBe(true);
});

it("falls back to a short week label when the band is narrow", () => {
  const range = { startDate: "2026-08-03", endDate: "2026-08-28" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 2, fontSize: 11 });

  for (const band of header.weekBands) {
    if (!band.label) continue;
    expect(estimateTextWidth(band.label, 11, 600) + 8)
      .toBeLessThanOrEqual((band.endIndex - band.startIndex) * 2 + 0.01);
  }
});
```

Update the existing test `"uses chart-relative weeks and thins them at narrow widths"` expectations: it currently expects `header.labels[0].label === "Week 1"`. After this task, month-weeks week identity lives in `weekBands`, not day-style `labels`. Change that test to assert month-weeks tier, non-empty `weekBands` or thinned week labels via bands, and that narrow width still thins/fits. Example replacement body:

```ts
it("uses calendar week bands for long month-weeks ranges and fits labels", () => {
  const range = { startDate: "2026-01-15", endDate: "2026-10-15" };
  const visibleDates = visibleDatesBetween(range.startDate, range.endDate, weekdays);
  const header = buildTimelineHeader({ range, visibleDates, dayWidth: 2, fontSize: 11 });

  expect(header.tier).toBe("month-weeks");
  expect(header.weekBands.length).toBeGreaterThan(0);
  expect(header.weekBoundaryIndices.length).toBeGreaterThan(0);
  const labeled = header.weekBands.filter((band) => band.label);
  expect(labeled.length).toBeLessThanOrEqual(header.weekBands.length);
});
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
bun run test -- frontend/tests/timeline-header.test.ts
```

Expected: FAIL — `weekBands` / `weekBoundaryIndices` missing or old “Week 1” expectations fail.

- [ ] **Step 3: Implement week band helpers and extend the model**

In `frontend/src/gantt/timelineHeader.ts`:

1. Extend the model:

```ts
export interface TimelineHeaderModel {
  tier: TimelineHeaderTier;
  bands: TimelineHeaderBand[]; // month bands (existing)
  weekBands: TimelineHeaderBand[];
  weekBoundaryIndices: number[];
  labels: TimelineHeaderLabel[];
  gridLines: number[];
}
```

2. Add Monday-based week key and band builder (sketch):

```ts
function mondayWeekKey(date: IsoDate): string {
  const day = dateAtMidnight(date);
  const weekday = day.getUTCDay(); // 0 Sun … 6 Sat
  const daysFromMonday = (weekday + 6) % 7;
  const monday = addCalendarDays(date, -daysFromMonday);
  return monday; // use as key
}

function formatWeekOfLabel(first: IsoDate, last: IsoDate): string {
  const a = dateAtMidnight(first);
  const b = dateAtMidnight(last);
  const left = monthDayFormatter.format(a);
  const right = monthDayFormatter.format(b);
  if (first === last) return `Week of ${left}`;
  return `Week of ${left} – ${right}`;
}

function formatConciseWeekRange(first: IsoDate, last: IsoDate): string {
  if (first === last) return monthDayFormatter.format(dateAtMidnight(first));
  return `${monthDayFormatter.format(dateAtMidnight(first))} – ${monthDayFormatter.format(dateAtMidnight(last))}`;
}

function buildWeekBands(visibleDates: IsoDate[], dayWidth: number, fontSize: number): TimelineHeaderBand[] {
  if (visibleDates.length === 0) return [];
  const bands: TimelineHeaderBand[] = [];
  let startIndex = 0;
  let ordinal = 1;
  while (startIndex < visibleDates.length) {
    const key = mondayWeekKey(visibleDates[startIndex]);
    let endIndex = startIndex + 1;
    while (endIndex < visibleDates.length && mondayWeekKey(visibleDates[endIndex]) === key) {
      endIndex += 1;
    }
    const first = visibleDates[startIndex];
    const last = visibleDates[endIndex - 1];
    const width = (endIndex - startIndex) * dayWidth;
    const full = formatWeekOfLabel(first, last);
    const concise = formatConciseWeekRange(first, last);
    const ultra = `W${ordinal}`;
    let label = "";
    if (estimateTextWidth(full, fontSize, 600) + BAND_LABEL_GAP <= width) label = full;
    else if (estimateTextWidth(concise, fontSize, 600) + BAND_LABEL_GAP <= width) label = concise;
    else if (estimateTextWidth(ultra, fontSize, 600) + BAND_LABEL_GAP <= width) label = ultra;
    bands.push({ key: `week-${key}`, label, startIndex, endIndex });
    startIndex = endIndex;
    ordinal += 1;
  }
  return bands;
}

function weekBoundaryIndicesFromBands(weekBands: TimelineHeaderBand[]): number[] {
  return [...new Set(weekBands.map((band) => band.startIndex).filter((index) => index > 0))].sort(
    (a, b) => a - b,
  );
}
```

Import `addCalendarDays` from `@/gantt/dateMath` (already have calendar helpers in this file via `calendarDayDifference` / `addCalendarMonths` — add `addCalendarDays` import).

3. Update every return of `buildTimelineHeader`:

- **detailed-days:** `weekBands: []`, `weekBoundaryIndices: []`
- **compact-days:** `weekBands: buildWeekBands(...)`, `weekBoundaryIndices: weekBoundaryIndicesFromBands(...)`, keep day labels
- **month-days:** same weekBands; keep month `bands` and day labels; include week boundaries in `gridLines` union if useful for header lines
- **month-weeks:** use `weekBands` for week labeling; set `labels` to `[]` or keep thinned day-less labels empty — prefer **labels: []** for month-weeks and render only month bands + week bands (matches “Week of …” replacing “Week N” labels). Include week boundaries in gridLines.

Ensure all return objects include the new fields so TypeScript and tests compile.

- [ ] **Step 4: Run tests**

```powershell
bun run test -- frontend/tests/timeline-header.test.ts
```

Expected: PASS. Fix any existing tests that destructure header without `weekBands`.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/gantt/timelineHeader.ts frontend/tests/timeline-header.test.ts
git commit -m "feat: model Monday week bands for timeline headers"
```

---

### Task 2: Render week bands and thicker dividers

**Files:**
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/gantt-chart.test.tsx` (or timeline-related chart test)

- [ ] **Step 1: Write failing render tests**

In `frontend/tests/gantt-chart.test.tsx`, add a test that forces a multi-week custom range and asserts week UI:

```ts
it("renders week band labels and week dividers for multi-week ranges", () => {
  const chart = {
    ...createStarterChart("2026-08-05"),
    settings: {
      showSaturday: false,
      showSunday: false,
      timelineRange: { startDate: "2026-08-03", endDate: "2026-08-28" },
    },
  };
  render(
    <GanttChart
      document={chart}
      today="2026-08-05"
      mode="export"
      selectedTaskId={null}
      viewport={{ width: 1200, height: 640 }}
    />,
  );

  const weekLabels = document.querySelectorAll(".gantt-week-band-label");
  expect(weekLabels.length).toBeGreaterThan(0);
  expect(Array.from(weekLabels).some((node) => node.textContent?.includes("Week of") || node.textContent?.includes("–"))).toBe(true);
  expect(document.querySelectorAll(".gantt-week-divider").length).toBeGreaterThan(0);
});

it("does not render week bands for detailed-days ranges", () => {
  const chart = {
    ...createStarterChart("2026-08-05"),
    settings: {
      showSaturday: false,
      showSunday: false,
      timelineRange: { startDate: "2026-08-03", endDate: "2026-08-14" },
    },
  };
  render(
    <GanttChart
      document={chart}
      today="2026-08-05"
      mode="export"
      selectedTaskId={null}
      viewport={{ width: 1200, height: 640 }}
    />,
  );
  expect(document.querySelectorAll(".gantt-week-band-label")).toHaveLength(0);
  expect(document.querySelectorAll(".gantt-week-divider")).toHaveLength(0);
});
```

Use the same imports/helpers as existing tests in that file (`createStarterChart`, etc.).

- [ ] **Step 2: Run to verify failure**

```powershell
bun run test -- frontend/tests/gantt-chart.test.tsx
```

Expected: FAIL — missing classes.

- [ ] **Step 3: Render week bands and dividers in GanttChart**

In `frontend/src/gantt/GanttChart.tsx` header section:

1. After or alongside existing month `bands` rendering, map `layout.header.weekBands`:

```tsx
{layout.header.weekBands.map((band) => (
  <g key={band.key} className="gantt-week-band">
    {band.label ? (
      <text
        className="gantt-week-band-label"
        x={timelineX((band.startIndex + band.endIndex) / 2)}
        y={metrics.headerHeight * (layout.header.bands.length > 0 ? 0.52 : 0.28)}
        style={{ fontSize: metrics.dateFontSize }}
      >
        {band.label}
      </text>
    ) : null}
  </g>
))}
```

Adjust y fractions so:
- month bands stay near top (~0.22–0.28)
- week bands sit mid-header when months exist (~0.48–0.55)
- day labels stay lower (~0.78–0.85)

If week bands exist and month bands empty (compact-days), week labels at ~0.28 and day labels at ~0.72.

2. Draw thicker week dividers through the body:

```tsx
{layout.header.weekBoundaryIndices.map((position) => (
  <line
    key={`week-div-${position}`}
    className="gantt-week-divider"
    x1={timelineX(position)}
    y1={0}
    x2={timelineX(position)}
    y2={gridBottom}
  />
))}
```

Render week dividers **after** thin grid lines so they paint on top (or give higher stroke). Keep today marker last among verticals.

3. Day labels: when `weekBands.length > 0` and `bands.length > 0`, keep day label y at ~0.82; when only week bands, ~0.72.

- [ ] **Step 4: CSS**

In `frontend/src/app/index.css`:

```css
.gantt-week-band-label {
  fill: #334155;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: middle;
}

.gantt-week-divider {
  stroke: #94a3b8;
  stroke-width: 2;
}
```

Ensure `.gantt-header-band-label` already uses text-anchor middle if needed; week labels should be centered (`text-anchor: middle`).

- [ ] **Step 5: Fix layout consumers**

Any code constructing a fake `TimelineHeaderModel` in tests must include `weekBands: []` and `weekBoundaryIndices: []`. Grep:

```powershell
rg "TimelineHeaderModel|bands: \[\]|gridLines:" frontend
```

- [ ] **Step 6: Run tests**

```powershell
bun run test -- frontend/tests/gantt-chart.test.tsx frontend/tests/timeline-header.test.ts frontend/tests/layout.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/gantt/GanttChart.tsx frontend/src/app/index.css frontend/tests/gantt-chart.test.tsx
git commit -m "feat: render week bands and thicker week dividers"
```

---

### Task 3: InlineTaskName component (TDD)

**Files:**
- Create: `frontend/src/gantt/InlineTaskName.tsx`
- Create: `frontend/tests/inline-task-name.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InlineTaskName } from "@/gantt/InlineTaskName";

afterEach(() => cleanup());

describe("InlineTaskName", () => {
  it("commits a trimmed name on Enter", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTaskName value="Old name" onCommit={onCommit} />);

    const input = screen.getByRole("textbox", { name: "Task name" });
    await user.click(input);
    await user.clear(input);
    await user.type(input, "  New name  {Enter}");

    expect(onCommit).toHaveBeenCalledWith("New name");
  });

  it("restores the previous value on Escape", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTaskName value="Keep me" onCommit={onCommit} />);

    const input = screen.getByRole("textbox", { name: "Task name" });
    await user.click(input);
    await user.clear(input);
    await user.type(input, "Nope{Escape}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Keep me");
  });

  it("restores the previous name when the committed value is blank", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTaskName value="Keep me" onCommit={onCommit} />);

    const input = screen.getByRole("textbox", { name: "Task name" });
    await user.click(input);
    await user.clear(input);
    await user.tab();

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Keep me");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
bun run test -- frontend/tests/inline-task-name.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement InlineTaskName**

Create `frontend/src/gantt/InlineTaskName.tsx` modeled on `InlineChartTitle`, with differences:

- `aria-label="Task name"`
- className `gantt-inline-task-name`
- blank commit → restore previous (`setDraft(value)` / `original.current`), **do not** call `onCommit`
- non-blank trim → `onCommit` only if changed
- stopPropagation on pointer/click; select on focus

```tsx
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

interface InlineTaskNameProps {
  value: string;
  onCommit: (value: string) => void;
  style?: CSSProperties;
}

export function InlineTaskName({ value, onCommit, style }: InlineTaskNameProps) {
  const [draft, setDraft] = useState(value);
  const original = useRef(value);
  const cancelled = useRef(false);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (!next) {
      setDraft(original.current);
      return;
    }
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      cancelled.current = true;
      setDraft(original.current);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      aria-label="Task name"
      className="gantt-inline-task-name"
      style={style}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        original.current = value;
        event.currentTarget.select();
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event: MouseEvent<HTMLInputElement>) => {
        event.stopPropagation();
        event.currentTarget.select();
      }}
    />
  );
}
```

Add minimal CSS next to `.gantt-inline-title` styles (grep `gantt-inline-title` in `index.css` and mirror for task names: transparent background, bold, full width/height, border none).

- [ ] **Step 4: Run tests**

```powershell
bun run test -- frontend/tests/inline-task-name.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/gantt/InlineTaskName.tsx frontend/tests/inline-task-name.test.tsx frontend/src/app/index.css
git commit -m "feat: add InlineTaskName editor control"
```

---

### Task 4: Wire inline names into GanttChart

**Files:**
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `frontend/tests/inline-task-name.test.tsx` or `frontend/tests/gantt-chart.test.tsx`
- Optionally touch `frontend/tests/undo-flow.test.tsx` for undo after rename

- [ ] **Step 1: Write failing integration tests**

```tsx
it("renames a task when the inline task name is committed", async () => {
  const user = userEvent.setup();
  const onCommitTask = vi.fn();
  const chart = createStarterChart("2026-08-05");
  render(
    <GanttChart
      document={chart}
      today="2026-08-05"
      mode="editor"
      selectedTaskId={null}
      viewport={{ width: 1200, height: 640 }}
      onCommitTask={onCommitTask}
    />,
  );

  const inputs = screen.getAllByRole("textbox", { name: "Task name" });
  await user.click(inputs[0]);
  await user.clear(inputs[0]);
  await user.type(inputs[0], "Renamed assembly{Enter}");

  expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({
    id: chart.tasks[0].id,
    name: "Renamed assembly",
  }));
});

it("exports task names as text without inline inputs", () => {
  const chart = createStarterChart("2026-08-05");
  render(
    <GanttChart
      document={chart}
      today="2026-08-05"
      mode="export"
      selectedTaskId={null}
      viewport={{ width: 1200, height: 640 }}
    />,
  );
  expect(screen.queryByRole("textbox", { name: "Task name" })).toBeNull();
  expect(document.querySelector(".gantt-task-name")?.textContent).toContain(chart.tasks[0].name);
});
```

Note: task editor dialog also uses label “Task name”. These tests render only `GanttChart`, so no dialog collision. If App-level tests open the dialog, use more specific queries.

- [ ] **Step 2: Run to verify failure**

```powershell
bun run test -- frontend/tests/gantt-chart.test.tsx
```

- [ ] **Step 3: Wire editor-mode foreignObject names**

In `GanttChart.tsx` task row rendering, replace pure `<text className="gantt-task-name">` for **editor** mode with:

```tsx
{props.mode === "editor" && props.onCommitTask ? (
  <foreignObject
    data-editor-only="true"
    data-testid="task-name-editor"
    x={metrics.padding}
    y={geometry.y}
    width={taskNameWidth}
    height={Math.max(0.01, metrics.rowHeight)}
  >
    <InlineTaskName
      value={geometry.task.name}
      onCommit={(name) => props.onCommitTask?.({ ...geometry.task, name })}
      style={{ fontSize: metrics.taskFontSize, fontWeight: 700 }}
    />
  </foreignObject>
) : (
  // existing multi-line text block
  <text className="gantt-task-name" ...>...</text>
)}
```

Import `InlineTaskName`. Ensure `onCommitTask` is already on props.

Optional: `onSelectTask?.(geometry.id)` when focusing the name — only if it does not cause double-firing; can skip for v1.

- [ ] **Step 4: CSS for foreignObject input fill**

```css
.gantt-inline-task-name {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-weight: 700;
  color: #374151;
  padding: 0;
  margin: 0;
}
```

- [ ] **Step 5: App-level undo smoke (optional but recommended)**

In `frontend/tests/undo-flow.test.tsx`, add:

```tsx
it("undoes an inline task rename", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText("Gantt chart workspace");
  const names = await screen.findAllByRole("textbox", { name: "Task name" });
  // Prefer chart task-name editors: exclude dialog if any open
  const taskName = names[0];
  const previous = (taskName as HTMLInputElement).value;
  await user.click(taskName);
  await user.clear(taskName);
  await user.type(taskName, "Undoable rename{Enter}");
  expect(taskName).toHaveValue("Undoable rename");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getAllByRole("textbox", { name: "Task name" })[0]).toHaveValue(previous);
});
```

If multiple “Task name” roles conflict with nothing else when dialog closed, this works. Chart title is “Chart title”.

- [ ] **Step 6: Full related suite**

```powershell
bun run test -- frontend/tests/gantt-chart.test.tsx frontend/tests/inline-task-name.test.tsx frontend/tests/undo-flow.test.tsx frontend/tests/bar-interactions.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/gantt/GanttChart.tsx frontend/src/app/index.css frontend/tests
git commit -m "feat: enable inline task name editing on the chart"
```

---

### Task 5: README and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update Editing section**

Add bullets similar to:

- Click a task name in the left column to rename it inline (Enter commits, Escape cancels; blank restores the previous name). Double-click a bar for the full task dialog.
- On timelines longer than about two weeks, week bands show “Week of …” and thicker vertical lines mark week boundaries.

- [ ] **Step 2: Full suite + lint**

```powershell
bun run test
bun run lint
```

Expected: all green.

- [ ] **Step 3: Manual smoke with `bun run desktop`**

1. Click a task name, rename, undo.  
2. Set timeline to multi-week custom range; confirm week labels + thicker lines.  
3. Short detailed range: no week bands.  
4. Copy image: no inputs; week lines present on multi-week chart.

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: describe inline task names and week bands"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Monday week bands + Week of labels | Task 1 |
| detailed-days: no week bands | Task 1–2 |
| Fitting fallbacks | Task 1 |
| Render bands + thick dividers | Task 2 |
| Export includes week visuals | Task 2 (export mode tests) |
| InlineTaskName Enter/Escape/blank | Task 3 |
| Wire onCommitTask + export text | Task 4 |
| Undo rename | Task 4 |
| README | Task 5 |

## Out of scope

- Inline category/color  
- Configurable week start  
- Week bands on detailed-days  
- Row reorder  
