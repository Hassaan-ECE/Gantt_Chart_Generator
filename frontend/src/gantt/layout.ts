import { visibleDatesBetween } from "@/gantt/dateMath";
import type { ChartDocument, GanttTask, IsoDate, TimelineRange } from "@/gantt/model";
import { estimateTextWidth } from "@/gantt/textMetrics";
import { buildTimelineHeader, type TimelineHeaderModel } from "@/gantt/timelineHeader";
import { rangeContainsDate, resolveTimelineRange, visibleDatesForTimelineRange } from "@/gantt/timelineRange";

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
  isVisible: boolean;
  startClipped: boolean;
  endClipped: boolean;
}

export interface LegendItem {
  category: string;
  color: string;
}

export interface ChartLayout {
  range: TimelineRange;
  visibleDates: IsoDate[];
  header: TimelineHeaderModel;
  todayX: number | null;
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
  const availableTaskHeight = positive(height - headerHeight - legendHeight);
  const preferredRowHeight = positive(ROW_HEIGHT * verticalScale);
  const rowHeight = positive(Math.min(preferredRowHeight, availableTaskHeight / taskSlots));
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
    dateFontSize: positive(Math.min(12, headerHeight * 0.25, 12 * verticalScale)),
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

export function calculateChartLayout(
  document: ChartDocument,
  today: IsoDate,
  viewport?: ChartViewport,
): ChartLayout {
  const range = resolveTimelineRange(document, today);
  const visibleDates = visibleDatesForTimelineRange(range, document.settings);

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
  const header = buildTimelineHeader({
    range,
    visibleDates,
    dayWidth: metrics.dayWidth,
    fontSize: metrics.dateFontSize,
  });
  const todayX = rangeContainsDate(range, today)
    ? (() => {
      const visibleIndex = visibleDates.indexOf(today);
      if (visibleIndex >= 0) return metrics.labelWidth + (visibleIndex + 0.5) * metrics.dayWidth;
      const seamIndex = visibleDates.findIndex((date) => date > today);
      return metrics.labelWidth + (seamIndex === -1 ? visibleDates.length : seamIndex) * metrics.dayWidth;
    })()
    : null;

  const tasks = document.tasks.map((task, index): TaskGeometry => {
    const y = metrics.headerHeight + index * metrics.rowHeight + (metrics.rowHeight - metrics.barHeight) / 2;
    const startClipped = task.startDate < range.startDate;
    const endClipped = task.endDate > range.endDate;
    const intersects = task.startDate <= range.endDate && task.endDate >= range.startDate;

    if (!intersects) {
      return {
        id: task.id,
        task,
        x: metrics.labelWidth,
        y,
        width: 0,
        height: metrics.barHeight,
        isMarker: false,
        isVisible: false,
        startClipped,
        endClipped,
      };
    }

    const clippedStart = startClipped ? range.startDate : task.startDate;
    const clippedEnd = endClipped ? range.endDate : task.endDate;
    const includedDates = visibleDatesBetween(clippedStart, clippedEnd, document.settings);

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
        isVisible: true,
        startClipped,
        endClipped,
      };
    }

    const nextDateIndex = visibleDates.findIndex((date) => date > clippedEnd);
    const seamIndex = nextDateIndex === -1 ? visibleDates.length : nextDateIndex;
    const timelineEnd = metrics.labelWidth + visibleDates.length * metrics.dayWidth;
    return {
      id: task.id,
      task,
      x: Math.min(
        timelineEnd - metrics.markerWidth,
        Math.max(metrics.labelWidth, metrics.labelWidth + seamIndex * metrics.dayWidth - metrics.markerWidth / 2),
      ),
      y,
      width: metrics.markerWidth,
      height: metrics.barHeight,
      isMarker: true,
      isVisible: true,
      startClipped,
      endClipped,
    };
  });

  return {
    range,
    visibleDates,
    header,
    todayX,
    tasks,
    legend,
    width: target.width,
    height: target.height,
    metrics,
    headerHeight: metrics.headerHeight,
    rowHeight: metrics.rowHeight,
  };
}
