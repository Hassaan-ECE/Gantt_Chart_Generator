import { describe, expect, it } from "vitest";

import { visibleDatesBetween } from "@/gantt/dateMath";
import { buildTimelineHeader, chooseTimelineHeaderTier } from "@/gantt/timelineHeader";

const weekdays = { showSaturday: false, showSunday: false };

describe("timeline headers", () => {
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
});
