import { addVisibleDays, visibleDatesBetween } from "@/gantt/dateMath";
import type { ChartDocument, GanttTask, IsoDate } from "@/gantt/model";

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
  headerHeight: number;
  rowHeight: number;
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
    { start: document.tasks[0].startDate, end: document.tasks[0].endDate },
  );
}

export function calculateChartLayout(document: ChartDocument, today: IsoDate): ChartLayout {
  const range = chartDateRange(document, today);
  const start = addVisibleDays(range.start, -1, document.settings);
  const end = addVisibleDays(range.end, 1, document.settings);
  const visibleDates = visibleDatesBetween(start, end, document.settings);

  const tasks = document.tasks.map((task, index): TaskGeometry => {
    const includedDates = visibleDatesBetween(task.startDate, task.endDate, document.settings);
    const y = HEADER_HEIGHT + index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;

    if (includedDates.length > 0) {
      const firstIndex = visibleDates.indexOf(includedDates[0]);
      const lastIndex = visibleDates.indexOf(includedDates.at(-1)!);
      return {
        id: task.id,
        task,
        x: LABEL_WIDTH + firstIndex * DAY_WIDTH,
        y,
        width: (lastIndex - firstIndex + 1) * DAY_WIDTH,
        height: BAR_HEIGHT,
        isMarker: false,
      };
    }

    const nextDateIndex = visibleDates.findIndex((date) => date > task.endDate);
    const seamIndex = nextDateIndex === -1 ? visibleDates.length : nextDateIndex;
    return {
      id: task.id,
      task,
      x: LABEL_WIDTH + seamIndex * DAY_WIDTH - MIN_MARKER_WIDTH / 2,
      y,
      width: MIN_MARKER_WIDTH,
      height: BAR_HEIGHT,
      isMarker: true,
    };
  });

  const categories = new Set<string>();
  const legend = document.tasks.flatMap((task) => {
    if (categories.has(task.category)) return [];
    categories.add(task.category);
    return [{ category: task.category, color: task.color }];
  });

  return {
    visibleDates,
    tasks,
    legend,
    width: LABEL_WIDTH + visibleDates.length * DAY_WIDTH,
    height: HEADER_HEIGHT + document.tasks.length * ROW_HEIGHT + LEGEND_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    rowHeight: ROW_HEIGHT,
  };
}
