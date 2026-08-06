import { addCalendarMonths, calendarDayDifference } from "@/gantt/dateMath";
import type { IsoDate, TimelineRange } from "@/gantt/model";
import { estimateTextWidth } from "@/gantt/textMetrics";

export type TimelineHeaderTier = "detailed-days" | "compact-days" | "month-days" | "month-weeks";

export interface TimelineHeaderBand { key: string; label: string; startIndex: number; endIndex: number; }
export interface TimelineHeaderLabel { key: string; label: string; secondaryLabel?: string; position: number; }
export interface TimelineHeaderModel { tier: TimelineHeaderTier; bands: TimelineHeaderBand[]; labels: TimelineHeaderLabel[]; gridLines: number[]; }
export interface BuildTimelineHeaderOptions { range: TimelineRange; visibleDates: IsoDate[]; dayWidth: number; fontSize: number; }

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthDayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const monthYearFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function dateAtMidnight(date: IsoDate): Date { return new Date(`${date}T00:00:00Z`); }

export function chooseTimelineHeaderTier(range: TimelineRange): TimelineHeaderTier {
  const days = calendarDayDifference(range.startDate, range.endDate) + 1;
  if (days <= 14) return "detailed-days";
  if (days <= 28) return "compact-days";
  return range.endDate < addCalendarMonths(range.startDate, 6) ? "month-days" : "month-weeks";
}

function thinLabels(candidates: TimelineHeaderLabel[], dayWidth: number, fontSize: number): TimelineHeaderLabel[] {
  if (candidates.length < 2) return candidates;
  const maximumWidth = Math.max(...candidates.map((item) => Math.max(estimateTextWidth(item.label, fontSize, 600), estimateTextWidth(item.secondaryLabel ?? "", fontSize, 500))));
  const smallestGap = Math.min(...candidates.slice(1).map((item, index) => (item.position - candidates[index].position) * dayWidth));
  const stride = Math.max(1, Math.ceil((maximumWidth + 8) / Math.max(0.01, smallestGap)));
  const kept = candidates.filter((_, index) => index % stride === 0);
  const last = candidates.at(-1)!;
  const prior = kept.at(-1)!;
  if (prior.key !== last.key && (last.position - prior.position) * dayWidth >= maximumWidth + 8) kept.push(last);
  return kept;
}

function buildMonthBands(range: TimelineRange, visibleDates: IsoDate[]): TimelineHeaderBand[] {
  const crossesYear = range.startDate.slice(0, 4) !== range.endDate.slice(0, 4);
  const bands: TimelineHeaderBand[] = [];
  let startIndex = 0;
  while (startIndex < visibleDates.length) {
    const key = visibleDates[startIndex].slice(0, 7);
    let endIndex = startIndex + 1;
    while (endIndex < visibleDates.length && visibleDates[endIndex].slice(0, 7) === key) endIndex += 1;
    bands.push({ key, label: (crossesYear ? monthYearFormatter : monthFormatter).format(dateAtMidnight(visibleDates[startIndex])), startIndex, endIndex });
    startIndex = endIndex;
  }
  return bands;
}

function sortedGridLines(lines: number[], count: number): number[] {
  return [...new Set([0, count, ...lines])].sort((left, right) => left - right);
}

export function buildTimelineHeader({ range, visibleDates, dayWidth, fontSize }: BuildTimelineHeaderOptions): TimelineHeaderModel {
  const tier = chooseTimelineHeaderTier(range);
  const dateGridLines = Array.from({ length: visibleDates.length + 1 }, (_, index) => index);
  const monthBands = buildMonthBands(range, visibleDates);
  const monthGridLines = monthBands.flatMap((band) => [band.startIndex, band.endIndex]);
  if (tier === "detailed-days") {
    const labels = thinLabels(visibleDates.map((date, index) => ({ key: date, label: weekdayFormatter.format(dateAtMidnight(date)), secondaryLabel: monthDayFormatter.format(dateAtMidnight(date)), position: index + 0.5 })), dayWidth, fontSize);
    return { tier, bands: [], labels, gridLines: sortedGridLines(dateGridLines, visibleDates.length) };
  }
  if (tier === "compact-days") {
    const labels = thinLabels(visibleDates.map((date, index) => ({ key: date, label: `${date.slice(5, 7)}/${date.slice(8, 10)}`, position: index + 0.5 })), dayWidth, fontSize);
    return { tier, bands: [], labels, gridLines: sortedGridLines(dateGridLines, visibleDates.length) };
  }
  if (tier === "month-days") {
    const labels = thinLabels(visibleDates.map((date, index) => ({ key: date, label: String(Number(date.slice(8, 10))), position: index + 0.5 })), dayWidth, fontSize);
    return { tier, bands: monthBands, labels, gridLines: sortedGridLines([...dateGridLines, ...monthGridLines], visibleDates.length) };
  }
  const weeks = new Map<number, { startIndex: number; endIndex: number }>();
  visibleDates.forEach((date, index) => {
    const week = Math.floor(calendarDayDifference(range.startDate, date) / 7);
    const group = weeks.get(week);
    if (group) group.endIndex = index + 1;
    else weeks.set(week, { startIndex: index, endIndex: index + 1 });
  });
  const labels = thinLabels([...weeks.entries()].map(([week, group]) => ({ key: `week-${week + 1}`, label: `Week ${week + 1}`, position: (group.startIndex + group.endIndex) / 2 })), dayWidth, fontSize);
  const weekGridLines = [...weeks.values()].flatMap((group) => [group.startIndex, group.endIndex]);
  return { tier, bands: monthBands, labels, gridLines: sortedGridLines([...monthGridLines, ...weekGridLines], visibleDates.length) };
}
