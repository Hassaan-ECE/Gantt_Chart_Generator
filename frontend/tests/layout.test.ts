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
