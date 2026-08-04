# Interactive Gantt Chart Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows Tauri desktop editor where one auto-saved Gantt chart can be edited directly through whole-day bar dragging and resizing, precisely edited in a date dialog, configured to show either weekend day, and exported as a complete high-resolution PNG.

**Architecture:** A Bun-managed React 19 frontend renders controls in HTML and the complete chart in SVG from a shared pure layout model. Tauri 2 and Rust provide the desktop shell, versioned local JSON persistence, native save dialogs, and PNG file writing. Persistent chart data stays separate from transient selection and drag-preview state so pointer movement never writes to disk.

**Tech Stack:** Bun 1.3.14, React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Vitest 4, Testing Library, SVG, Tauri 2, Rust 2021, serde/serde_json.

## Global Constraints

- The primary development command is exactly `bun run desktop`.
- The initial target is a single-window Windows desktop application named **Gantt Chart Creator**.
- Dates are date-only ISO strings (`YYYY-MM-DD`) interpreted as local calendar dates, never instants.
- Task end dates are inclusive and can never precede task start dates.
- Bar movement and resizing snap to whole visible days.
- Saturday and Sunday visibility are independent persisted settings.
- The application manages one auto-saved chart; project-file loading is excluded.
- The same SVG/layout model drives the editor and PNG export.
- Export auto-fits the complete chart on a white background and excludes editor controls.
- Use test-driven development for every behavior-bearing change.

## File Map

### Root and tooling

- `package.json` — Bun scripts and frontend/Tauri dependencies.
- `bun.lock` — locked JavaScript dependency graph.
- `tsconfig.json` — TypeScript project references.
- `eslint.config.js` — TypeScript and React lint rules.
- `.gitignore` — generated frontend, Rust, editor, and local files.
- `README.md` — setup, commands, interaction guide, persistence, and export behavior.

### Frontend application

- `frontend/index.html` — Vite HTML entry.
- `frontend/vite.config.ts` — React, Tailwind, aliases, build, and Vitest configuration.
- `frontend/tsconfig.app.json` — browser TypeScript configuration.
- `frontend/tsconfig.node.json` — Vite configuration TypeScript settings.
- `frontend/tsconfig.tests.json` — test TypeScript settings.
- `frontend/tests/setup.ts` — jest-dom and DOM polyfills.
- `frontend/src/app/main.tsx` — React/Tauri browser entry.
- `frontend/src/app/App.tsx` — top-level load, state, autosave, and feature composition.
- `frontend/src/app/index.css` — theme, window shell, SVG, dialog, and pointer-state styling.
- `frontend/src/app/branding.ts` — stable product copy.

### Gantt domain and UI

- `frontend/src/gantt/model.ts` — chart/task types, validation, cloning, and schema version.
- `frontend/src/gantt/starterChart.ts` — first-launch editable sample document.
- `frontend/src/gantt/dateMath.ts` — date-only arithmetic and visible-day sequence.
- `frontend/src/gantt/layout.ts` — deterministic SVG dimensions and task geometry.
- `frontend/src/gantt/taskOperations.ts` — pure move and resize operations.
- `frontend/src/gantt/useBarDrag.ts` — pointer capture and transient drag lifecycle.
- `frontend/src/gantt/useAutosave.ts` — debounced persistence state machine.
- `frontend/src/gantt/GanttChart.tsx` — SVG chart composition and export/editor modes.
- `frontend/src/gantt/TaskBar.tsx` — selectable, draggable, resizable SVG task bar.
- `frontend/src/gantt/TaskEditorDialog.tsx` — add/edit/delete dialog with date pickers.
- `frontend/src/gantt/SettingsMenu.tsx` — independent weekend toggles.
- `frontend/src/gantt/exportPng.ts` — clean SVG clone and 2x PNG rasterization.

### Tauri integration

- `frontend/src/integrations/tauri/chartBridge.ts` — typed load/save/write command wrapper.
- `frontend/src/integrations/tauri/exportBridge.ts` — native PNG destination selection.
- `backend/Cargo.toml` — Rust and Tauri dependencies.
- `backend/build.rs` — Tauri build entry.
- `backend/tauri.conf.json` — desktop product/window/build configuration.
- `backend/capabilities/default.json` — core and save-dialog capability grant.
- `backend/src/main.rs` — Windows desktop executable entry.
- `backend/src/lib.rs` — Tauri plugin registration and command handlers.
- `backend/src/chart_document.rs` — Rust-side versioned chart schema and validation.
- `backend/src/storage.rs` — safe local JSON load/save and PNG write functions.
- `backend/tests/storage_flow.rs` — isolated persistence and invalid-data tests.

---

### Task 1: Scaffold the Bun, React, Vite, and Tauri desktop shell

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/tsconfig.tests.json`
- Create: `frontend/tests/setup.ts`
- Create: `frontend/tests/app-shell.test.tsx`
- Create: `frontend/src/app/branding.ts`
- Create: `frontend/src/app/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/index.css`
- Create: `backend/Cargo.toml`
- Create: `backend/build.rs`
- Create: `backend/tauri.conf.json`
- Create: `backend/capabilities/default.json`
- Create: `backend/src/main.rs`
- Create: `backend/src/lib.rs`

**Interfaces:**
- Consumes: none.
- Produces: `APP_DISPLAY_NAME`, a renderable `App`, the `bun run desktop` command, and a callable Tauri application shell for later tasks.

- [ ] **Step 1: Write the failing application-shell test**

```tsx
// frontend/tests/app-shell.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";

describe("App shell", () => {
  it("shows the product name and primary chart actions", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Gantt Chart Creator" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export PNG" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Chart settings" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Add the package and test configuration, then verify the test fails before `App` exists**

Create `package.json` with these scripts and dependency groups:

```json
{
  "name": "gantt-chart-creator",
  "private": true,
  "version": "0.1.0",
  "packageManager": "bun@1.3.14",
  "type": "module",
  "scripts": {
    "dev": "bun run dev:frontend",
    "dev:frontend": "vite --config frontend/vite.config.ts",
    "desktop": "cd backend && bun ../node_modules/@tauri-apps/cli/tauri.js dev",
    "build": "tsc -b && vite build --config frontend/vite.config.ts",
    "build:frontend": "tsc -b && vite build --config frontend/vite.config.ts",
    "build:desktop": "cd backend && bun ../node_modules/@tauri-apps/cli/tauri.js build --bundles nsis",
    "lint": "eslint .",
    "test": "vitest --run --config frontend/vite.config.ts",
    "test:watch": "vitest --config frontend/vite.config.ts",
    "tauri": "cd backend && bun ../node_modules/@tauri-apps/cli/tauri.js"
  },
  "dependencies": {
    "@fontsource/dm-sans": "^5.2.8",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "lucide-react": "^1.8.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@tailwindcss/vite": "^4.2.4",
    "@tauri-apps/cli": "^2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.12.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^17.5.0",
    "jsdom": "^29.0.2",
    "tailwindcss": "^4.2.4",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.58.2",
    "vite": "^8.0.9",
    "vitest": "^4.1.5"
  }
}
```

Configure `frontend/vite.config.ts` with `base: "./"`, `root` set to `frontend`, `@` mapped to `frontend/src`, `outDir: "dist"`, React and Tailwind plugins, jsdom tests using `frontend/tests/setup.ts`, and `server: { host: "127.0.0.1", port: 5173, strictPort: true }` so it exactly matches Tauri's `devUrl`.

Run: `bun install`  
Run: `bun run test -- frontend/tests/app-shell.test.tsx`  
Expected: FAIL because `@/app/App` does not exist.

- [ ] **Step 3: Implement the minimal shell and global styling**

```tsx
// frontend/src/app/App.tsx
import { Download, Plus, Settings } from "lucide-react";

import { APP_DISPLAY_NAME } from "@/app/branding";

export function App() {
  return (
    <main className="app-shell">
      <header className="toolbar">
        <h1>{APP_DISPLAY_NAME}</h1>
        <div className="toolbar-actions">
          <button type="button"><Plus aria-hidden="true" />Add task</button>
          <button type="button"><Download aria-hidden="true" />Export PNG</button>
          <button type="button" aria-label="Chart settings"><Settings aria-hidden="true" /></button>
        </div>
      </header>
      <section className="chart-surface" aria-label="Gantt chart workspace" />
    </main>
  );
}
```

```ts
// frontend/src/app/branding.ts
export const APP_DISPLAY_NAME = "Gantt Chart Creator";
```

Create `main.tsx` using `createRoot`, React `StrictMode`, DM Sans imports, `document.title = APP_DISPLAY_NAME`, and `index.css`. Give the body a white background, DM Sans stack, zero margin, full height, and hidden outer overflow. Style the toolbar as a 56-pixel row with a blue title, neutral border, compact rounded buttons, and a flexible white workspace beneath it.

- [ ] **Step 4: Add the minimal Tauri shell**

Use package name `gantt-chart-creator`, Rust library name `gantt_chart_creator_lib`, and Tauri identifier `com.hassaan.ganttchartcreator`.

```rust
// backend/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Gantt Chart Creator");
}
```

```rust
// backend/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gantt_chart_creator_lib::run();
}
```

Set the Tauri window to 1440×900 with minimum size 1050×650, centered. Configure `beforeDevCommand` as `bun run dev:frontend`, `devUrl` as `http://127.0.0.1:5173`, `beforeBuildCommand` as `bun run build:frontend`, and `frontendDist` as `../frontend/dist`.

- [ ] **Step 5: Run scaffold verification**

Run: `bun run test -- frontend/tests/app-shell.test.tsx`  
Expected: PASS.

Run: `bun run lint`  
Expected: PASS.

Run: `bun run build:frontend`  
Expected: PASS and `frontend/dist/index.html` exists.

Run: `cd backend; cargo check`  
Expected: PASS.

- [ ] **Step 6: Commit the desktop scaffold**

```powershell
git add .gitignore package.json bun.lock tsconfig.json eslint.config.js frontend backend
git commit -m "feat: scaffold gantt chart desktop app"
```

---

### Task 2: Implement the versioned chart model and date-only timeline math

**Files:**
- Create: `frontend/src/gantt/model.ts`
- Create: `frontend/src/gantt/starterChart.ts`
- Create: `frontend/src/gantt/dateMath.ts`
- Create: `frontend/tests/model.test.ts`
- Create: `frontend/tests/date-math.test.ts`

**Interfaces:**
- Consumes: none beyond TypeScript standard APIs.
- Produces: `ChartDocument`, `GanttTask`, `ChartSettings`, `parseChartDocument`, `createStarterChart`, `addCalendarDays`, `calendarDayDifference`, `visibleDatesBetween`, `addVisibleDays`, and `nearestVisibleDate`.

- [ ] **Step 1: Write failing model and date-math tests**

```ts
// frontend/tests/date-math.test.ts
import { describe, expect, it } from "vitest";

import { addCalendarDays, addVisibleDays, visibleDatesBetween } from "@/gantt/dateMath";

describe("date-only timeline math", () => {
  it("does not shift dates across daylight-saving boundaries", () => {
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("supports all weekend visibility combinations", () => {
    expect(visibleDatesBetween("2026-08-07", "2026-08-10", { showSaturday: false, showSunday: false }))
      .toEqual(["2026-08-07", "2026-08-10"]);
    expect(visibleDatesBetween("2026-08-07", "2026-08-10", { showSaturday: true, showSunday: false }))
      .toEqual(["2026-08-07", "2026-08-08", "2026-08-10"]);
    expect(visibleDatesBetween("2026-08-07", "2026-08-10", { showSaturday: false, showSunday: true }))
      .toEqual(["2026-08-07", "2026-08-09", "2026-08-10"]);
    expect(visibleDatesBetween("2026-08-07", "2026-08-10", { showSaturday: true, showSunday: true }))
      .toHaveLength(4);
  });

  it("moves by visible days while retaining actual calendar dates", () => {
    expect(addVisibleDays("2026-08-07", 1, { showSaturday: false, showSunday: false }))
      .toBe("2026-08-10");
  });
});
```

```ts
// frontend/tests/model.test.ts
import { describe, expect, it } from "vitest";

import { parseChartDocument } from "@/gantt/model";

describe("chart document validation", () => {
  it("accepts a valid schema version 1 document", () => {
    const value = parseChartDocument({
      schemaVersion: 1,
      title: "Execution Timeline",
      settings: { showSaturday: false, showSunday: false },
      tasks: [{ id: "task-1", name: "Build", startDate: "2026-08-04", endDate: "2026-08-05", category: "IRHX", color: "#00b95a" }],
    });
    expect(value.tasks[0].endDate).toBe("2026-08-05");
  });

  it("rejects an end date before its start date", () => {
    expect(() => parseChartDocument({
      schemaVersion: 1,
      title: "Broken",
      settings: { showSaturday: false, showSunday: false },
      tasks: [{ id: "task-1", name: "Build", startDate: "2026-08-05", endDate: "2026-08-04", category: "IRHX", color: "#00b95a" }],
    })).toThrow("endDate must not precede startDate");
  });

  it("rejects an impossible calendar date", () => {
    expect(() => parseChartDocument({
      schemaVersion: 1,
      title: "Broken",
      settings: { showSaturday: false, showSunday: false },
      tasks: [{ id: "task-1", name: "Build", startDate: "2026-02-30", endDate: "2026-03-01", category: "IRHX", color: "#00b95a" }],
    })).toThrow("dates must use valid YYYY-MM-DD values");
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm missing-module failures**

Run: `bun run test -- frontend/tests/model.test.ts frontend/tests/date-math.test.ts`  
Expected: FAIL because the Gantt model modules do not exist.

- [ ] **Step 3: Implement the model and strict parser**

```ts
// frontend/src/gantt/model.ts
export const CHART_SCHEMA_VERSION = 1 as const;
export type IsoDate = string;

export interface ChartSettings {
  showSaturday: boolean;
  showSunday: boolean;
}

export interface GanttTask {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  category: string;
  color: string;
}

export interface ChartDocument {
  schemaVersion: typeof CHART_SCHEMA_VERSION;
  title: string;
  settings: ChartSettings;
  tasks: GanttTask[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

export function parseChartDocument(value: unknown): ChartDocument {
  if (!value || typeof value !== "object") throw new Error("chart document must be an object");
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== CHART_SCHEMA_VERSION) throw new Error("unsupported chart schema version");
  if (typeof document.title !== "string" || !document.title.trim()) throw new Error("title is required");
  if (!document.settings || typeof document.settings !== "object") throw new Error("settings are required");
  const settings = document.settings as Record<string, unknown>;
  if (typeof settings.showSaturday !== "boolean" || typeof settings.showSunday !== "boolean") throw new Error("weekend settings must be boolean");
  if (!Array.isArray(document.tasks)) throw new Error("tasks must be an array");

  const tasks = document.tasks.map((item, index): GanttTask => {
    if (!item || typeof item !== "object") throw new Error(`task ${index + 1} must be an object`);
    const task = item as Record<string, unknown>;
    for (const field of ["id", "name", "startDate", "endDate", "category", "color"] as const) {
      if (typeof task[field] !== "string" || !task[field].trim()) throw new Error(`task ${index + 1} ${field} is required`);
    }
    if (!isValidIsoDate(task.startDate as string) || !isValidIsoDate(task.endDate as string)) throw new Error(`task ${index + 1} dates must use valid YYYY-MM-DD values`);
    if ((task.endDate as string) < (task.startDate as string)) throw new Error(`task ${index + 1} endDate must not precede startDate`);
    if (!HEX_COLOR.test(task.color as string)) throw new Error(`task ${index + 1} color must be a six-digit hex color`);
    return task as unknown as GanttTask;
  });

  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    title: document.title.trim(),
    settings: settings as unknown as ChartSettings,
    tasks,
  };
}
```

- [ ] **Step 4: Implement UTC-backed date-only arithmetic**

Use `Date.UTC(year, month - 1, day)` only as a calendar arithmetic mechanism; return strings and never expose JavaScript `Date` objects to chart state.

```ts
// frontend/src/gantt/dateMath.ts
import type { ChartSettings, IsoDate } from "@/gantt/model";

const DAY_MS = 86_400_000;

function toDayNumber(value: IsoDate): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function fromDayNumber(value: number): IsoDate {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

export function addCalendarDays(value: IsoDate, amount: number): IsoDate {
  return fromDayNumber(toDayNumber(value) + amount);
}

export function calendarDayDifference(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function isVisibleDate(value: IsoDate, settings: ChartSettings): boolean {
  const weekday = new Date(toDayNumber(value) * DAY_MS).getUTCDay();
  return (weekday !== 6 || settings.showSaturday) && (weekday !== 0 || settings.showSunday);
}

export function visibleDatesBetween(start: IsoDate, end: IsoDate, settings: ChartSettings): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let current = start; current <= end; current = addCalendarDays(current, 1)) {
    if (isVisibleDate(current, settings)) dates.push(current);
  }
  return dates;
}

export function addVisibleDays(value: IsoDate, amount: number, settings: ChartSettings): IsoDate {
  if (amount === 0) return nearestVisibleDate(value, 1, settings);
  const direction = amount > 0 ? 1 : -1;
  let current = value;
  let remaining = Math.abs(amount);
  while (remaining > 0) {
    current = addCalendarDays(current, direction);
    if (isVisibleDate(current, settings)) remaining -= 1;
  }
  return current;
}

export function nearestVisibleDate(value: IsoDate, direction: 1 | -1, settings: ChartSettings): IsoDate {
  let current = value;
  while (!isVisibleDate(current, settings)) current = addCalendarDays(current, direction);
  return current;
}
```

- [ ] **Step 5: Add deterministic starter data and pass the tests**

`createStarterChart(today = currentLocalIsoDate())` returns a new schema-version-1 document titled `Execution Timeline`, hides both weekend days, and includes five editable tasks across five categories using green, purple, amber, teal, and blue presentation-safe colors. Generate stable sample IDs such as `starter-assembly`; new user-created tasks will use `crypto.randomUUID()`.

```ts
// frontend/src/gantt/starterChart.ts
import { addVisibleDays, nearestVisibleDate } from "@/gantt/dateMath";
import { CHART_SCHEMA_VERSION, type ChartDocument, type ChartSettings } from "@/gantt/model";

const DEFAULT_SETTINGS: ChartSettings = { showSaturday: false, showSunday: false };

export function currentLocalIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createStarterChart(today = currentLocalIsoDate()): ChartDocument {
  const start = nearestVisibleDate(today, 1, DEFAULT_SETTINGS);
  const task = (id: string, name: string, from: number, to: number, category: string, color: string) => ({
    id,
    name,
    startDate: addVisibleDays(start, from, DEFAULT_SETTINGS),
    endDate: addVisibleDays(start, to, DEFAULT_SETTINGS),
    category,
    color,
  });
  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    title: "Execution Timeline",
    settings: DEFAULT_SETTINGS,
    tasks: [
      task("starter-assembly", "Assemble two units using calibrated meters", 0, 1, "IRHX", "#00b95a"),
      task("starter-testing", "Support PCS testing", 0, 5, "PCS Testing", "#8757ed"),
      task("starter-feedback", "Incorporate project feedback", 2, 3, "PDU R&D", "#f59e0b"),
      task("starter-inventory", "Complete component updates", 3, 4, "Inventory", "#55c5ca"),
      task("starter-quotes", "Review quotations and recommend a path", 0, 5, "HVDC", "#1689c8"),
    ],
  };
}
```

Run: `bun run test -- frontend/tests/model.test.ts frontend/tests/date-math.test.ts`  
Expected: PASS.

Run: `bun run lint`  
Expected: PASS.

- [ ] **Step 6: Commit the model and calendar behavior**

```powershell
git add frontend/src/gantt frontend/tests/model.test.ts frontend/tests/date-math.test.ts
git commit -m "feat: add gantt document and date math"
```

---

### Task 3: Build the deterministic SVG layout and static chart renderer

**Files:**
- Create: `frontend/src/gantt/layout.ts`
- Create: `frontend/src/gantt/GanttChart.tsx`
- Create: `frontend/src/gantt/TaskBar.tsx`
- Create: `frontend/tests/layout.test.ts`
- Create: `frontend/tests/gantt-chart.test.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`

**Interfaces:**
- Consumes: `ChartDocument`, `GanttTask`, and visible-date helpers from Task 2.
- Produces: `ChartLayout`, `TaskGeometry`, `calculateChartLayout(document, today)`, and `GanttChart` with editor/export render modes.

- [ ] **Step 1: Write failing geometry tests for normal and hidden-weekend tasks**

```ts
// frontend/tests/layout.test.ts
import { describe, expect, it } from "vitest";

import { calculateChartLayout, DAY_WIDTH, MIN_MARKER_WIDTH } from "@/gantt/layout";
import type { ChartDocument } from "@/gantt/model";

const document: ChartDocument = {
  schemaVersion: 1,
  title: "Execution Timeline",
  settings: { showSaturday: false, showSunday: false },
  tasks: [
    { id: "weekday", name: "Weekday task", startDate: "2026-08-07", endDate: "2026-08-10", category: "Build", color: "#00b95a" },
    { id: "weekend", name: "Weekend-only", startDate: "2026-08-08", endDate: "2026-08-09", category: "Build", color: "#00b95a" },
  ],
};

describe("chart layout", () => {
  it("compresses a hidden weekend inside a continuous bar", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.tasks.find((task) => task.id === "weekday")?.width).toBe(DAY_WIDTH * 2);
  });

  it("keeps a weekend-only task visible as a marker", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.tasks.find((task) => task.id === "weekend")?.width).toBe(MIN_MARKER_WIDTH);
  });

  it("grows vertically for every task and the legend", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.height).toBeGreaterThan(layout.headerHeight + document.tasks.length * layout.rowHeight);
  });
});
```

- [ ] **Step 2: Run the layout test to verify missing-module failure**

Run: `bun run test -- frontend/tests/layout.test.ts`  
Expected: FAIL because `@/gantt/layout` does not exist.

- [ ] **Step 3: Implement the layout model**

Define exact constants:

```ts
export const LABEL_WIDTH = 520;
export const DAY_WIDTH = 148;
export const HEADER_HEIGHT = 64;
export const ROW_HEIGHT = 44;
export const BAR_HEIGHT = 30;
export const LEGEND_HEIGHT = 56;
export const MIN_MARKER_WIDTH = 10;
```

`calculateChartLayout` must:

1. Determine the earliest start and latest end, or use five visible days before and after `today` for an empty chart.
2. Add one visible date of padding on each side.
3. Generate `visibleDates` with Task 2 helpers.
4. For each task, find visible dates within its inclusive range.
5. Give a normal task `x` at its first included date and a width covering its last included date.
6. Give a task with no visible dates a `MIN_MARKER_WIDTH` marker centered on the insertion seam before the first visible date after its end.
7. Set `width = LABEL_WIDTH + visibleDates.length * DAY_WIDTH` and `height = HEADER_HEIGHT + taskCount * ROW_HEIGHT + LEGEND_HEIGHT`.
8. Return unique legend items in first-task appearance order.

- [ ] **Step 4: Write the failing static SVG component test**

```tsx
// frontend/tests/gantt-chart.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

describe("GanttChart", () => {
  it("renders task names, date headers, bars, and legend", () => {
    render(<GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />);
    expect(screen.getByRole("img", { name: "Execution Timeline Gantt chart" })).toBeVisible();
    expect(screen.getAllByTestId("task-bar").length).toBeGreaterThan(0);
    expect(screen.getByText("IRHX")).toBeVisible();
    expect(screen.getByText("Tue")).toBeVisible();
  });

  it("omits editor-only handles in export mode", () => {
    const chart = createStarterChart("2026-08-04");
    const { rerender } = render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);
    expect(screen.getAllByTestId("resize-handle")).toHaveLength(2);
    rerender(<GanttChart document={chart} mode="export" selectedTaskId={chart.tasks[0].id} />);
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement static chart composition**

`GanttChart` accepts:

```ts
interface GanttChartProps {
  document: ChartDocument;
  mode: "editor" | "export";
  selectedTaskId: string | null;
  previewTask?: GanttTask;
  onSelectTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onPreviewTask?: (task: GanttTask | null) => void;
  onCommitTask?: (task: GanttTask) => void;
}
```

Render one root `<svg role="img">` with a white background, title/date text, grid lines, one row group per task, the today marker when visible, and a category legend. `TaskBar` renders rounded `<rect>` bars, a transparent enlarged hit target, and two 10-pixel-wide handles only when selected in editor mode. Put task names inside the SVG label area so export includes them.

Update `App` to hold `createStarterChart()` and render `GanttChart` in a horizontally and vertically scrollable `.chart-viewport`.

- [ ] **Step 6: Verify static rendering and build**

Run: `bun run test -- frontend/tests/layout.test.ts frontend/tests/gantt-chart.test.tsx`  
Expected: PASS.

Run: `bun run build:frontend`  
Expected: PASS.

- [ ] **Step 7: Commit the layout and SVG renderer**

```powershell
git add frontend/src/app frontend/src/gantt frontend/tests/layout.test.ts frontend/tests/gantt-chart.test.tsx
git commit -m "feat: render gantt chart as svg"
```

---

### Task 4: Add whole-day bar dragging and edge resizing

**Files:**
- Create: `frontend/src/gantt/taskOperations.ts`
- Create: `frontend/src/gantt/useBarDrag.ts`
- Create: `frontend/tests/task-operations.test.ts`
- Create: `frontend/tests/bar-interactions.test.tsx`
- Modify: `frontend/src/gantt/TaskBar.tsx`
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`

**Interfaces:**
- Consumes: date helpers, `GanttTask`, `ChartSettings`, `DAY_WIDTH`, and callbacks from Task 3.
- Produces: `moveTaskByVisibleSteps`, `resizeTaskByVisibleSteps`, `useBarDrag`, live `previewTask`, and one committed task per pointer release.

- [ ] **Step 1: Write failing pure-operation tests**

```ts
// frontend/tests/task-operations.test.ts
import { describe, expect, it } from "vitest";

import { moveTaskByVisibleSteps, resizeTaskByVisibleSteps } from "@/gantt/taskOperations";

const task = { id: "a", name: "Task", startDate: "2026-08-07", endDate: "2026-08-10", category: "Build", color: "#00b95a" };
const weekdays = { showSaturday: false, showSunday: false };

describe("direct task operations", () => {
  it("moves one visible step across a hidden weekend and preserves calendar duration", () => {
    expect(moveTaskByVisibleSteps(task, 1, weekdays)).toMatchObject({ startDate: "2026-08-10", endDate: "2026-08-13" });
  });

  it("resizes the right edge to the next visible day", () => {
    expect(resizeTaskByVisibleSteps(task, "end", 1, weekdays).endDate).toBe("2026-08-11");
  });

  it("clamps the left edge so duration remains at least one day", () => {
    expect(resizeTaskByVisibleSteps(task, "start", 10, weekdays).startDate).toBe(task.endDate);
  });
});
```

- [ ] **Step 2: Verify operation tests fail**

Run: `bun run test -- frontend/tests/task-operations.test.ts`  
Expected: FAIL because `taskOperations.ts` does not exist.

- [ ] **Step 3: Implement minimal pure move and resize functions**

```ts
// frontend/src/gantt/taskOperations.ts
import { addCalendarDays, addVisibleDays, calendarDayDifference } from "@/gantt/dateMath";
import type { ChartSettings, GanttTask } from "@/gantt/model";

export function moveTaskByVisibleSteps(task: GanttTask, steps: number, settings: ChartSettings): GanttTask {
  const duration = calendarDayDifference(task.startDate, task.endDate);
  const startDate = addVisibleDays(task.startDate, steps, settings);
  return { ...task, startDate, endDate: addCalendarDays(startDate, duration) };
}

export function resizeTaskByVisibleSteps(
  task: GanttTask,
  edge: "start" | "end",
  steps: number,
  settings: ChartSettings,
): GanttTask {
  if (edge === "start") {
    const proposed = addVisibleDays(task.startDate, steps, settings);
    return { ...task, startDate: proposed > task.endDate ? task.endDate : proposed };
  }
  const proposed = addVisibleDays(task.endDate, steps, settings);
  return { ...task, endDate: proposed < task.startDate ? task.startDate : proposed };
}
```

- [ ] **Step 4: Write a failing pointer lifecycle test**

```tsx
// frontend/tests/bar-interactions.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

describe("bar pointer interactions", () => {
  it("previews during movement and commits once on pointer release", () => {
    const chart = createStarterChart("2026-08-04");
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={chart.tasks[0].id}
        onPreviewTask={onPreviewTask}
        onCommitTask={onCommitTask}
      />,
    );
    const bar = screen.getAllByTestId("task-bar")[0];
    Object.defineProperty(bar, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(bar, "releasePointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 248 });
    expect(onPreviewTask).toHaveBeenCalled();
    expect(onCommitTask).not.toHaveBeenCalled();
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 248 });
    expect(onCommitTask).toHaveBeenCalledTimes(1);
  });

  it("clears its preview without committing when the pointer is canceled", () => {
    const chart = createStarterChart("2026-08-04");
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={chart.tasks[0].id}
        onPreviewTask={onPreviewTask}
        onCommitTask={onCommitTask}
      />,
    );
    const bar = screen.getAllByTestId("task-bar")[0];
    Object.defineProperty(bar, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(bar, { pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 2, clientX: 248 });
    fireEvent.pointerCancel(bar, { pointerId: 2 });
    expect(onPreviewTask).toHaveBeenLastCalledWith(null);
    expect(onCommitTask).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Implement pointer capture and preview/commit behavior**

`useBarDrag` receives the original task, interaction kind (`move`, `resize-start`, or `resize-end`), day width, weekend settings, and preview/commit callbacks. On pointer down, capture the pointer and store the origin. On pointer move, compute `Math.round((clientX - originX) / dayWidth)`, transform the original task with the pure functions, and emit preview only when the step count changes. On pointer up, commit the last preview once, clear preview, and release capture. On `pointercancel` or lost capture, clear preview without committing.

Wire the bar body to `move`, the left handle to `resize-start`, and the right handle to `resize-end`. Stop propagation from handles. Set `touch-action: none` and use `cursor: grab`, `grabbing`, or `ew-resize` based on interaction state. A click selects the bar; a double-click calls `onEditTask`.

- [ ] **Step 6: Verify direct manipulation behavior**

Run: `bun run test -- frontend/tests/task-operations.test.ts frontend/tests/bar-interactions.test.tsx`  
Expected: PASS.

Run: `bun run test`  
Expected: all frontend tests PASS.

- [ ] **Step 7: Commit direct manipulation**

```powershell
git add frontend/src/gantt frontend/src/app frontend/tests/task-operations.test.ts frontend/tests/bar-interactions.test.tsx
git commit -m "feat: drag and resize gantt tasks"
```

---

### Task 5: Add precise task editing, task creation/deletion, title editing, and weekend settings

**Files:**
- Create: `frontend/src/gantt/TaskEditorDialog.tsx`
- Create: `frontend/src/gantt/SettingsMenu.tsx`
- Create: `frontend/tests/task-editor.test.tsx`
- Create: `frontend/tests/settings-menu.test.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/src/gantt/GanttChart.tsx`

**Interfaces:**
- Consumes: `ChartDocument`, `GanttTask`, `createStarterChart`, and `GanttChart` callbacks.
- Produces: validated add/edit/delete events, editable chart title, independent weekend settings, and double-click-to-edit behavior.

- [ ] **Step 1: Write failing task-editor tests**

```tsx
// frontend/tests/task-editor.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TaskEditorDialog } from "@/gantt/TaskEditorDialog";

const task = { id: "task-1", name: "Build", startDate: "2026-08-04", endDate: "2026-08-06", category: "IRHX", color: "#00b95a" };

describe("TaskEditorDialog", () => {
  it("edits exact dates and returns a validated task", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TaskEditorDialog mode="edit" task={task} onSave={onSave} onCancel={vi.fn()} onDelete={vi.fn()} />);
    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-08-08");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ endDate: "2026-08-08" }));
  });

  it("keeps the dialog open when the end precedes the start", async () => {
    const user = userEvent.setup();
    render(<TaskEditorDialog mode="edit" task={task} onSave={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />);
    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(screen.getByText("End date cannot be before start date.")).toBeVisible();
  });
});
```

- [ ] **Step 2: Write a failing settings test**

```tsx
// frontend/tests/settings-menu.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingsMenu } from "@/gantt/SettingsMenu";

describe("SettingsMenu", () => {
  it("changes Saturday and Sunday independently", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsMenu settings={{ showSaturday: false, showSunday: false }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Chart settings" }));
    await user.click(screen.getByRole("checkbox", { name: "Show Saturday" }));
    expect(onChange).toHaveBeenCalledWith({ showSaturday: true, showSunday: false });
  });
});
```

- [ ] **Step 3: Run focused tests and verify missing-component failures**

Run: `bun run test -- frontend/tests/task-editor.test.tsx frontend/tests/settings-menu.test.tsx`  
Expected: FAIL because both components are missing.

- [ ] **Step 4: Implement the task dialog**

Use a native `<dialog open>`-style modal surface with labeled inputs for name, `type="date"` start and end, category, and `type="color"` color. Keep a draft copy of the task. Validate trimmed name/category, six-digit color, and `endDate >= startDate` on submit. Escape and **Cancel** discard the draft.

In edit mode, **Delete task** first reveals `Delete this task?` with **Delete** and **Keep task** actions. Only the second destructive click calls `onDelete(task.id)`. In create mode, omit deletion.

For new tasks, `App` supplies:

```ts
function createNewTask(startDate: string): GanttTask {
  return {
    id: crypto.randomUUID(),
    name: "New task",
    startDate,
    endDate: addCalendarDays(startDate, 2),
    category: "General",
    color: "#2f55cf",
  };
}
```

- [ ] **Step 5: Implement settings and compose editor state in `App`**

`SettingsMenu` is a toolbar popover with two controlled checkboxes. Escape and outside click close it. `App` owns one `ChartDocument`, `selectedTaskId`, dialog mode, and `previewTask`. All committed changes replace only the affected task by ID.

Wire behavior as follows:

- **Add task** opens `TaskEditorDialog` in create mode.
- Double-clicking a bar opens it in edit mode.
- Save inserts or replaces the task and closes the dialog.
- Delete removes the task and closes the dialog.
- The chart title is a controlled text input with accessible label `Chart title`; blank input is allowed while focused but normalizes to `Untitled Gantt Chart` on blur.
- Weekend changes replace `document.settings` and immediately recalculate the SVG.

- [ ] **Step 6: Add integration assertions for double-click and cancellation**

Extend `frontend/tests/gantt-chart.test.tsx` to double-click the first bar and assert `onEditTask` receives its ID. Extend `task-editor.test.tsx` to change the name, click **Cancel**, and assert neither `onSave` nor `onDelete` ran.

Run: `bun run test -- frontend/tests/task-editor.test.tsx frontend/tests/settings-menu.test.tsx frontend/tests/gantt-chart.test.tsx`  
Expected: PASS.

Run: `bun run test`  
Expected: all frontend tests PASS.

- [ ] **Step 7: Commit complete local editing**

```powershell
git add frontend/src/app frontend/src/gantt frontend/tests
git commit -m "feat: add gantt task and timeline controls"
```

---

### Task 6: Add versioned Rust persistence and debounced frontend auto-save

**Files:**
- Create: `backend/src/chart_document.rs`
- Create: `backend/src/storage.rs`
- Create: `backend/tests/storage_flow.rs`
- Create: `frontend/src/integrations/tauri/chartBridge.ts`
- Create: `frontend/src/gantt/useAutosave.ts`
- Create: `frontend/tests/chart-bridge.test.ts`
- Create: `frontend/tests/autosave.test.tsx`
- Modify: `backend/src/lib.rs`
- Modify: `backend/Cargo.toml`
- Modify: `frontend/src/app/App.tsx`

**Interfaces:**
- Consumes: the schema-version-1 frontend document shape from Task 2.
- Produces: Rust commands `load_chart` and `save_chart`, frontend `loadChart` and `saveChart`, and `useAutosave(document, enabled)` with `idle | saving | saved | error` state.

- [ ] **Step 1: Write failing Rust storage tests**

```rust
// backend/tests/storage_flow.rs
use std::fs;

use gantt_chart_creator_lib::chart_document::{ChartDocument, ChartSettings, GanttTask};
use gantt_chart_creator_lib::storage::{load_chart_from, save_chart_to};

fn sample() -> ChartDocument {
    ChartDocument {
        schema_version: 1,
        title: "Execution Timeline".into(),
        settings: ChartSettings { show_saturday: false, show_sunday: false },
        tasks: vec![GanttTask {
            id: "task-1".into(), name: "Build".into(), start_date: "2026-08-04".into(),
            end_date: "2026-08-05".into(), category: "IRHX".into(), color: "#00b95a".into(),
        }],
    }
}

#[test]
fn saves_and_loads_a_versioned_chart() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    save_chart_to(&path, &sample()).unwrap();
    assert_eq!(load_chart_from(&path).unwrap().unwrap(), sample());
}

#[test]
fn invalid_json_is_preserved_and_reported() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    fs::write(&path, b"{invalid").unwrap();
    assert!(load_chart_from(&path).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"{invalid");
}

#[test]
fn a_missing_file_loads_as_none() {
    let root = tempfile::tempdir().unwrap();
    assert_eq!(load_chart_from(&root.path().join("chart.json")).unwrap(), None);
}
```

- [ ] **Step 2: Run Rust test and confirm unresolved-module failure**

Run: `cd backend; cargo test --test storage_flow`  
Expected: FAIL because `chart_document` and `storage` are missing.

- [ ] **Step 3: Implement the Rust document and safe replacement storage**

Add `tempfile = "3"` under `[dev-dependencies]`. Define serde structs with `#[serde(rename_all = "camelCase")]`, `Clone`, `Debug`, `Serialize`, `Deserialize`, `PartialEq`, and `Eq`. `ChartDocument::validate()` checks schema version 1, nonblank title, nonblank task strings, `YYYY-MM-DD` string shape, `end_date >= start_date`, and six-digit hex colors.

`load_chart_from(path)` returns `Ok(None)` for `NotFound`, otherwise reads bytes, deserializes, validates, and returns the document without modifying the source.

`save_chart_to(path, document)` validates first, creates the parent directory, serializes pretty JSON, writes and `sync_all`s `chart.json.tmp`, renames an existing target to `chart.json.backup`, renames the temp file to the target, restores the backup if replacement fails, and removes the backup after success.

- [ ] **Step 4: Expose Tauri persistence commands**

```rust
#[tauri::command]
fn load_chart(app: tauri::AppHandle) -> Result<Option<ChartDocument>, String> {
    let path = app.path().app_data_dir().map_err(|error| error.to_string())?.join("chart.json");
    storage::load_chart_from(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_chart(app: tauri::AppHandle, document: ChartDocument) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|error| error.to_string())?.join("chart.json");
    storage::save_chart_to(&path, &document).map_err(|error| error.to_string())
}
```

Register both commands with `tauri::generate_handler![load_chart, save_chart]`. Import `tauri::Manager` for path resolution.

Run: `cd backend; cargo test --test storage_flow`  
Expected: PASS.

- [ ] **Step 5: Write failing frontend bridge and debounce tests**

Mock `@tauri-apps/api/core` and assert `loadChart()` invokes `load_chart` then parses the result, while `saveChart(document)` invokes `save_chart` with `{ document }`.

In `autosave.test.tsx`, use fake timers and a harness component. Render once with `enabled={false}`, rerender with `enabled={true}` and a changed document, advance 299 ms and assert `saveChart` has not run, advance 1 ms and assert it ran once. Rerender several times within the window and assert only the latest document is saved.

- [ ] **Step 6: Implement the typed bridge and autosave hook**

```ts
// frontend/src/integrations/tauri/chartBridge.ts
import { invoke } from "@tauri-apps/api/core";

import { parseChartDocument, type ChartDocument } from "@/gantt/model";

export async function loadChart(): Promise<ChartDocument | null> {
  const value = await invoke<unknown>("load_chart");
  return value === null ? null : parseChartDocument(value);
}

export function saveChart(document: ChartDocument): Promise<void> {
  return invoke("save_chart", { document });
}
```

`useAutosave` waits 300 ms after the last committed document change, skips the initial loaded value, exposes `{ phase, message, retry }`, and retains the unsaved document after failure. `retry` saves the latest document immediately.

- [ ] **Step 7: Integrate startup load, reset, and status feedback**

`App` starts in a loading state, calls `loadChart`, and uses starter data only for `null`. A load/validation error shows a blocking recovery panel with the error text and **Reset to starter chart**; clicking reset creates starter data and saves it. Do not automatically overwrite invalid data.

Show a subtle toolbar status for `Saving…`, `Saved`, or `Could not save`. The error state includes a **Retry** button. Enable autosave only after startup resolution so starter/load initialization does not race.

Run: `bun run test -- frontend/tests/chart-bridge.test.ts frontend/tests/autosave.test.tsx`  
Expected: PASS.

- [ ] **Step 8: Run persistence verification and commit**

Run: `bun run test`  
Expected: all frontend tests PASS.

Run: `cd backend; cargo test`  
Expected: all Rust tests PASS.

```powershell
git add backend frontend/src/app frontend/src/gantt/useAutosave.ts frontend/src/integrations frontend/tests
git commit -m "feat: persist the active gantt chart"
```

---

### Task 7: Export the full chart as a clean high-resolution PNG

**Files:**
- Create: `frontend/src/gantt/exportPng.ts`
- Create: `frontend/src/integrations/tauri/exportBridge.ts`
- Create: `frontend/tests/export-png.test.ts`
- Create: `frontend/tests/export-bridge.test.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/gantt/GanttChart.tsx`
- Modify: `backend/src/storage.rs`
- Modify: `backend/src/lib.rs`
- Modify: `backend/tests/storage_flow.rs`
- Modify: `backend/Cargo.toml`
- Modify: `backend/capabilities/default.json`

**Interfaces:**
- Consumes: export-mode `GanttChart`, calculated SVG dimensions, active `ChartDocument`, and Rust storage utilities.
- Produces: `sanitizeExportFilename`, `prepareExportSvg`, `svgToPngBytes`, `choosePngDestination`, `writePng`, and Tauri command `write_png`.

- [ ] **Step 1: Write failing export preparation tests**

```ts
// frontend/tests/export-png.test.ts
import { describe, expect, it } from "vitest";

import { prepareExportSvg, sanitizeExportFilename } from "@/gantt/exportPng";

describe("PNG export preparation", () => {
  it("sanitizes a chart title for Windows", () => {
    expect(sanitizeExportFilename("Execution: Timeline / Week 32")).toBe("Execution Timeline Week 32.png");
  });

  it("removes editor-only elements and fixes a white background", () => {
    document.body.innerHTML = `<svg width="800" height="400"><rect data-export-background="true" fill="transparent"/><g data-editor-only="true"><circle/></g><text>Task</text></svg>`;
    const result = prepareExportSvg(document.querySelector("svg")!);
    expect(result.querySelector("[data-editor-only='true']")).toBeNull();
    expect(result.querySelector("[data-export-background='true']")?.getAttribute("fill")).toBe("#ffffff");
    expect(result.getAttribute("viewBox")).toBe("0 0 800 400");
  });
});
```

- [ ] **Step 2: Verify export test failure**

Run: `bun run test -- frontend/tests/export-png.test.ts`  
Expected: FAIL because `exportPng.ts` does not exist.

- [ ] **Step 3: Implement clean SVG cloning and 2x canvas rasterization**

```ts
export function prepareExportSvg(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-editor-only='true']").forEach((node) => node.remove());
  const width = Number(source.getAttribute("width"));
  const height = Number(source.getAttribute("height"));
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.querySelector("[data-export-background='true']")?.setAttribute("fill", "#ffffff");
  return clone;
}
```

`svgToPngBytes(source, scale = 2)` serializes the prepared clone with `XMLSerializer`, loads it through a Blob object URL into an `Image`, creates a canvas at `width * scale` by `height * scale`, scales the 2D context, draws the SVG, calls `canvas.toBlob(..., "image/png")`, converts the Blob to `Uint8Array`, and revokes every object URL in `finally`. Reject with specific errors when dimensions are invalid, the image cannot load, no 2D context exists, or `toBlob` returns null.

`sanitizeExportFilename` removes Windows-invalid characters `<>:"/\\|?*`, collapses whitespace, trims trailing periods/spaces, falls back to `Gantt Chart`, and appends `.png` exactly once.

- [ ] **Step 4: Add the native destination and Rust PNG writer tests**

`choosePngDestination(title)` calls `save` from `@tauri-apps/plugin-dialog` with filter `{ name: "PNG image", extensions: ["png"] }` and returns `null` on cancellation. `writePng(path, bytes)` invokes `write_png` with the byte array.

```ts
// frontend/src/integrations/tauri/exportBridge.ts
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { sanitizeExportFilename } from "@/gantt/exportPng";

export function choosePngDestination(title: string): Promise<string | null> {
  return save({
    defaultPath: sanitizeExportFilename(title),
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
}

export function writePng(path: string, bytes: Uint8Array): Promise<void> {
  return invoke("write_png", { path, bytes: Array.from(bytes) });
}
```

```ts
// frontend/tests/export-bridge.test.ts
it("writes PNG bytes through the Tauri command", async () => {
  await writePng("C:\\Exports\\chart.png", new Uint8Array([137, 80, 78, 71]));
  expect(invoke).toHaveBeenCalledWith("write_png", {
    path: "C:\\Exports\\chart.png",
    bytes: [137, 80, 78, 71],
  });
});
```

Extend Rust storage tests:

```rust
#[test]
fn writes_png_bytes_to_the_chosen_path() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.png");
    let bytes = b"\x89PNG\r\n\x1a\nexample";
    gantt_chart_creator_lib::storage::write_png_to(&path, bytes).unwrap();
    assert_eq!(fs::read(path).unwrap(), bytes);
}
```

`write_png_to` rejects empty bytes, creates the parent directory, and writes the exact byte slice. The Tauri `write_png(path: String, bytes: Vec<u8>)` command requires a `.png` extension case-insensitively before calling it.

- [ ] **Step 5: Register dialog capability and integrate export in `App`**

Register `tauri_plugin_dialog::init()` in the Tauri builder and grant `dialog:allow-save` in `backend/capabilities/default.json`.

Keep an offscreen, non-`display:none` export-mode `GanttChart` mounted with a React ref. On **Export PNG**:

1. Set status to `Preparing PNG…` and prevent duplicate clicks.
2. Call `svgToPngBytes(exportSvgRef.current, 2)`.
3. Call `choosePngDestination(document.title)`.
4. If a path is selected, call `writePng(path, bytes)`.
5. Show `PNG exported` on success or a retryable error on failure.
6. Treat dialog cancellation as an idle outcome.

The export-mode chart must receive no preview task, no selected task, and no editor callbacks.

- [ ] **Step 6: Verify export behavior**

Run: `bun run test -- frontend/tests/export-png.test.ts frontend/tests/export-bridge.test.ts`  
Expected: PASS.

Run: `cd backend; cargo test`  
Expected: PASS including PNG write coverage.

Run: `bun run test`  
Expected: all frontend tests PASS.

- [ ] **Step 7: Commit presentation-ready export**

```powershell
git add backend frontend/src/app frontend/src/gantt frontend/src/integrations frontend/tests
git commit -m "feat: export complete gantt chart as png"
```

---

### Task 8: Complete visual polish, documentation, and end-to-end verification

**Files:**
- Create: `README.md`
- Create: `frontend/tests/editor-flow.test.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/index.css`
- Modify: `frontend/tests/app-shell.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the complete editor, persistence bridge, and export pipeline from Tasks 1–7.
- Produces: a cohesive first-milestone desktop workflow and documented operator commands.

- [ ] **Step 1: Write a failing complete editor-flow test**

Mock `loadChart`, `saveChart`, `choosePngDestination`, `svgToPngBytes`, and `writePng`. The test must:

```tsx
it("adds, edits, configures, autosaves, and exports one chart", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<App />);
  expect(await screen.findByLabelText("Gantt chart workspace")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Add task" }));
  await user.clear(screen.getByLabelText("Task name"));
  await user.type(screen.getByLabelText("Task name"), "Prepare weekly review");
  await user.click(screen.getByRole("button", { name: "Save task" }));
  expect(screen.getByText("Prepare weekly review")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Chart settings" }));
  await user.click(screen.getByRole("checkbox", { name: "Show Saturday" }));
  vi.advanceTimersByTime(300);
  expect(saveChart).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Export PNG" }));
  expect(writePng).toHaveBeenCalled();
});
```

Run: `bun run test -- frontend/tests/editor-flow.test.tsx`  
Expected: FAIL until the final app wiring and stable accessible labels are complete.

- [ ] **Step 2: Finish cohesive shell styling and responsive overflow**

Match the approved reference character without copying its exact branding:

- White chart and export background.
- Blue chart title with a thin cool-gray divider.
- Dark gray date labels and task text.
- Pale vertical grid lines.
- Rounded saturated task bars.
- Orange today marker with a small label.
- Compact legend aligned along the bottom.
- Toolbar controls outside the exported SVG.
- Sticky toolbar while the chart viewport scrolls.
- Minimum 10-pixel effective resize targets with visible selection outlines.
- At 1050×650, preserve toolbar access and allow both-axis chart scrolling rather than shrinking day columns below readability.

Add `prefers-reduced-motion` rules that remove nonessential transitions. Ensure focus rings are visible on toolbar buttons, menu controls, dialog controls, title input, and SVG task hit targets.

- [ ] **Step 3: Write operator documentation**

`README.md` must include:

```markdown
# Gantt Chart Creator

## Requirements
- Bun 1.3.14 or compatible 1.3.x
- Rust stable with Cargo
- Tauri 2 Windows prerequisites (Microsoft C++ Build Tools and WebView2)

## Run
`bun install`
`bun run desktop`

## Verify
`bun run test`
`bun run lint`
`bun run build:frontend`
`cd backend && cargo test && cargo clippy --all-targets --all-features -- -D warnings`

## Editing
Drag a bar to move it, drag either edge to resize it, and double-click it for exact dates. Use Chart settings to show Saturday or Sunday independently.

## Storage and export
The active chart auto-saves in the Tauri application-data folder. Export PNG writes a complete 2x image after a native destination is chosen.
```

Also state that the app currently manages one chart and portable project loading, clipboard copy, and PowerPoint output are future capabilities.

- [ ] **Step 4: Run all automated quality gates**

Run: `bun run test`  
Expected: all frontend tests PASS.

Run: `bun run lint`  
Expected: PASS with no warnings.

Run: `bun run build:frontend`  
Expected: PASS.

Run: `cd backend; cargo fmt --check`  
Expected: PASS.

Run: `cd backend; cargo test`  
Expected: all Rust tests PASS.

Run: `cd backend; cargo clippy --all-targets --all-features -- -D warnings`  
Expected: PASS with no warnings.

- [ ] **Step 5: Run the desktop smoke check**

Run: `bun run desktop`.

Manually confirm in the opened Tauri window:

1. Starter tasks and the full legend render.
2. Dragging a bar center moves it exactly one column at a time.
3. Dragging each edge changes only that endpoint.
4. Double-clicking opens date fields and saved dates immediately alter the bar.
5. Saturday and Sunday each appear only when enabled.
6. Closing and reopening restores the edited title, tasks, and settings.
7. Exporting produces a readable PNG containing every task and no toolbar, handles, dialog, selection state, or clipping.

- [ ] **Step 6: Inspect repository scope and commit the completed milestone**

Run: `git status --short`  
Expected: only the README, final UI/test changes, and generated lock/config updates intended by this task are present; `frontend/dist`, `node_modules`, and `backend/target` remain ignored.

```powershell
git add README.md .gitignore frontend
git commit -m "feat: complete interactive gantt chart editor"
```

- [ ] **Step 7: Record final verification evidence**

Run: `git status --short`  
Expected: no output.

Run: `git log --oneline -8`  
Expected: one focused commit for each completed plan task, with the approved design and implementation plan earlier in history.

Do not push automatically. Report the passing commands, the desktop smoke result, the generated PNG location used for the smoke check, and the current branch/commit so the owner can choose when to publish to `origin`.
