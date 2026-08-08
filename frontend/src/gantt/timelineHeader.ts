import { addCalendarDays, addCalendarMonths, calendarDayDifference } from "@/gantt/dateMath";
import type { IsoDate, TimelineRange } from "@/gantt/model";
import { estimateTextWidth } from "@/gantt/textMetrics";

export type TimelineHeaderTier = "detailed-days" | "compact-days" | "month-days" | "month-weeks";

export interface TimelineHeaderBand { key: string; label: string; startIndex: number; endIndex: number; }
export interface TimelineHeaderLabel { key: string; label: string; secondaryLabel?: string; position: number; }
export interface TimelineHeaderModel {
  tier: TimelineHeaderTier;
  bands: TimelineHeaderBand[];
  weekBands: TimelineHeaderBand[];
  weekBoundaryIndices: number[];
  labels: TimelineHeaderLabel[];
  gridLines: number[];
}
export interface BuildTimelineHeaderOptions { range: TimelineRange; visibleDates: IsoDate[]; dayWidth: number; fontSize: number; }

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthDayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const shortMonthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthYearFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const BAND_LABEL_GAP = 8;

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

function fittingBandLabel(fullLabel: string, conciseLabel: string, width: number, fontSize: number): string {
  if (estimateTextWidth(fullLabel, fontSize, 600) + BAND_LABEL_GAP <= width) return fullLabel;
  if (estimateTextWidth(conciseLabel, fontSize, 600) + BAND_LABEL_GAP <= width) return conciseLabel;
  return "";
}

function buildMonthBands(range: TimelineRange, visibleDates: IsoDate[], dayWidth: number, fontSize: number): TimelineHeaderBand[] {
  const crossesYear = range.startDate.slice(0, 4) !== range.endDate.slice(0, 4);
  const bands: TimelineHeaderBand[] = [];
  let startIndex = 0;
  while (startIndex < visibleDates.length) {
    const key = visibleDates[startIndex].slice(0, 7);
    let endIndex = startIndex + 1;
    while (endIndex < visibleDates.length && visibleDates[endIndex].slice(0, 7) === key) endIndex += 1;
    const date = dateAtMidnight(visibleDates[startIndex]);
    const fullLabel = (crossesYear ? monthYearFormatter : monthFormatter).format(date);
    const conciseLabel = crossesYear
      ? `${Number(key.slice(5, 7))}/${key.slice(2, 4)}`
      : shortMonthFormatter.format(date);
    bands.push({
      key,
      label: fittingBandLabel(fullLabel, conciseLabel, (endIndex - startIndex) * dayWidth, fontSize),
      startIndex,
      endIndex,
    });
    startIndex = endIndex;
  }
  return bands;
}

/** ISO date of the Monday of the calendar week containing `date` (UTC). */
function mondayWeekKey(date: IsoDate): string {
  const day = dateAtMidnight(date);
  const weekday = day.getUTCDay(); // 0 Sun … 6 Sat
  const daysFromMonday = (weekday + 6) % 7;
  return addCalendarDays(date, -daysFromMonday);
}

function formatWeekOfLabel(first: IsoDate, last: IsoDate): string {
  const left = monthDayFormatter.format(dateAtMidnight(first));
  const right = monthDayFormatter.format(dateAtMidnight(last));
  if (first === last) return `Week of ${left}`;
  return `Week of ${left} – ${right}`;
}

function formatConciseWeekRange(first: IsoDate, last: IsoDate): string {
  if (first === last) return monthDayFormatter.format(dateAtMidnight(first));
  return `${monthDayFormatter.format(dateAtMidnight(first))} – ${monthDayFormatter.format(dateAtMidnight(last))}`;
}

function buildWeekBands(visibleDates: IsoDate[], dayWidth: number, fontSize: number): TimelineHeaderBand[] {
  if (visibleDates.length === 0) return [];
  const bands: TimelineHeaderBand[] = [];
  let startIndex = 0;
  let ordinal = 1;
  while (startIndex < visibleDates.length) {
    const key = mondayWeekKey(visibleDates[startIndex]);
    let endIndex = startIndex + 1;
    while (endIndex < visibleDates.length && mondayWeekKey(visibleDates[endIndex]) === key) {
      endIndex += 1;
    }
    const first = visibleDates[startIndex];
    const last = visibleDates[endIndex - 1];
    const width = (endIndex - startIndex) * dayWidth;
    const full = formatWeekOfLabel(first, last);
    const concise = formatConciseWeekRange(first, last);
    const ultra = `W${ordinal}`;
    let label = "";
    if (estimateTextWidth(full, fontSize, 600) + BAND_LABEL_GAP <= width) label = full;
    else if (estimateTextWidth(concise, fontSize, 600) + BAND_LABEL_GAP <= width) label = concise;
    else if (estimateTextWidth(ultra, fontSize, 600) + BAND_LABEL_GAP <= width) label = ultra;
    bands.push({ key: `week-${key}`, label, startIndex, endIndex });
    startIndex = endIndex;
    ordinal += 1;
  }
  return bands;
}

function weekBoundaryIndicesFromBands(weekBands: TimelineHeaderBand[]): number[] {
  return [...new Set(weekBands.map((band) => band.startIndex).filter((index) => index > 0))].sort(
    (a, b) => a - b,
  );
}

function sortedGridLines(lines: number[], count: number): number[] {
  return [...new Set([0, count, ...lines])].sort((left, right) => left - right);
}

export function buildTimelineHeader({ range, visibleDates, dayWidth, fontSize }: BuildTimelineHeaderOptions): TimelineHeaderModel {
  const tier = chooseTimelineHeaderTier(range);
  const dateGridLines = Array.from({ length: visibleDates.length + 1 }, (_, index) => index);
  const monthBands = buildMonthBands(range, visibleDates, dayWidth, fontSize);
  const monthGridLines = monthBands.flatMap((band) => [band.startIndex, band.endIndex]);

  if (tier === "detailed-days") {
    const labels = thinLabels(visibleDates.map((date, index) => ({ key: date, label: weekdayFormatter.format(dateAtMidnight(date)), secondaryLabel: monthDayFormatter.format(dateAtMidnight(date)), position: index + 0.5 })), dayWidth, fontSize);
    return {
      tier,
      bands: [],
      weekBands: [],
      weekBoundaryIndices: [],
      labels,
      gridLines: sortedGridLines(dateGridLines, visibleDates.length),
    };
  }

  const weekBands = buildWeekBands(visibleDates, dayWidth, fontSize);
  const weekBoundaryIndices = weekBoundaryIndicesFromBands(weekBands);
  const weekGridLines = weekBands.flatMap((band) => [band.startIndex, band.endIndex]);

  if (tier === "compact-days") {
    const labels = thinLabels(visibleDates.map((date, index) => ({ key: date, label: `${date.slice(5, 7)}/${date.slice(8, 10)}`, position: index + 0.5 })), dayWidth, fontSize);
    return {
      tier,
      bands: [],
      weekBands,
      weekBoundaryIndices,
      labels,
      gridLines: sortedGridLines([...dateGridLines, ...weekGridLines], visibleDates.length),
    };
  }

  if (tier === "month-days") {
    const labels = thinLabels(visibleDates.map((date, index) => ({ key: date, label: String(Number(date.slice(8, 10))), position: index + 0.5 })), dayWidth, fontSize);
    return {
      tier,
      bands: monthBands,
      weekBands,
      weekBoundaryIndices,
      labels,
      gridLines: sortedGridLines([...dateGridLines, ...monthGridLines, ...weekGridLines], visibleDates.length),
    };
  }

  // month-weeks: week identity lives in weekBands; no day-style labels
  return {
    tier,
    bands: monthBands,
    weekBands,
    weekBoundaryIndices,
    labels: [],
    gridLines: sortedGridLines([...monthGridLines, ...weekGridLines], visibleDates.length),
  };
}
