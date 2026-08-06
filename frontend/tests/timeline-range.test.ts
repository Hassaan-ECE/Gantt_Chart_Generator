import { describe, expect, it } from "vitest";

import { addCalendarMonths } from "@/gantt/dateMath";
import { createStarterChart } from "@/gantt/starterChart";
import {
  deriveAutoTimelineRange,
  formatTimelineRangeSummary,
  rangeContainsDate,
  resolveTimelineRange,
  visibleDatesForTimelineRange,
} from "@/gantt/timelineRange";

describe("timeline range", () => {
  it("clamps calendar-month addition to the target month", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addCalendarMonths("2026-01-31", -1)).toBe("2025-12-31");
    expect(addCalendarMonths("2026-01-31", 13)).toBe("2027-02-28");
  });

  it("uses a custom range exactly without padding it", () => {
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate: "2026-08-01", endDate: "2026-08-28" };
    const range = resolveTimelineRange(chart, "2026-08-04");
    expect(range).toEqual(chart.settings.timelineRange);
    expect(range).not.toBe(chart.settings.timelineRange);
    range.startDate = "2026-08-02";
    expect(chart.settings.timelineRange).toEqual({ startDate: "2026-08-01", endDate: "2026-08-28" });
  });

  it("keeps the existing auto-fit behavior when no custom range exists", () => {
    const chart = createStarterChart("2026-08-04");
    const range = resolveTimelineRange(chart, "2026-08-04");
    expect(range.startDate).toBe("2026-08-03");
    expect(range.endDate).toBe("2026-08-12");
  });

  it("keeps five visible days on each side of today for an empty chart", () => {
    const chart = createStarterChart("2026-08-04");
    chart.tasks = [];
    expect(deriveAutoTimelineRange(chart, "2026-08-04")).toEqual({
      startDate: "2026-07-27",
      endDate: "2026-08-12",
    });
  });

  it("keeps today inside the auto-fit range when all tasks are in the future", () => {
    const chart = createStarterChart("2026-08-04");
    chart.tasks = chart.tasks.map((task, index) => ({
      ...task,
      startDate: `2026-10-${String(index + 5).padStart(2, "0")}`,
      endDate: `2026-10-${String(index + 6).padStart(2, "0")}`,
    }));
    expect(deriveAutoTimelineRange(chart, "2026-08-04")).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-10-12",
    });
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
});
