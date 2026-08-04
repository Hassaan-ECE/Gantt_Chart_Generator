import { currentLocalIsoDate } from "@/gantt/starterChart";
import {
  BAR_HEIGHT,
  DAY_WIDTH,
  HEADER_HEIGHT,
  LABEL_WIDTH,
  ROW_HEIGHT,
  calculateChartLayout,
} from "@/gantt/layout";
import type { ChartDocument, GanttTask, IsoDate } from "@/gantt/model";
import { TaskBar } from "@/gantt/TaskBar";

export interface GanttChartProps {
  document: ChartDocument;
  mode: "editor" | "export";
  selectedTaskId: string | null;
  previewTask?: GanttTask;
  onSelectTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onPreviewTask?: (task: GanttTask | null) => void;
  onCommitTask?: (task: GanttTask) => void;
}

function formatWeekday(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function formatDate(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function withPreview(document: ChartDocument, previewTask?: GanttTask): ChartDocument {
  if (!previewTask) return document;
  return {
    ...document,
    tasks: document.tasks.map((task) => (task.id === previewTask.id ? previewTask : task)),
  };
}

export function GanttChart(props: GanttChartProps) {
  const document = withPreview(props.document, props.previewTask);
  const today = currentLocalIsoDate();
  const layout = calculateChartLayout(document, today);
  const gridBottom = HEADER_HEIGHT + document.tasks.length * ROW_HEIGHT;
  const todayIndex = layout.visibleDates.indexOf(today);

  return (
    <svg
      className="gantt-chart"
      role="img"
      aria-label={`${document.title} Gantt chart`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
    >
      <rect width={layout.width} height={layout.height} fill="#ffffff" />
      <text className="gantt-chart-title" x={20} y={27}>{document.title}</text>
      <text className="gantt-chart-label" x={20} y={51}>Task</text>
      {layout.visibleDates.map((date, index) => {
        const x = LABEL_WIDTH + index * DAY_WIDTH;
        const weekday = formatWeekday(date);
        const repeatsWeekday = layout.visibleDates
          .slice(0, index)
          .some((previousDate) => formatWeekday(previousDate) === weekday);
        return (
          <g key={date}>
            <line className="gantt-grid-line" x1={x} y1={0} x2={x} y2={gridBottom} />
            <text className="gantt-date-weekday" x={x + DAY_WIDTH / 2} y={27}>{repeatsWeekday ? "" : weekday}</text>
            <text className="gantt-date-value" x={x + DAY_WIDTH / 2} y={51}>{formatDate(date)}</text>
          </g>
        );
      })}
      <line className="gantt-grid-line" x1={layout.width} y1={0} x2={layout.width} y2={gridBottom} />
      <line className="gantt-grid-line" x1={0} y1={HEADER_HEIGHT} x2={layout.width} y2={HEADER_HEIGHT} />
      {todayIndex >= 0 && (
        <line
          className="gantt-today-marker"
          x1={LABEL_WIDTH + todayIndex * DAY_WIDTH + DAY_WIDTH / 2}
          y1={HEADER_HEIGHT}
          x2={LABEL_WIDTH + todayIndex * DAY_WIDTH + DAY_WIDTH / 2}
          y2={gridBottom}
        />
      )}
      {layout.tasks.map((geometry, index) => (
        <g key={geometry.id} data-testid="task-row">
          <line
            className="gantt-grid-line"
            x1={0}
            y1={HEADER_HEIGHT + (index + 1) * ROW_HEIGHT}
            x2={layout.width}
            y2={HEADER_HEIGHT + (index + 1) * ROW_HEIGHT}
          />
          <text className="gantt-task-name" x={20} y={geometry.y + BAR_HEIGHT / 2}>{geometry.task.name}</text>
          <TaskBar
            geometry={geometry}
            mode={props.mode}
            selected={props.selectedTaskId === geometry.id}
            onSelectTask={props.onSelectTask}
            onEditTask={props.onEditTask}
          />
        </g>
      ))}
      <g className="gantt-legend" transform={`translate(20 ${gridBottom + 34})`}>
        {layout.legend.map((item, index) => {
          const x = index * 150;
          return (
            <g key={item.category} transform={`translate(${x} 0)`}>
              <rect x={0} y={-12} width={12} height={12} rx={3} fill={item.color} />
              <text className="gantt-legend-label" x={20} y={-2}>{item.category}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
