import { forwardRef } from "react";

import { currentLocalIsoDate } from "@/gantt/starterChart";
import { calculateChartLayout, type ChartViewport } from "@/gantt/layout";
import type { ChartDocument, GanttTask, IsoDate } from "@/gantt/model";
import { TaskBar } from "@/gantt/TaskBar";

export interface GanttChartProps {
  document: ChartDocument;
  mode: "editor" | "export";
  selectedTaskId: string | null;
  viewport?: ChartViewport;
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

export const GanttChart = forwardRef<SVGSVGElement, GanttChartProps>(function GanttChart(props, ref) {
  const document = withPreview(props.document, props.previewTask);
  const today = currentLocalIsoDate();
  const layout = calculateChartLayout(document, today, props.viewport);
  const { metrics } = layout;
  const gridBottom = metrics.headerHeight + document.tasks.length * metrics.rowHeight;
  const todayIndex = layout.visibleDates.indexOf(today);

  return (
    <svg
      ref={ref}
      className="gantt-chart"
      role="img"
      aria-label={`${document.title} Gantt chart`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
    >
      <rect data-export-background="true" width={layout.width} height={layout.height} fill="#ffffff" />
      <text className="gantt-chart-title" x={metrics.padding} y={metrics.headerHeight * 0.42} style={{ fontSize: metrics.titleFontSize }}>{document.title}</text>
      <text className="gantt-chart-label" x={metrics.padding} y={metrics.headerHeight * 0.8} style={{ fontSize: metrics.dateFontSize }}>Task</text>
      {layout.visibleDates.map((date, index) => {
        const x = metrics.labelWidth + index * metrics.dayWidth;
        const weekday = formatWeekday(date);
        return (
          <g key={date}>
            <line className="gantt-grid-line" x1={x} y1={0} x2={x} y2={gridBottom} />
            <text className="gantt-date-weekday" x={x + metrics.dayWidth / 2} y={metrics.headerHeight * 0.42} style={{ fontSize: metrics.dateFontSize }}>{weekday}</text>
            <text className="gantt-date-value" x={x + metrics.dayWidth / 2} y={metrics.headerHeight * 0.78} style={{ fontSize: metrics.dateFontSize }}>{formatDate(date)}</text>
          </g>
        );
      })}
      <line className="gantt-grid-line" x1={layout.width} y1={0} x2={layout.width} y2={gridBottom} />
      <line className="gantt-grid-line" x1={0} y1={metrics.headerHeight} x2={layout.width} y2={metrics.headerHeight} />
      {layout.tasks.map((geometry, index) => (
        <g key={geometry.id} data-testid="task-row">
          <line
            className="gantt-grid-line"
            x1={0}
            y1={metrics.headerHeight + (index + 1) * metrics.rowHeight}
            x2={layout.width}
            y2={metrics.headerHeight + (index + 1) * metrics.rowHeight}
          />
          <text className="gantt-task-name" x={metrics.padding} y={geometry.y + metrics.barHeight / 2} style={{ fontSize: metrics.taskFontSize }}>{geometry.task.name}</text>
          <TaskBar
            geometry={geometry}
            mode={props.mode}
            selected={props.selectedTaskId === geometry.id}
            settings={document.settings}
            dayWidth={metrics.dayWidth}
            handleWidth={metrics.handleWidth}
            hitSlop={metrics.hitSlop}
            onSelectTask={props.onSelectTask}
            onEditTask={props.onEditTask}
            onPreviewTask={props.onPreviewTask}
            onCommitTask={props.onCommitTask}
          />
        </g>
      ))}
      <g className="gantt-legend" transform={`translate(${metrics.padding} ${gridBottom + metrics.legendHeight / 2})`}>
        {layout.legend.map((item, index) => {
          const x = index * metrics.legendSlotWidth;
          return (
            <g key={item.category} transform={`translate(${x} 0)`}>
              <rect x={0} y={-metrics.legendSwatchSize / 2} width={metrics.legendSwatchSize} height={metrics.legendSwatchSize} rx={Math.min(3, metrics.legendSwatchSize / 4)} fill={item.color} />
              <text className="gantt-legend-label" x={metrics.legendSwatchSize + metrics.legendGap} y={0} style={{ fontSize: metrics.legendFontSize }}>{item.category}</text>
            </g>
          );
        })}
      </g>
      {todayIndex >= 0 && (
        <g className="gantt-today" pointerEvents="none">
          <line
            className="gantt-today-marker"
            x1={metrics.labelWidth + todayIndex * metrics.dayWidth + metrics.dayWidth / 2}
            y1={metrics.headerHeight}
            x2={metrics.labelWidth + todayIndex * metrics.dayWidth + metrics.dayWidth / 2}
            y2={gridBottom}
          />
        </g>
      )}
    </svg>
  );
});
