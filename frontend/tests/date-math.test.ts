import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  addVisibleDays,
  calendarDayDifference,
  isVisibleDate,
  nearestVisibleDate,
  visibleDatesBetween,
} from "@/gantt/dateMath";

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

  it("calculates calendar-day differences independently of visible days", () => {
    expect(calendarDayDifference("2026-08-07", "2026-08-10")).toBe(3);
  });

  it("identifies weekend dates according to their individual visibility settings", () => {
    expect(isVisibleDate("2026-08-08", { showSaturday: false, showSunday: true })).toBe(false);
    expect(isVisibleDate("2026-08-09", { showSaturday: false, showSunday: true })).toBe(true);
  });

  it("finds the nearest visible date in the requested direction", () => {
    expect(nearestVisibleDate("2026-08-08", 1, { showSaturday: false, showSunday: false }))
      .toBe("2026-08-10");
    expect(nearestVisibleDate("2026-08-09", -1, { showSaturday: false, showSunday: false }))
      .toBe("2026-08-07");
  });
});
