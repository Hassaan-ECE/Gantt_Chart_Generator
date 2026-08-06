import { addVisibleDays, visibleDatesBetween } from "@/gantt/dateMath";
import type { ChartDocument, ChartSettings, IsoDate, TimelineRange } from "@/gantt/model";

export function deriveAutoTimelineRange(document: ChartDocument, today: IsoDate): TimelineRange {
  const taskRange = document.tasks.length === 0
    ? {
      startDate: addVisibleDays(today, -5, document.settings),
      endDate: addVisibleDays(today, 5, document.settings),
    }
    : document.tasks.reduce(
      (range, task) => ({
        startDate: task.startDate < range.startDate ? task.startDate : range.startDate,
        endDate: task.endDate > range.endDate ? task.endDate : range.endDate,
      }),
      { startDate: today, endDate: today },
    );

  return {
    startDate: addVisibleDays(taskRange.startDate, -1, document.settings),
    endDate: addVisibleDays(taskRange.endDate, 1, document.settings),
  };
}

export function resolveTimelineRange(document: ChartDocument, today: IsoDate): TimelineRange {
  return document.settings.timelineRange
    ? { ...document.settings.timelineRange }
    : deriveAutoTimelineRange(document, today);
}

export function visibleDatesForTimelineRange(range: TimelineRange, settings: ChartSettings): IsoDate[] {
  const dates = visibleDatesBetween(range.startDate, range.endDate, settings);
  return dates.length > 0 ? dates : [range.startDate];
}

export function rangeContainsDate(range: TimelineRange, date: IsoDate): boolean {
  return range.startDate <= date && date <= range.endDate;
}

const rangeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatTimelineRangeSummary(range: TimelineRange): string {
  return `${rangeFormatter.format(new Date(`${range.startDate}T00:00:00Z`))} – ${rangeFormatter.format(new Date(`${range.endDate}T00:00:00Z`))}`;
}
