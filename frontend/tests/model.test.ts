import { describe, expect, it } from "vitest";

import { parseChartDocument } from "@/gantt/model";
import { createStarterChart, currentLocalIsoDate } from "@/gantt/starterChart";

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

  it("normalizes the document title", () => {
    const document = parseChartDocument({
      schemaVersion: 1,
      title: "  Execution Timeline  ",
      settings: { showSaturday: false, showSunday: false },
      tasks: [],
    });

    expect(document.title).toBe("Execution Timeline");
    expect(document.schemaVersion).toBe(1);
  });

  it("creates a deterministic editable starter chart on a visible date", () => {
    const chart = createStarterChart("2026-08-08");

    expect(chart.title).toBe("Execution Timeline");
    expect(chart.settings).toEqual({ showSaturday: false, showSunday: false });
    expect(chart.tasks).toHaveLength(5);
    expect(chart.tasks.map((task) => task.id)).toEqual([
      "starter-assembly",
      "starter-testing",
      "starter-feedback",
      "starter-inventory",
      "starter-quotes",
    ]);
    expect(chart.tasks[0].startDate).toBe("2026-08-10");
  });

  it("formats the local calendar date without persisting a Date object", () => {
    expect(currentLocalIsoDate(new Date(2026, 7, 4))).toBe("2026-08-04");
  });
});
