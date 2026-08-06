import { describe, expect, it } from "vitest";

import {
  calculateChartLayout,
  DAY_WIDTH,
  estimateTextWidth,
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
  it("uses a saved range exactly and hides today outside its calendar bounds", () => {
    const rangeDocument: ChartDocument = {
      ...document,
      settings: {
        ...document.settings,
        timelineRange: { startDate: "2026-09-01", endDate: "2026-09-14" },
      },
    };

    const layout = calculateChartLayout(rangeDocument, "2026-08-04");

    expect(layout.range).toEqual({ startDate: "2026-09-01", endDate: "2026-09-14" });
    expect(layout.visibleDates.at(0)).toBe("2026-09-01");
    expect(layout.visibleDates.at(-1)).toBe("2026-09-14");
    expect(layout.header.tier).toBe("detailed-days");
    expect(layout.todayX).toBeNull();
  });

  it("keeps today in an auto-fitted layout and positions its marker", () => {
    const layout = calculateChartLayout(document, "2026-08-04");

    expect(layout.range.startDate).toBe("2026-08-03");
    expect(layout.range.endDate).toBe("2026-08-11");
    expect(layout.todayX).toBe(LABEL_WIDTH + DAY_WIDTH * 1.5);
  });

  it("clips task geometry to a custom weekday range while retaining every row", () => {
    const clippedDocument: ChartDocument = {
      ...document,
      settings: { ...document.settings, timelineRange: { startDate: "2026-08-05", endDate: "2026-08-10" } },
      tasks: [
        { ...document.tasks[0], id: "before", startDate: "2026-08-01", endDate: "2026-08-04" },
        { ...document.tasks[0], id: "left", startDate: "2026-08-03", endDate: "2026-08-06" },
        { ...document.tasks[0], id: "right", startDate: "2026-08-07", endDate: "2026-08-12" },
        { ...document.tasks[0], id: "both", startDate: "2026-08-03", endDate: "2026-08-12" },
      ],
    };

    const layout = calculateChartLayout(clippedDocument, "2026-08-04");
    const byId = (id: string) => layout.tasks.find((task) => task.id === id)!;

    expect(layout.visibleDates).toEqual(["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10"]);
    expect(byId("before")).toMatchObject({ x: LABEL_WIDTH, width: 0, isVisible: false, startClipped: true, endClipped: false });
    expect(byId("left")).toMatchObject({ x: LABEL_WIDTH, width: DAY_WIDTH * 2, isVisible: true, startClipped: true, endClipped: false });
    expect(byId("right")).toMatchObject({ x: LABEL_WIDTH + DAY_WIDTH * 2, width: DAY_WIDTH * 2, isVisible: true, startClipped: false, endClipped: true });
    expect(byId("both")).toMatchObject({ x: LABEL_WIDTH, width: DAY_WIDTH * 4, isVisible: true, startClipped: true, endClipped: true });
  });

  it("uses compact rows for a short chart without stretching toward the legend", () => {
    const layout = calculateChartLayout(document, "2026-08-04", { width: 1200, height: 640 });

    expect(layout.rowHeight).toBeLessThanOrEqual(ROW_HEIGHT);
    expect(layout.tasks[1].y - layout.tasks[0].y).toBe(layout.rowHeight);
    expect(layout.tasks.at(-1)!.y + layout.tasks.at(-1)!.height).toBeLessThanOrEqual(
      layout.height - layout.metrics.legendHeight,
    );
  });

  it("shrinks forty rows below the preferred height to fit above the legend", () => {
    const denseDocument: ChartDocument = {
      ...document,
      settings: { ...document.settings, timelineRange: { startDate: "2026-08-03", endDate: "2026-08-14" } },
      tasks: Array.from({ length: 40 }, (_, index) => ({
        ...document.tasks[0], id: `dense-${index}`,
      })),
    };

    const layout = calculateChartLayout(denseDocument, "2026-08-04", { width: 900, height: 500 });

    expect(layout.rowHeight).toBeLessThan(ROW_HEIGHT);
    expect(layout.tasks.at(-1)!.y + layout.tasks.at(-1)!.height).toBeLessThanOrEqual(
      layout.height - layout.metrics.legendHeight,
    );
  });

  it("fits every chart region into the requested viewport", () => {
    const viewport = { width: 1048, height: 586 };
    const layout = calculateChartLayout(document, "2026-08-04", viewport);

    expect(layout.width).toBe(1048);
    expect(layout.height).toBe(586);
    expect(layout.metrics.dayWidth).toBeGreaterThan(0);
    expect(layout.metrics.rowHeight).toBeGreaterThan(0);
    expect(layout.metrics.barHeight).toBeLessThanOrEqual(layout.metrics.rowHeight);
    expect(layout.metrics.taskFontSize).toBeGreaterThan(0);
    expect(Math.max(...layout.tasks.map((task) => task.y + task.height))).toBeLessThanOrEqual(
      layout.metrics.headerHeight + document.tasks.length * layout.metrics.rowHeight,
    );
  });

  it("shrinks dense charts and their text instead of overflowing", () => {
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
    expect(estimateTextWidth(denseDocument.title, layout.metrics.titleFontSize, 700)).toBeLessThanOrEqual(
      layout.metrics.labelWidth - layout.metrics.padding * 2 + 0.001,
    );
    expect(estimateTextWidth(denseDocument.tasks[0].name, layout.metrics.taskFontSize, 700)).toBeLessThanOrEqual(
      layout.metrics.labelWidth - layout.metrics.padding * 2 + 0.001,
    );
    expect(
      estimateTextWidth(denseDocument.tasks[0].category, layout.metrics.legendFontSize, 600)
        + layout.metrics.legendSwatchSize
        + layout.metrics.legendGap,
    ).toBeLessThanOrEqual(layout.metrics.legendSlotWidth + 0.001);
  });

  it("compresses a hidden weekend inside a continuous bar", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.tasks.find((task) => task.id === "weekday")?.width).toBe(DAY_WIDTH * 2);
  });

  it("keeps a weekend-only task visible as a marker", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    const marker = layout.tasks.find((task) => task.id === "weekend");
    const nextVisibleIndex = layout.visibleDates.findIndex((date) => date > document.tasks[1].endDate);
    expect(marker?.width).toBe(MIN_MARKER_WIDTH);
    expect(marker?.x).toBe(LABEL_WIDTH + DAY_WIDTH * nextVisibleIndex - MIN_MARKER_WIDTH / 2);
  });

  it("grows vertically for every task and the legend", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.height).toBeGreaterThan(layout.headerHeight + document.tasks.length * layout.rowHeight);
  });

  it("pads the visible range and derives chart dimensions from it", () => {
    const layout = calculateChartLayout(document, "2026-08-04");
    expect(layout.visibleDates).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
    ]);
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

  it("keeps today inside the fitted range when every task is in the future", () => {
    const futureDocument: ChartDocument = {
      ...document,
      tasks: document.tasks.map((task, index) => ({
        ...task,
        startDate: `2026-10-${String(index + 5).padStart(2, "0")}`,
        endDate: `2026-10-${String(index + 6).padStart(2, "0")}`,
      })),
    };

    const layout = calculateChartLayout(futureDocument, "2026-08-04", { width: 720, height: 520 });

    expect(layout.visibleDates).toContain("2026-08-04");
    expect(layout.width).toBe(720);
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
