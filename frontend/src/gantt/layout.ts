import { addVisibleDays, visibleDatesBetween } from "@/gantt/dateMath";
import type { ChartDocument, GanttTask, IsoDate } from "@/gantt/model";
import { estimateTextWidth } from "@/gantt/textMetrics";

export { estimateTextWidth } from "@/gantt/textMetrics";

export const LABEL_WIDTH = 520;
export const DAY_WIDTH = 148;
export const HEADER_HEIGHT = 64;
export const ROW_HEIGHT = 44;
export const BAR_HEIGHT = 30;
export const LEGEND_HEIGHT = 56;
export const MIN_MARKER_WIDTH = 10;

export interface TaskGeometry {
  id: string;
  task: GanttTask;
  x: number;
  y: number;
  width: number;
  height: number;
  isMarker: boolean;
}

export interface LegendItem {
  category: string;
  color: string;
}

export interface ChartLayout {
  visibleDates: IsoDate[];
  tasks: TaskGeometry[];
  legend: LegendItem[];
  width: number;
  height: number;
  metrics: ChartMetrics;
  headerHeight: number;
  rowHeight: number;
}

export interface ChartViewport {
  width: number;
  height: number;
}

export interface ChartMetrics {
  labelWidth: number;
  dayWidth: number;
  headerHeight: number;
  rowHeight: number;
  barHeight: number;
  legendHeight: number;
  titleFontSize: number;
  dateFontSize: number;
  taskFontSize: number;
  taskLabelLines: number;
  legendFontSize: number;
  legendSwatchSize: number;
  legendGap: number;
  markerWidth: number;
  handleWidth: number;
  hitSlop: number;
  padding: number;
  legendSlotWidth: number;
}

function positive(value: number): number {
  return Math.max(0.01, value);
}

function calculateMetrics(
  document: ChartDocument,
  visibleDateCount: number,
  legendCount: number,
  viewport: ChartViewport,
): ChartMetrics {
  const width = positive(viewport.width);
  const height = positive(viewport.height);
  const taskSlots = Math.max(1, document.tasks.length);
  const naturalHeight = HEADER_HEIGHT + taskSlots * ROW_HEIGHT + (legendCount > 0 ? LEGEND_HEIGHT : 0);
  const horizontalScale = Math.min(1, width / (LABEL_WIDTH + visibleDateCount * DAY_WIDTH));
  const verticalScale = Math.min(1, height / naturalHeight);
  const padding = positive(Math.min(20, width * 0.018));
  const labelWidth = positive(Math.min(width * 0.5, LABEL_WIDTH * Math.max(horizontalScale, 0.3)));
  const dayWidth = positive((width - labelWidth) / Math.max(1, visibleDateCount));
  const headerHeight = positive(HEADER_HEIGHT * verticalScale);
  const legendHeight = legendCount === 0 ? 0 : positive(LEGEND_HEIGHT * verticalScale);
  const rowHeight = positive((height - headerHeight - legendHeight) / taskSlots);
  const barHeight = positive(Math.min(BAR_HEIGHT, rowHeight * 0.64));
  const taskLabelLines = rowHeight >= 36 ? 2 : 1;
  const legendSlotWidth = positive((width - padding * 2) / Math.max(1, legendCount));
  const legendSwatchSize = positive(Math.min(12, legendHeight * 0.28, legendSlotWidth * 0.16));
  const legendGap = positive(Math.min(8, legendSlotWidth * 0.08));
  const fittedFontSize = (
    maximum: number,
    available: number,
    text: string,
    fontWeight = 400,
    lineCount = 1,
  ) => positive(Math.min(
    maximum,
    (positive(available) * lineCount) / Math.max(0.01, estimateTextWidth(text, 1, fontWeight)),
  ));
  const widestTaskName = document.tasks.reduce(
    (widest, task) => estimateTextWidth(task.name, 1, 700) > estimateTextWidth(widest, 1, 700) ? task.name : widest,
    "",
  );
  const widestCategory = document.tasks.reduce(
    (widest, task) => estimateTextWidth(task.category, 1, 600) > estimateTextWidth(widest, 1, 600) ? task.category : widest,
    "",
  );

  return {
    labelWidth,
    dayWidth,
    headerHeight,
    rowHeight,
    barHeight,
    legendHeight,
    titleFontSize: fittedFontSize(
      Math.min(18, headerHeight * 0.34, 18 * verticalScale),
      labelWidth - padding * 2,
      document.title,
      700,
    ),
    dateFontSize: fittedFontSize(
      Math.min(12, headerHeight * 0.25, 12 * verticalScale),
      dayWidth,
      "Sep 30",
      500,
    ),
    taskFontSize: fittedFontSize(
      Math.min(14, rowHeight * 0.42, 14 * verticalScale),
      labelWidth - padding * 2,
      widestTaskName,
      700,
      taskLabelLines,
    ),
    taskLabelLines,
    legendFontSize: fittedFontSize(
      Math.min(11, legendHeight * 0.28, 11 * verticalScale),
      legendSlotWidth - legendSwatchSize - legendGap,
      widestCategory,
      600,
    ),
    legendSwatchSize,
    legendGap,
    markerWidth: positive(Math.min(MIN_MARKER_WIDTH, dayWidth * 0.2)),
    handleWidth: positive(Math.min(10, dayWidth * 0.18, barHeight * 0.4)),
    hitSlop: positive(Math.min(8, rowHeight * 0.18)),
    padding,
    legendSlotWidth,
  };
}

function chartDateRange(document: ChartDocument, today: IsoDate): { start: IsoDate; end: IsoDate } {
  if (document.tasks.length === 0) {
    return {
      start: addVisibleDays(today, -5, document.settings),
      end: addVisibleDays(today, 5, document.settings),
    };
  }

  return document.tasks.reduce(
    (range, task) => ({
      start: task.startDate < range.start ? task.startDate : range.start,
      end: task.endDate > range.end ? task.endDate : range.end,
    }),
    { start: today, end: today },
  );
}

export function calculateChartLayout(
  document: ChartDocument,
  today: IsoDate,
  viewport?: ChartViewport,
): ChartLayout {
  const range = chartDateRange(document, today);
  const start = addVisibleDays(range.start, -1, document.settings);
  const end = addVisibleDays(range.end, 1, document.settings);
  const visibleDates = visibleDatesBetween(start, end, document.settings);

  const categories = new Set<string>();
  const legend = document.tasks.flatMap((task) => {
    if (categories.has(task.category)) return [];
    categories.add(task.category);
    return [{ category: task.category, color: task.color }];
  });

  const naturalViewport = {
    width: LABEL_WIDTH + visibleDates.length * DAY_WIDTH,
    height: HEADER_HEIGHT + Math.max(1, document.tasks.length) * ROW_HEIGHT + LEGEND_HEIGHT,
  };
  const target = viewport ?? naturalViewport;
  const metrics = calculateMetrics(document, visibleDates.length, legend.length, target);

  const tasks = document.tasks.map((task, index): TaskGeometry => {
    const includedDates = visibleDatesBetween(task.startDate, task.endDate, document.settings);
    const y = metrics.headerHeight + index * metrics.rowHeight + (metrics.rowHeight - metrics.barHeight) / 2;

    if (includedDates.length > 0) {
      const firstIndex = visibleDates.indexOf(includedDates[0]);
      const lastIndex = visibleDates.indexOf(includedDates.at(-1)!);
      return {
        id: task.id,
        task,
        x: metrics.labelWidth + firstIndex * metrics.dayWidth,
        y,
        width: (lastIndex - firstIndex + 1) * metrics.dayWidth,
        height: metrics.barHeight,
        isMarker: false,
      };
    }

    const nextDateIndex = visibleDates.findIndex((date) => date > task.endDate);
    const seamIndex = nextDateIndex === -1 ? visibleDates.length : nextDateIndex;
    return {
      id: task.id,
      task,
      x: metrics.labelWidth + seamIndex * metrics.dayWidth - metrics.markerWidth / 2,
      y,
      width: metrics.markerWidth,
      height: metrics.barHeight,
      isMarker: true,
    };
  });

  return {
    visibleDates,
    tasks,
    legend,
    width: target.width,
    height: target.height,
    metrics,
    headerHeight: metrics.headerHeight,
    rowHeight: metrics.rowHeight,
  };
}
