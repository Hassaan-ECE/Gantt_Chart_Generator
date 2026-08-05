# Responsive Flat Gantt Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scrolling card-style editor with one flat, always-fitted Gantt workspace and add direct title editing, dismissible task selection, reusable category/color choices, and matching Copy Image and Export PNG actions.

**Architecture:** A pure adaptive layout engine derives all SVG metrics from the measured workspace, while the editor converts pointer positions into SVG coordinates so whole-day interactions remain correct. The editor and the 16:9 export continue sharing one SVG renderer; a new PNG artifact function feeds both file export and the Tauri image clipboard bridge.

**Tech Stack:** React 19, TypeScript 6, SVG, Vite 8, Vitest 4, Testing Library, Bun 1.3, Tauri 2, Rust, official Tauri clipboard-manager and dialog plugins.

## Global Constraints

- Preserve every existing uncommitted user change; never reset or overwrite unrelated work.
- The application and chart expose no horizontal or vertical scrollbars.
- The toolbar remains fixed-size and readable; only gaps may tighten responsively.
- The complete title, date range, task list, bars, current-day marker, and legend always fit by shrinking chart geometry and typography.
- Do not add density warnings, pagination, zoom controls, or truncation as a substitute for fitting.
- The chart is one flat white workspace, grouped by spacing and subtle dividers rather than cards, shadows, or rounded outer containers.
- The orange current-day marker has no text and renders in the foreground.
- Copy Image and Export PNG use the same 3840×2160 white 16:9 PNG result.
- Category and color suggestions are derived from current tasks and remain open to new values.
- Before every implementation commit, inspect `git diff --cached`; stage only task-owned changes. If a pre-existing user hunk overlaps inseparably, leave that task uncommitted and report it rather than absorbing the hunk silently.

## File Responsibility Map

- `frontend/src/gantt/layout.ts`: pure visible-date, adaptive-metric, task-geometry, and legend layout.
- `frontend/src/gantt/GanttChart.tsx`: SVG composition and z-order using only returned layout metrics.
- `frontend/src/gantt/TaskBar.tsx`: task selection, accessible selected state, adaptive hit areas, and drag handlers.
- `frontend/src/gantt/useBarDrag.ts`: screen-to-SVG pointer conversion and whole-day drag displacement.
- `frontend/src/gantt/useElementSize.ts`: isolated `ResizeObserver` measurement for the editor workspace.
- `frontend/src/gantt/InlineChartTitle.tsx`: borderless direct title editing behavior.
- `frontend/src/gantt/ColorSuggestionField.tsx`: existing-color swatch menu plus custom color input.
- `frontend/src/gantt/TaskEditorDialog.tsx`: task draft validation and category/color suggestion composition.
- `frontend/src/gantt/exportPng.ts`: one rasterization producing a reusable PNG `Blob` and bytes.
- `frontend/src/integrations/tauri/clipboardBridge.ts`: browser-preview and Tauri image clipboard adapters.
- `frontend/src/integrations/tauri/exportBridge.ts`: native destination choice and byte writing only.
- `frontend/src/app/App.tsx`: persistent chart state, transient selection/dialog/action state, and application composition.
- `frontend/src/app/index.css`: flat shell, fixed toolbar, adaptive SVG, transient menus, focus, and reference styling.

---

### Task 1: Build the Pure Adaptive Layout Engine

**Files:**
- Modify: `frontend/src/gantt/layout.ts`
- Modify: `frontend/tests/layout.test.ts`

**Interfaces:**
- Consumes: `ChartDocument`, current `IsoDate`, and optional `ChartViewport`.
- Produces: `ChartViewport`, `ChartMetrics`, and `calculateChartLayout(document, today, viewport?) => ChartLayout` where `ChartLayout.metrics` drives every rendered coordinate.

- [ ] **Step 1: Write failing target-size and dense-chart tests**

Add these assertions to `frontend/tests/layout.test.ts` while retaining the existing date and weekend tests:

```ts
const fittedViewport = { width: 1048, height: 586 };

it("fits the complete chart to the requested viewport", () => {
  const layout = calculateChartLayout(document, "2026-08-04", fittedViewport);

  expect(layout.width).toBe(fittedViewport.width);
  expect(layout.height).toBe(fittedViewport.height);
  expect(layout.metrics.dayWidth).toBeGreaterThan(0);
  expect(layout.metrics.rowHeight).toBeGreaterThan(0);
  expect(layout.metrics.barHeight).toBeLessThanOrEqual(layout.metrics.rowHeight);
  expect(layout.metrics.taskFontSize).toBeGreaterThan(0);
  expect(Math.max(...layout.tasks.map((task) => task.y + task.height))).toBeLessThanOrEqual(
    layout.metrics.headerHeight + document.tasks.length * layout.metrics.rowHeight,
  );
});

it("shrinks dense charts instead of overflowing", () => {
  const denseDocument: ChartDocument = {
    ...document,
    title: "Complete manufacturing and commissioning execution timeline for the entire program",
    tasks: Array.from({ length: 30 }, (_, index) => ({
      id: `task-${index}`,
      name: `Long task label ${index} for the complete execution timeline`,
      startDate: "2026-08-03",
      endDate: "2026-09-30",
      category: `Long discipline category ${index}`,
      color: "#2f55cf",
    })),
  };

  const layout = calculateChartLayout(denseDocument, "2026-08-04", { width: 720, height: 520 });

  expect(layout.width).toBe(720);
  expect(layout.height).toBe(520);
  expect(layout.metrics.dayWidth).toBeGreaterThan(0);
  expect(layout.metrics.rowHeight).toBeGreaterThan(0);
  expect(layout.metrics.taskFontSize).toBeLessThan(14);
  expect(layout.metrics.legendFontSize).toBeGreaterThan(0);
  expect(layout.tasks.at(-1)!.y + layout.tasks.at(-1)!.height).toBeLessThanOrEqual(
    layout.height - layout.metrics.legendHeight,
  );
  expect(layout.metrics.titleFontSize * denseDocument.title.length * 0.58).toBeLessThanOrEqual(
    layout.metrics.labelWidth - layout.metrics.padding * 2,
  );
  expect(layout.metrics.taskFontSize * denseDocument.tasks[0].name.length * 0.58).toBeLessThanOrEqual(
    layout.metrics.labelWidth - layout.metrics.padding * 2,
  );
  expect(
    layout.metrics.legendFontSize * denseDocument.tasks[0].category.length * 0.58
      + layout.metrics.legendSwatchSize
      + layout.metrics.legendGap,
  ).toBeLessThanOrEqual(layout.metrics.legendSlotWidth);
});
```

- [ ] **Step 2: Run the layout tests and confirm the new API is missing**

Run: `bun run test -- frontend/tests/layout.test.ts`

Expected: FAIL because `ChartLayout` has no `metrics` and `calculateChartLayout` ignores the viewport.

- [ ] **Step 3: Add adaptive metric types and formulas**

Keep the existing date-range and hidden-weekend logic. Add these public types and calculate all coordinates from `metrics`:

```ts
export interface ChartViewport {
  width: number;
  height: number;
}

export interface ChartMetrics {
  labelWidth: number;
  dayWidth: number;
  headerHeight: number;
  rowHeight: number;
  barHeight: number;
  legendHeight: number;
  titleFontSize: number;
  dateFontSize: number;
  taskFontSize: number;
  legendFontSize: number;
  legendSwatchSize: number;
  legendGap: number;
  markerWidth: number;
  handleWidth: number;
  hitSlop: number;
  padding: number;
  legendSlotWidth: number;
}

function positive(value: number): number {
  return Math.max(0.01, value);
}

function calculateMetrics(
  document: ChartDocument,
  visibleDateCount: number,
  legendCount: number,
  viewport: ChartViewport,
): ChartMetrics {
  const width = positive(viewport.width);
  const height = positive(viewport.height);
  const taskSlots = Math.max(1, document.tasks.length);
  const horizontalScale = Math.min(1, width / (LABEL_WIDTH + visibleDateCount * DAY_WIDTH));
  const verticalScale = Math.min(1, height / (HEADER_HEIGHT + taskSlots * ROW_HEIGHT + LEGEND_HEIGHT));
  const padding = positive(Math.min(20, width * 0.018, height * 0.03));
  const labelWidth = positive(Math.min(width * 0.46, LABEL_WIDTH * Math.max(horizontalScale, 0.3)));
  const dayWidth = positive((width - labelWidth) / Math.max(1, visibleDateCount));
  const headerHeight = positive(Math.min(HEADER_HEIGHT, height * 0.17));
  const legendHeight = legendCount === 0 ? 0 : positive(Math.min(LEGEND_HEIGHT, height * 0.13));
  const rowHeight = positive((height - headerHeight - legendHeight) / taskSlots);
  const barHeight = positive(Math.min(BAR_HEIGHT, rowHeight * 0.64));
  const longestTaskLength = Math.max(1, ...document.tasks.map((task) => task.name.length));
  const longestCategoryLength = Math.max(1, ...document.tasks.map((task) => task.category.length));
  const titleLength = Math.max(1, document.title.length);
  const legendSlotWidth = positive((width - padding * 2) / Math.max(1, legendCount));
  const legendSwatchSize = positive(Math.min(12, legendHeight * 0.28, legendSlotWidth * 0.16));
  const legendGap = positive(Math.min(8, legendSlotWidth * 0.08));
  const fittedFontSize = (maximum: number, available: number, characters: number) =>
    positive(Math.min(maximum, available / (Math.max(1, characters) * 0.58)));

  return {
    labelWidth,
    dayWidth,
    headerHeight,
    rowHeight,
    barHeight,
    legendHeight,
    titleFontSize: fittedFontSize(
      Math.min(18, headerHeight * 0.34, 18 * verticalScale),
      labelWidth - padding * 2,
      titleLength,
    ),
    dateFontSize: fittedFontSize(
      Math.min(12, headerHeight * 0.25, 12 * verticalScale),
      dayWidth,
      6,
    ),
    taskFontSize: fittedFontSize(
      Math.min(14, rowHeight * 0.42, 14 * verticalScale),
      labelWidth - padding * 2,
      longestTaskLength,
    ),
    legendFontSize: fittedFontSize(
      Math.min(11, legendHeight * 0.28, 11 * verticalScale),
      legendSlotWidth - legendSwatchSize - legendGap,
      longestCategoryLength,
    ),
    legendSwatchSize,
    legendGap,
    markerWidth: positive(Math.min(MIN_MARKER_WIDTH, dayWidth * 0.2)),
    handleWidth: positive(Math.min(10, dayWidth * 0.18, barHeight * 0.4)),
    hitSlop: positive(Math.min(8, rowHeight * 0.18)),
    padding,
    legendSlotWidth,
  };
}
```

After deriving visible dates and legend, use the provided viewport or the current natural size:

```ts
const naturalViewport = {
  width: LABEL_WIDTH + visibleDates.length * DAY_WIDTH,
  height: HEADER_HEIGHT + Math.max(1, document.tasks.length) * ROW_HEIGHT + LEGEND_HEIGHT,
};
const target = viewport ?? naturalViewport;
const metrics = calculateMetrics(document, visibleDates.length, legend.length, target);
```

Return `width: target.width`, `height: target.height`, and `metrics`. Replace every geometry use of `LABEL_WIDTH`, `DAY_WIDTH`, `HEADER_HEIGHT`, `ROW_HEIGHT`, `BAR_HEIGHT`, and `MIN_MARKER_WIDTH` with the corresponding metric.

- [ ] **Step 4: Update the existing unit expectations to use returned metrics**

For example:

```ts
const layout = calculateChartLayout(document, "2026-08-04");
expect(layout.tasks.find((task) => task.id === "weekday")?.width).toBe(layout.metrics.dayWidth * 2);
expect(layout.tasks.find((task) => task.id === "weekend")?.width).toBe(layout.metrics.markerWidth);
expect(layout.width).toBe(layout.metrics.labelWidth + layout.visibleDates.length * layout.metrics.dayWidth);
```

- [ ] **Step 5: Run the layout suite**

Run: `bun run test -- frontend/tests/layout.test.ts`

Expected: PASS.

- [ ] **Step 6: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt/layout.ts frontend/tests/layout.test.ts`

If the staged diff contains only Task 1 work, commit with `feat: fit gantt geometry to viewport`; otherwise leave it unstaged and record the passing test command.

---

### Task 2: Render Adaptive Metrics and Preserve Drag Accuracy

**Files:**
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `frontend/src/gantt/TaskBar.tsx`
- Modify: `frontend/src/gantt/useBarDrag.ts`
- Modify: `frontend/tests/gantt-chart.test.tsx`
- Modify: `frontend/tests/bar-interactions.test.tsx`

**Interfaces:**
- Consumes: `ChartLayout.metrics` and optional `GanttChartProps.viewport?: ChartViewport`.
- Produces: `clientPointToSvgX(svg, clientX, clientY)`, adaptive task bars, foreground marker z-order, and `aria-pressed` selected state.

- [ ] **Step 1: Write failing render and pointer-coordinate tests**

Add a fitted render test to `frontend/tests/gantt-chart.test.tsx`:

```tsx
it("renders the requested viewport and keeps the unlabeled current-day marker last", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00"));
  render(
    <GanttChart
      document={document}
      mode="editor"
      selectedTaskId={null}
      viewport={{ width: 800, height: 420 }}
    />,
  );

  const svg = screen.getByRole("img");
  expect(svg).toHaveAttribute("width", "800");
  expect(svg).toHaveAttribute("height", "420");
  expect(svg.querySelector(".gantt-today-label")).toBeNull();
  const marker = svg.querySelector(".gantt-today");
  expect(marker).toBe(svg.lastElementChild);
});
```

Add this helper test to `frontend/tests/bar-interactions.test.tsx`:

Update the test import to include `clientPointToSvgX` from `@/gantt/useBarDrag`, then add:

```ts
it("maps client pixels through the SVG screen transform before calculating visible-day movement", () => {
  document.body.innerHTML = `<svg viewBox="0 0 800 400"><rect /></svg>`;
  const svg = document.querySelector("svg")!;
  const inverse = {} as DOMMatrix;
  const point = {
    x: 0,
    y: 0,
    matrixTransform: vi.fn(() => ({ x: 400, y: 200 })),
  };
  Object.defineProperty(svg, "getScreenCTM", { value: () => ({ inverse: () => inverse }) });
  Object.defineProperty(svg, "createSVGPoint", { value: () => point });

  expect(clientPointToSvgX(svg, 300, 100)).toBe(400);
  expect(point).toMatchObject({ x: 300, y: 100 });
  expect(point.matrixTransform).toHaveBeenCalledWith(inverse);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun run test -- frontend/tests/gantt-chart.test.tsx frontend/tests/bar-interactions.test.tsx`

Expected: FAIL because `viewport`, `clientPointToSvgX`, and the new z-order do not exist.

- [ ] **Step 3: Implement reusable client-to-SVG conversion**

In `frontend/src/gantt/useBarDrag.ts` add:

```ts
export function clientPointToSvgX(svg: SVGSVGElement, clientX: number, clientY: number): number {
  const screenMatrix = svg.getScreenCTM?.();
  if (screenMatrix && typeof svg.createSVGPoint === "function") {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(screenMatrix.inverse()).x;
  }

  const bounds = svg.getBoundingClientRect();
  if (bounds.width <= 0) return clientX;
  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const viewBoxX = viewBox?.[0] ?? 0;
  const viewBoxWidth = (viewBox?.[2] ?? Number(svg.getAttribute("width"))) || bounds.width;
  return viewBoxX + ((clientX - bounds.left) / bounds.width) * viewBoxWidth;
}

function pointerChartX(event: SvgPointerEvent): number {
  const svg = event.currentTarget.ownerSVGElement;
  return svg ? clientPointToSvgX(svg, event.clientX, event.clientY) : event.clientX;
}
```

Store `originX: pointerChartX(event)` on pointer down and calculate movement from `pointerChartX(event) - drag.originX` on pointer move.

- [ ] **Step 4: Pass adaptive values through chart and task bars**

Extend `GanttChartProps` with `viewport?: ChartViewport`, call `calculateChartLayout(document, today, props.viewport)`, and replace imported layout constants with `layout.metrics`.

Extend `TaskBarProps` with:

```ts
dayWidth: number;
handleWidth: number;
hitSlop: number;
```

Use `dayWidth` in all three `useBarDrag` calls. Use `handleWidth` for both resize handles and `hitSlop` for the transparent hit target. Add `aria-pressed={isEditor ? selected : undefined}` to the interactive task group.

- [ ] **Step 5: Put the orange marker in the foreground and remove its label**

In `GanttChart.tsx`, render date/grid groups first, task rows second, legend third, and the current-day group last. The final group is exactly:

```tsx
{todayIndex >= 0 && (
  <g className="gantt-today" pointerEvents="none">
    <line
      className="gantt-today-marker"
      x1={metrics.labelWidth + todayIndex * metrics.dayWidth + metrics.dayWidth / 2}
      y1={metrics.headerHeight}
      x2={metrics.labelWidth + todayIndex * metrics.dayWidth + metrics.dayWidth / 2}
      y2={gridBottom}
    />
  </g>
)}
```

- [ ] **Step 6: Run interaction and rendering tests**

Run: `bun run test -- frontend/tests/layout.test.ts frontend/tests/gantt-chart.test.tsx frontend/tests/bar-interactions.test.tsx`

Expected: PASS.

- [ ] **Step 7: Record a safe task boundary**

Run: `git diff --check -- frontend/src/gantt frontend/tests/gantt-chart.test.tsx frontend/tests/bar-interactions.test.tsx`

If only Task 2 hunks are staged, commit with `feat: render adaptive gantt interactions`; otherwise retain the verified changes without committing user-owned hunks.

---

### Task 3: Create the Flat Measured Shell, Direct Title, and Deselect Behavior

**Files:**
- Create: `frontend/src/gantt/useElementSize.ts`
- Create: `frontend/src/gantt/InlineChartTitle.tsx`
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/app-shell.test.tsx`
- Create: `frontend/tests/inline-title.test.tsx`

**Interfaces:**
- Produces: `useElementSize<T>() => { ref, size }`, `InlineChartTitle`, `GanttChartProps.onClearSelection`, and `GanttChartProps.onTitleCommit`.
- Consumes: Task 2's `viewport` and adaptive metrics.

- [ ] **Step 1: Write failing shell, title, and deselection tests**

Add to `frontend/tests/app-shell.test.tsx`:

```tsx
it("moves title editing into the chart and clears selection from blank workspace", async () => {
  const user = userEvent.setup();
  render(<App />);

  const chartTitle = await screen.findByRole("textbox", { name: "Chart title" });
  expect(chartTitle).toHaveClass("gantt-inline-title");
  expect(chartTitle.closest(".toolbar")).toBeNull();

  const task = screen.getByRole("button", { name: "Support PCS testing task" });
  await user.click(task);
  expect(task).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByTestId("chart-background"));
  expect(task).toHaveAttribute("aria-pressed", "false");
});

it("clears selected resize handles with Escape", async () => {
  const user = userEvent.setup();
  render(<App />);
  const task = await screen.findByRole("button", { name: "Support PCS testing task" });
  await user.click(task);
  expect(screen.getAllByTestId("resize-handle")).toHaveLength(2);
  await user.keyboard("{Escape}");
  expect(screen.queryByTestId("resize-handle")).toBeNull();
});
```

Create `frontend/tests/inline-title.test.tsx` with commit/cancel coverage:

```tsx
it("commits on Enter and restores the original title on Escape", async () => {
  const user = userEvent.setup();
  const onCommit = vi.fn();
  const { rerender } = render(<InlineChartTitle value="Execution Timeline" onCommit={onCommit} />);
  const title = screen.getByRole("textbox", { name: "Chart title" });

  await user.clear(title);
  await user.type(title, "Weekly Review{Enter}");
  expect(onCommit).toHaveBeenLastCalledWith("Weekly Review");

  rerender(<InlineChartTitle value="Weekly Review" onCommit={onCommit} />);
  await user.clear(title);
  await user.type(title, "Discard this{Escape}");
  expect(title).toHaveValue("Weekly Review");
  expect(onCommit).not.toHaveBeenCalledWith("Discard this");
});
```

- [ ] **Step 2: Run tests and confirm missing components/behavior**

Run: `bun run test -- frontend/tests/app-shell.test.tsx frontend/tests/inline-title.test.tsx`

Expected: FAIL because the chart is not measured, title is in the toolbar, and blank/Escape deselection is absent.

- [ ] **Step 3: Implement the isolated element-size hook**

Create `frontend/src/gantt/useElementSize.ts`:

```ts
import { useLayoutEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) setSize({ width, height });
    };
    const initial = element.getBoundingClientRect();
    update(initial.width, initial.height);
    const observer = new ResizeObserver(([entry]) => {
      update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
```

Do not use a production fallback size: a zero-size workspace must delay the chart until a real measurement arrives. In tests, stub `ResizeObserver` in `frontend/tests/setup.ts` if the environment lacks it; the stub must call the callback with a 1200×640 `contentRect`.

- [ ] **Step 4: Implement direct title editing**

Create `frontend/src/gantt/InlineChartTitle.tsx` as a controlled, borderless editor:

```tsx
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

interface InlineChartTitleProps {
  value: string;
  onCommit: (value: string) => void;
  style?: CSSProperties;
}

export function InlineChartTitle({ value, onCommit, style }: InlineChartTitleProps) {
  const [draft, setDraft] = useState(value);
  const original = useRef(value);
  const cancelled = useRef(false);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim() || "Untitled Gantt Chart";
    setDraft(next);
    onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      cancelled.current = true;
      setDraft(original.current);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      aria-label="Chart title"
      className="gantt-inline-title"
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
      onClick={(event) => event.stopPropagation()}
    />
  );
}
```

Render this editor inside an editor-only SVG `foreignObject`; keep the existing SVG `<text>` for export mode:

```tsx
{props.mode === "editor" ? (
  <foreignObject
    data-editor-only="true"
    x={metrics.padding}
    y={metrics.padding * 0.25}
    width={Math.max(0.01, metrics.labelWidth - metrics.padding * 2)}
    height={Math.max(0.01, metrics.headerHeight * 0.5)}
  >
    <InlineChartTitle
      value={document.title}
      onCommit={props.onTitleCommit!}
      style={{ fontSize: metrics.titleFontSize }}
    />
  </foreignObject>
) : (
  <text className="gantt-chart-title" x={metrics.padding} y={metrics.headerHeight * 0.42}>
    {document.title}
  </text>
)}
```

- [ ] **Step 5: Compose measurement, title, and deselection in App/GanttChart**

In `App`, call `useElementSize<HTMLDivElement>()`, attach the ref to `.chart-viewport`, render the chart after both dimensions are positive, pass `viewport={size}`, `onClearSelection={() => setSelectedTaskId(null)}`, and title commit that replaces `document.title`.

Add a document Escape listener only when no task dialog is open:

```ts
useEffect(() => {
  if (dialogMode) return;
  const clearSelection = (event: KeyboardEvent) => {
    if (event.key === "Escape") setSelectedTaskId(null);
  };
  globalThis.document.addEventListener("keydown", clearSelection);
  return () => globalThis.document.removeEventListener("keydown", clearSelection);
}, [dialogMode]);
```

Render the measured editor chart only when `size.width > 0 && size.height > 0`. Give the SVG root `data-testid="chart-background"` and `onClick={props.onClearSelection}` in editor mode so any blank grid, legend, or background click clears selection. Stop click, double-click, and pointer-down propagation inside `TaskBar` before calling selection/edit callbacks; the inline title already stops its own pointer/click propagation.

- [ ] **Step 6: Replace card/scroll CSS with a fixed flat grid**

Replace the shell rules with:

```css
html, body, #root { width: 100%; height: 100%; overflow: hidden; }
body { margin: 0; background: #ffffff; }
.app-shell {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-rows: 64px minmax(0, 1fr);
  overflow: hidden;
  background: #ffffff;
}
.toolbar {
  position: relative;
  z-index: 10;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  overflow: visible;
  border-bottom: 1px solid #dbe3ee;
  background: #ffffff;
  padding: 0 20px;
}
.chart-surface, .chart-viewport {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #ffffff;
}
.chart-surface { padding: 0; }
.chart-viewport { position: relative; border: 0; border-radius: 0; box-shadow: none; }
.gantt-chart { display: block; width: 100%; height: 100%; }
.gantt-inline-title {
  width: 100%;
  height: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: #1d4ed8;
  font-weight: 700;
  padding: 0;
}
```

Remove `.chart-title-control` rules, add a visible focus outline for `.gantt-inline-title`, and ensure `.settings-popover` remains absolutely positioned below the toolbar with no clipping ancestor. Keep recovery UI centered across both grid rows with `.recovery-panel { grid-row: 1 / -1; }`.

- [ ] **Step 7: Run focused and full frontend checks**

Run: `bun run test -- frontend/tests/app-shell.test.tsx frontend/tests/inline-title.test.tsx frontend/tests/gantt-chart.test.tsx`

Expected: PASS.

Run: `bun run build:frontend`

Expected: PASS.

- [ ] **Step 8: Record a safe task boundary**

Inspect `git diff -- frontend/src/app/App.tsx frontend/src/app/index.css frontend/src/gantt frontend/tests`. Commit only separable Task 3 hunks with `feat: add flat fitted gantt workspace`; otherwise leave the overlapping App hunks uncommitted and report them.

---

### Task 4: Add Reusable Category and Color Suggestions

**Files:**
- Create: `frontend/src/gantt/ColorSuggestionField.tsx`
- Modify: `frontend/src/gantt/TaskEditorDialog.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/task-editor.test.tsx`
- Modify: `frontend/tests/editor-flow.test.tsx`

**Interfaces:**
- Consumes: `categoryOptions: string[]`, `colorOptions: string[]`, controlled draft color.
- Produces: editable category datalist, swatch dropdown, and custom color selection without changing `ChartDocument` schema.

- [ ] **Step 1: Write failing suggestion tests**

Add to `frontend/tests/task-editor.test.tsx`:

```tsx
it("suggests existing categories while accepting a new category", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <TaskEditorDialog
      mode="edit"
      task={task}
      categoryOptions={["PCS Testing", "Inventory"]}
      colorOptions={["#8757ed", "#55c5ca"]}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );

  const category = screen.getByRole("combobox", { name: "Category" });
  expect(category).toHaveAttribute("list");
  expect(document.querySelector("datalist option[value='Inventory']")).not.toBeNull();
  await user.clear(category);
  await user.type(category, "New discipline");
  await user.click(screen.getByRole("button", { name: "Save task" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ category: "New discipline" }));
});

it("reuses an existing color and still exposes a custom color picker", async () => {
  const user = userEvent.setup();
  render(
    <TaskEditorDialog
      mode="edit"
      task={task}
      categoryOptions={["PCS Testing", "Inventory"]}
      colorOptions={["#8757ed", "#55c5ca"]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Choose task color" }));
  await user.click(screen.getByRole("option", { name: "Use color #55c5ca" }));
  expect(screen.getByLabelText("Custom color")).toHaveValue("#55c5ca");

  await user.click(screen.getByRole("button", { name: "Choose task color" }));
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByLabelText("Custom color")).toHaveValue("#8757ed");
});
```

- [ ] **Step 2: Run the task-editor tests and confirm missing props/UI**

Run: `bun run test -- frontend/tests/task-editor.test.tsx`

Expected: FAIL because category/color options and color suggestion UI do not exist.

- [ ] **Step 3: Implement the controlled color suggestion component**

Create `frontend/src/gantt/ColorSuggestionField.tsx` with a button and `role="listbox"`. Deduplicate lowercased hex values before rendering:

```tsx
interface ColorSuggestionFieldProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function ColorSuggestionField({ value, options, onChange }: ColorSuggestionFieldProps) {
  const [open, setOpen] = useState(false);
  const unique = Array.from(new Set([value, ...options].map((color) => color.toLowerCase())));

  return (
    <div className="color-suggestion-field">
      <button
        type="button"
        aria-label="Choose task color"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="color-swatch" style={{ backgroundColor: value }} />
        <span>{value}</span>
      </button>
      {open && (
        <div role="listbox" aria-label="Used task colors" className="color-suggestion-menu">
          {unique.map((color) => (
            <button
              key={color}
              type="button"
              role="option"
              aria-label={`Use color ${color}`}
              aria-selected={color === value.toLowerCase()}
              onClick={() => { onChange(color); setOpen(false); }}
            >
              <span className="color-swatch" style={{ backgroundColor: color }} />
              <span>{color}</span>
            </button>
          ))}
          <label>
            Custom color
            <input aria-label="Custom color" type="color" value={value} onChange={(event) => onChange(event.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
```

Keep an array of option-button refs and a focused option index. Opening the menu focuses the currently selected option; ArrowDown/ArrowUp wrap through the used-color options, Home/End jump to the first/last option, Enter or Space chooses the focused swatch, and Escape closes the menu and restores focus to the trigger. Close on outside pointer down using the same cleanup pattern already used by `SettingsMenu`. This supplies real keyboard listbox behavior rather than relying on click-only buttons.

- [ ] **Step 4: Add category datalist and color props to TaskEditorDialog**

Use React `useId()` for a stable datalist ID:

```tsx
const categoryListId = useId();

<label>
  Category
  <input
    list={categoryListId}
    aria-invalid={Boolean(errors.category)}
    value={draft.category}
    onChange={(event) => updateField("category", event.target.value)}
  />
</label>
<datalist id={categoryListId}>
  {Array.from(new Set(categoryOptions)).map((category) => <option key={category} value={category} />)}
</datalist>
<label>Color</label>
<ColorSuggestionField value={draft.color} options={colorOptions} onChange={(color) => updateField("color", color)} />
```

Default both new props to empty arrays so isolated callers remain source-compatible.

- [ ] **Step 5: Derive and pass suggestions from App**

Add:

```ts
const categoryOptions = useMemo(
  () => Array.from(new Set(document.tasks.map((task) => task.category))),
  [document.tasks],
);
const colorOptions = useMemo(
  () => Array.from(new Set(document.tasks.map((task) => task.color.toLowerCase()))),
  [document.tasks],
);
```

Pass both arrays to `TaskEditorDialog` and keep them derived rather than persisted.

- [ ] **Step 6: Style the suggestion group without adding a card section**

Use an anchored transient menu with a one-pixel border and shadow, while leaving the dialog form itself as one group. Swatches are 18×18 pixels with a textual hex value.

- [ ] **Step 7: Verify suggestion behavior**

Run: `bun run test -- frontend/tests/task-editor.test.tsx frontend/tests/editor-flow.test.tsx`

Expected: PASS.

- [ ] **Step 8: Record a safe task boundary**

Run `git diff --check` for the Task 4 files. Commit only separable Task 4 changes with `feat: reuse gantt categories and colors`; otherwise retain the verified changes without absorbing existing App hunks.

---

### Task 5: Produce One PNG Artifact and Add the Image Clipboard Bridge

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `backend/Cargo.toml`
- Modify: `backend/Cargo.lock`
- Modify: `backend/src/lib.rs`
- Modify: `backend/capabilities/default.json`
- Modify: `frontend/src/gantt/exportPng.ts`
- Modify: `frontend/tests/export-png.test.ts`
- Create: `frontend/src/integrations/tauri/clipboardBridge.ts`
- Create: `frontend/tests/clipboard-bridge.test.ts`

**Interfaces:**
- Produces: `PngArtifact { blob: Blob; bytes: Uint8Array }`, `svgToPngArtifact(source, scale?)`, and `copyPngToClipboard(artifact)`.
- Keeps: `svgToPngBytes` as a compatibility wrapper for existing callers until Task 6 migrates them.

- [ ] **Step 1: Write failing shared-artifact and clipboard tests**

Add to `frontend/tests/export-png.test.ts`:

```ts
it("returns one reusable PNG blob and byte array", async () => {
  const environment = installRasterEnvironment();
  document.body.innerHTML = `<svg width="800" height="400"><text>Task</text></svg>`;
  const artifact = await svgToPngArtifact(document.querySelector("svg")!);

  expect(artifact.bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(artifact.blob).toBe(environment.encodedBlob);
  expect(environment.toBlob).toHaveBeenCalledTimes(1);
});
```

Extend `installRasterEnvironment`'s returned object with `encodedBlob` so the test can verify object identity.

Create `frontend/tests/clipboard-bridge.test.ts`:

```ts
import { isTauri } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { copyPngToClipboard } from "@/integrations/tauri/clipboardBridge";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/image", () => ({ Image: { fromBytes: vi.fn() } }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeImage: vi.fn() }));

const artifact = {
  blob: new Blob([], { type: "image/png" }),
  bytes: new Uint8Array([137, 80, 78, 71]),
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it("decodes PNG bytes and writes a Tauri image resource", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const image = { close };
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(Image.fromBytes).mockResolvedValue(image as never);

  await copyPngToClipboard(artifact);

  expect(Image.fromBytes).toHaveBeenCalledWith(new Uint8Array([137, 80, 78, 71]));
  expect(writeImage).toHaveBeenCalledWith(image);
  expect(close).toHaveBeenCalledTimes(1);
});

it("releases the Tauri image resource when clipboard writing fails", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(Image.fromBytes).mockResolvedValue({ close } as never);
  vi.mocked(writeImage).mockRejectedValue(new Error("clipboard busy"));

  await expect(copyPngToClipboard(artifact)).rejects.toThrow("clipboard busy");
  expect(close).toHaveBeenCalledTimes(1);
});

it("uses ClipboardItem in the browser preview", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("ClipboardItem", class { constructor(readonly data: Record<string, Blob>) {} });
  vi.stubGlobal("navigator", { clipboard: { write } });
  await copyPngToClipboard(artifact);

  expect(write).toHaveBeenCalledTimes(1);
});

it("reports an unavailable browser image clipboard without downloading", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.stubGlobal("navigator", { clipboard: {} });
  vi.stubGlobal("ClipboardItem", undefined);

  await expect(copyPngToClipboard(artifact)).rejects.toThrow("Image clipboard is unavailable");
});
```

- [ ] **Step 2: Run the new tests and confirm missing APIs**

Run: `bun run test -- frontend/tests/export-png.test.ts frontend/tests/clipboard-bridge.test.ts`

Expected: FAIL because `svgToPngArtifact` and `clipboardBridge.ts` do not exist.

- [ ] **Step 3: Refactor rasterization to return one artifact**

In `exportPng.ts` add:

```ts
export interface PngArtifact {
  blob: Blob;
  bytes: Uint8Array;
}

export async function svgToPngArtifact(source: SVGSVGElement, scale = 2): Promise<PngArtifact> {
  const { width, height } = svgDimensions(source);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid SVG dimensions");
  const placement = calculatePowerPointPlacement(width, height);
  const prepared = prepareExportSvg(source);
  const serialized = new XMLSerializer().serializeToString(prepared);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadSvgImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(POWERPOINT_SLIDE_WIDTH * scale);
    canvas.height = Math.round(POWERPOINT_SLIDE_HEIGHT * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create PNG canvas context");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, POWERPOINT_SLIDE_WIDTH, POWERPOINT_SLIDE_HEIGHT);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
    const blob = await canvasToPngBlob(canvas);
    return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPngBytes(source: SVGSVGElement, scale = 2): Promise<Uint8Array> {
  return (await svgToPngArtifact(source, scale)).bytes;
}
```

- [ ] **Step 4: Install and configure the official Tauri clipboard plugin**

Run from the repository root:

```powershell
bun add @tauri-apps/plugin-clipboard-manager@^2.3.2
```

Update `backend/Cargo.toml` to include:

```toml
tauri = { version = "2", features = ["image-png"] }
tauri-plugin-clipboard-manager = "2"
```

Initialize it in `backend/src/lib.rs`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
```

Add only this capability to `backend/capabilities/default.json`:

```json
"clipboard-manager:allow-write-image"
```

- [ ] **Step 5: Implement the clipboard bridge**

Create `frontend/src/integrations/tauri/clipboardBridge.ts`:

```ts
import { isTauri } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

import type { PngArtifact } from "@/gantt/exportPng";

export async function copyPngToClipboard(artifact: PngArtifact): Promise<void> {
  if (isTauri()) {
    const image = await Image.fromBytes(artifact.bytes);
    try {
      await writeImage(image);
    } finally {
      await image.close();
    }
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is unavailable");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": artifact.blob })]);
}
```

- [ ] **Step 6: Run frontend and Rust infrastructure checks**

Run: `bun run test -- frontend/tests/export-png.test.ts frontend/tests/clipboard-bridge.test.ts`

Expected: PASS.

Run: `bun run build:frontend`

Expected: PASS.

Run from `backend`: `cargo check`

Expected: PASS with the clipboard plugin and `image-png` feature.

- [ ] **Step 7: Record a safe task boundary**

Inspect dependency and bridge diffs. Commit only Task 5 files with `feat: add gantt image clipboard bridge` when no pre-existing user hunk is included; otherwise keep the verified dependency/bridge changes uncommitted and report the overlap.

---

### Task 6: Integrate Icon-Only Copy and Export Actions

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/export-bridge.test.ts`
- Create: `frontend/tests/copy-image.test.tsx`
- Modify: `frontend/tests/editor-flow.test.tsx`

**Interfaces:**
- Consumes: `svgToPngArtifact`, `copyPngToClipboard`, `choosePngDestination`, and `writePng`.
- Produces: adjacent accessible icon-only actions, shared action staging, stable status area, and retry behavior.

- [ ] **Step 1: Write failing action-integration tests**

Create `frontend/tests/copy-image.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { svgToPngArtifact } from "@/gantt/exportPng";
import { copyPngToClipboard } from "@/integrations/tauri/clipboardBridge";
import { choosePngDestination } from "@/integrations/tauri/exportBridge";

vi.mock("@/integrations/tauri/chartBridge", () => ({
  loadChart: vi.fn().mockResolvedValue(null),
  saveChart: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/gantt/exportPng", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/gantt/exportPng")>();
  return { ...actual, svgToPngArtifact: vi.fn() };
});
vi.mock("@/integrations/tauri/clipboardBridge", () => ({ copyPngToClipboard: vi.fn() }));
vi.mock("@/integrations/tauri/exportBridge", () => ({
  choosePngDestination: vi.fn(),
  writePng: vi.fn(),
}));

const artifact = {
  blob: new Blob([], { type: "image/png" }),
  bytes: new Uint8Array([137, 80, 78, 71]),
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("copies the same PowerPoint-ready artifact without opening the save dialog", async () => {
  const user = userEvent.setup();
  vi.mocked(svgToPngArtifact).mockResolvedValue(artifact);
  vi.mocked(copyPngToClipboard).mockResolvedValue(undefined);
  render(<App />);

  const copyButton = await screen.findByRole("button", { name: "Copy image" });
  expect(copyButton).toHaveTextContent("");
  await user.click(copyButton);

  expect(svgToPngArtifact).toHaveBeenCalledTimes(1);
  expect(copyPngToClipboard).toHaveBeenCalledWith(artifact);
  expect(choosePngDestination).not.toHaveBeenCalled();
  expect(await screen.findByText("Copied")).toBeVisible();
});

it("shows a retryable copy failure", async () => {
  const user = userEvent.setup();
  vi.mocked(svgToPngArtifact).mockResolvedValue(artifact);
  vi.mocked(copyPngToClipboard)
    .mockRejectedValueOnce(new Error("clipboard busy"))
    .mockResolvedValue(undefined);
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Copy image" }));
  expect(await screen.findByText("Could not copy image")).toHaveAttribute("title", "clipboard busy");
  await user.click(screen.getByRole("button", { name: "Retry copy" }));
  expect(copyPngToClipboard).toHaveBeenCalledTimes(2);
  expect(await screen.findByText("Copied")).toBeVisible();
});
```

Update `export-bridge.test.ts` to mock `svgToPngArtifact` and assert the export button has accessible name `Export PNG`, no text node, and still writes `artifact.bytes`.

- [ ] **Step 2: Run action tests and confirm failure**

Run: `bun run test -- frontend/tests/copy-image.test.tsx frontend/tests/export-bridge.test.ts`

Expected: FAIL because Copy Image and shared artifact staging are not wired into App.

- [ ] **Step 3: Replace export-only request state with a shared image action**

Add these types and states in `App.tsx`:

```ts
type ImageAction = "copy" | "export";
type ImageActionPhase = "idle" | "preparing" | "copied" | "exported" | "error";

const [imageRequest, setImageRequest] = useState<ImageAction | null>(null);
const [imagePhase, setImagePhase] = useState<ImageActionPhase>("idle");
const [imageError, setImageError] = useState("");
const imageInProgressRef = useRef(false);
const lastImageActionRef = useRef<ImageAction>("copy");

const requestImageAction = (action: ImageAction) => {
  if (imageInProgressRef.current || imageRequest !== null) return;
  lastImageActionRef.current = action;
  setImageRequest(action);
};
```

Replace `exportRequested` and `exportPhase` with one effect that rasterizes once and branches:

```ts
const runImageAction = useCallback(async (action: ImageAction) => {
  if (imageInProgressRef.current) return;
  const exportSvg = exportSvgRef.current;
  if (!exportSvg) {
    setImageError("The export chart is not ready.");
    setImagePhase("error");
    setImageRequest(null);
    return;
  }
  imageInProgressRef.current = true;
  setImagePhase("preparing");
  setImageError("");
  try {
    const artifact = await svgToPngArtifact(exportSvg, 2);
    if (action === "copy") {
      await copyPngToClipboard(artifact);
      setImagePhase("copied");
    } else {
      const path = await choosePngDestination(document.title);
      if (!path) {
        setImagePhase("idle");
        return;
      }
      await writePng(path, artifact.bytes);
      setImagePhase("exported");
    }
  } catch (error) {
    setImageError(error instanceof Error ? error.message : String(error));
    setImagePhase("error");
  } finally {
    imageInProgressRef.current = false;
    setImageRequest(null);
  }
}, [document.title]);
```

Keep the hidden export chart mounted only while `imageRequest` is non-null and trigger `runImageAction(imageRequest)` from the existing post-mount effect pattern. Import `POWERPOINT_SLIDE_WIDTH`, `POWERPOINT_SLIDE_HEIGHT`, and `POWERPOINT_SLIDE_MARGIN`, define this stable viewport outside `App`, and pass it to the export-mode chart:

```ts
const POWERPOINT_CHART_VIEWPORT = {
  width: POWERPOINT_SLIDE_WIDTH - POWERPOINT_SLIDE_MARGIN * 2,
  height: POWERPOINT_SLIDE_HEIGHT - POWERPOINT_SLIDE_MARGIN * 2,
} as const;
```

```tsx
<GanttChart
  ref={exportSvgRef}
  document={document}
  mode="export"
  selectedTaskId={null}
  viewport={POWERPOINT_CHART_VIEWPORT}
/>
```

This makes the SVG layout itself fit the PowerPoint content area before the shared rasterizer places it at the existing 64-pixel slide margin; both actions therefore produce the same complete 3840×2160 canvas without editor-only controls.

- [ ] **Step 4: Render compact grouped actions and stable statuses**

Use Lucide `Copy` and `Download` icons:

```tsx
<div className="toolbar-icon-group" aria-label="Chart image actions">
  <button type="button" className="icon-action" aria-label="Copy image" title="Copy image for PowerPoint" onClick={() => requestImageAction("copy")}>
    <Copy aria-hidden="true" />
  </button>
  <button type="button" className="icon-action" aria-label="Export PNG" title="Export PowerPoint-ready PNG" onClick={() => requestImageAction("export")}>
    <Download aria-hidden="true" />
  </button>
</div>
```

Disable both image-action buttons while `imagePhase === "preparing"`. Place settings immediately after this group. Use `.image-action-status` with a fixed inline size so status copy never moves the controls. Map phases to `Copying…`, `Copied`, `Preparing PNG…`, and `PNG exported` using `imageRequest` while work is active and `lastImageActionRef` after it settles. For errors, render `Could not copy image` or `Could not export PNG` with `title={imageError}`, plus `requestImageAction(lastImageActionRef.current)` on a button named `Retry copy` or `Retry export`.

- [ ] **Step 5: Update end-to-end editor expectations**

In `editor-flow.test.tsx`, add a Copy Image click before Export PNG and assert both call `svgToPngArtifact`, Copy calls only the clipboard bridge, and Export calls only destination/write. Retain add/edit/settings/autosave assertions.

- [ ] **Step 6: Verify all action paths**

Run: `bun run test -- frontend/tests/copy-image.test.tsx frontend/tests/export-bridge.test.ts frontend/tests/editor-flow.test.tsx frontend/tests/app-shell.test.tsx`

Expected: PASS.

Run: `bun run lint`

Expected: PASS.

- [ ] **Step 7: Record a safe task boundary**

Inspect the overlapping `App.tsx` staged diff carefully. Commit with `feat: add gantt copy and export actions` only if it contains no silent pre-existing hunks; otherwise keep it uncommitted and report the verified state.

---

### Task 7: Polish, Live Browser Review, Desktop Clipboard Smoke Test, and Full Verification

**Files:**
- Modify: `frontend/src/app/index.css`
- Modify: `README.md`
- Modify: `frontend/tests/settings-menu.test.tsx`
- Modify: `frontend/tests/app-shell.test.tsx`
- Preview-only update: `C:\tmp\gantt-browser-preview.html` (never stage or commit)

**Interfaces:**
- Consumes: the complete Tasks 1–6 editor.
- Produces: reference-aligned visual polish, working unclipped settings, documented copy/export workflow, and final verification evidence.

- [ ] **Step 1: Add final failing overflow and visual-contract assertions**

Add DOM contract assertions to `app-shell.test.tsx`:

```tsx
it("uses one flat non-scrolling workspace", async () => {
  render(<App />);
  const workspace = await screen.findByLabelText("Gantt chart workspace");
  expect(workspace).toHaveClass("chart-surface");
  expect(workspace.querySelector(".chart-viewport")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy image" })).toHaveClass("icon-action");
  expect(screen.getByRole("button", { name: "Export PNG" })).toHaveClass("icon-action");
  expect(screen.queryByText("Today")).not.toBeInTheDocument();
});
```

Keep the settings test that opens the popover and add an assertion that it is not inside an element with a scroll-container class.

- [ ] **Step 2: Finish reference-aligned CSS**

Set task labels to bold 600–700 weight using their adaptive inline font size. Use compact two-line date headers, `#e2e8f0` grid lines, saturated bars, 6-pixel maximum bar radius, and a 3-pixel orange marker. Remove `.gantt-today-label`, outer chart border/radius/shadow, scrollbar gutter, and gray page padding. Keep transient popovers/dialogs visually distinct because they float above the single workspace rather than dividing it.

- [ ] **Step 3: Update operator documentation**

Update README Editing and Storage/export sections to state:

```markdown
Click a task bar to show resize handles; click empty chart space or press Escape to clear them. Drag a bar to move it, drag either edge to resize it, and double-click for exact editing. Categories and colors can be reused from the task editor.

Copy Image places the same PowerPoint-ready 3840×2160 chart used by Export PNG on the Windows clipboard. Export PNG writes that image after a native destination is chosen.
```

Remove clipboard copy from the list of future capabilities.

- [ ] **Step 4: Update and reload the existing Codex browser preview**

The preview already supplies `window.__TAURI_INTERNALS__`, so extend its mock invoke handler in `C:\tmp\gantt-browser-preview.html` to return a numeric resource id (for example `1`) for `plugin:image|from_bytes`, return success for `plugin:clipboard-manager|write_image`, and return success for `plugin:resources|close`. Then reload `http://127.0.0.1:5174/gantt-browser-preview.html` in the already-open in-app browser.

Verify with one browser-side metrics read:

```js
({
  pageX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  pageY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  chartX: document.querySelector(".chart-viewport").scrollWidth - document.querySelector(".chart-viewport").clientWidth,
  chartY: document.querySelector(".chart-viewport").scrollHeight - document.querySelector(".chart-viewport").clientHeight,
})
```

Expected: all four values are `0`.

- [ ] **Step 5: Perform live browser interaction checks**

In the open preview, verify:

1. The complete starter chart, labels, dates, bars, and legend fit at once.
2. The title edits directly and has no toolbar counterpart.
3. Selecting a bar shows two handles; clicking blank workspace and pressing Escape each hide them.
4. The settings menu opens below the toolbar without clipping.
5. Category suggestions and used-color swatches appear in the task dialog.
6. Copy Image and Export PNG are adjacent icon-only buttons and success text does not move them.
7. The orange marker has no label and stays visually above the grid/bars.

- [ ] **Step 6: Run every automated quality gate**

Run from the repository root:

```powershell
bun run test
bun run lint
bun run build:frontend
```

Expected: all frontend tests PASS, lint exits 0, and the production build exits 0.

Run from `backend`:

```powershell
cargo fmt --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Expected: every Rust command exits 0 with no warnings.

- [ ] **Step 7: Perform the Windows desktop clipboard smoke check**

Run: `bun run desktop`.

Click Copy Image, paste into a blank PowerPoint slide, and confirm the pasted image is 16:9, contains the entire chart, contains no toolbar/title editor/handles/selection state, and visually matches Export PNG. If GUI launch or PowerPoint interaction requires user approval, request it immediately before opening the application.

- [ ] **Step 8: Inspect final repository scope**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm that the preview-only temp file is absent from Git and that all pre-existing user changes remain present. Stage and commit only clearly attributable remaining feature hunks with `feat: complete responsive gantt workspace`; leave inseparable user-owned hunks uncommitted and report them.

- [ ] **Step 9: Record final evidence**

Report the exact frontend and Rust command results, browser overflow metrics, browser interaction results, desktop clipboard result, files changed, commits created, and any intentionally uncommitted overlapping user work.
