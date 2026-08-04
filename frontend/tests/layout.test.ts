import { describe, expect, it } from "vitest";

import {
  calculateChartLayout,
  DAY_WIDTH,
  HEADER_HEIGHT,
  LABEL_WIDTH,
  LEGEND_HEIGHT,
  MIN_MARKER_WIDTH,
  ROW_HEIGHT,
} from "@/gantt/layout";
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
    const marker = layout.tasks.find((task) => task.id === "weekend");
    expect(marker?.width).toBe(MIN_MARKER_WIDTH);
    expect(marker?.x).toBe(LABEL_WIDTH + DAY_WIDTH * 2 - MIN_MARKER_WIDTH / 2);
  });

  it("grows vertically for every task and the legend", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.height).toBeGreaterThan(layout.headerHeight + document.tasks.length * layout.rowHeight);
  });

  it("pads the visible range and derives chart dimensions from it", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.visibleDates).toEqual(["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"]);
    expect(layout.width).toBe(LABEL_WIDTH + layout.visibleDates.length * DAY_WIDTH);
    expect(layout.height).toBe(HEADER_HEIGHT + document.tasks.length * ROW_HEIGHT + LEGEND_HEIGHT);
  });

  it("uses five visible dates on each side of today for an empty chart", () => {
    const emptyDocument: ChartDocument = { ...document, tasks: [] };
    const layout = calculateChartLayout(emptyDocument, "2026-08-04");
    expect(layout.visibleDates).toEqual([
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-03", "2026-08-04",
      "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11", "2026-08-12",
    ]);
  });

  it("honors Saturday and Sunday visibility independently", () => {
    const saturdayDocument: ChartDocument = {
      ...document,
      settings: { showSaturday: true, showSunday: false },
      tasks: [{ ...document.tasks[0], startDate: "2026-08-07", endDate: "2026-08-10" }],
    };
    const layout = calculateChartLayout(saturdayDocument, "2026-08-04");
    expect(layout.visibleDates).toContain("2026-08-08");
    expect(layout.visibleDates).not.toContain("2026-08-09");
    expect(layout.tasks[0].width).toBe(DAY_WIDTH * 3);

    const sundayDocument: ChartDocument = {
      ...saturdayDocument,
      settings: { showSaturday: false, showSunday: true },
    };
    const sundayLayout = calculateChartLayout(sundayDocument, "2026-08-04");
    expect(sundayLayout.visibleDates).not.toContain("2026-08-08");
    expect(sundayLayout.visibleDates).toContain("2026-08-09");
    expect(sundayLayout.tasks[0].width).toBe(DAY_WIDTH * 3);
  });

  it("keeps the first task color for each category in legend order", () => {
    const legendDocument: ChartDocument = {
      ...document,
      tasks: [
        { ...document.tasks[0], category: "Build", color: "#00b95a" },
        { ...document.tasks[1], category: "Review", color: "#f59e0b" },
        { ...document.tasks[0], id: "another-build", category: "Build", color: "#8757ed" },
      ],
    };
    expect(calculateChartLayout(legendDocument, "2026-08-04").legend).toEqual([
      { category: "Build", color: "#00b95a" },
      { category: "Review", color: "#f59e0b" },
    ]);
  });
});
