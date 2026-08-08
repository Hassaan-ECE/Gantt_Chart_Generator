import { forwardRef } from "react";

import { currentLocalIsoDate } from "@/gantt/starterChart";
import { InlineChartTitle } from "@/gantt/InlineChartTitle";
import { InlineTaskName } from "@/gantt/InlineTaskName";
import { calculateChartLayout, estimateTextWidth, type ChartViewport } from "@/gantt/layout";
import type { ChartDocument, GanttTask, IsoDate } from "@/gantt/model";
import { TaskBar } from "@/gantt/TaskBar";

export interface GanttChartProps {
  document: ChartDocument;
  today?: IsoDate;
  mode: "editor" | "export";
  selectedTaskId: string | null;
  viewport?: ChartViewport;
  previewTask?: GanttTask;
  onSelectTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onPreviewTask?: (task: GanttTask | null) => void;
  onCommitTask?: (task: GanttTask) => void;
  onClearSelection?: () => void;
  onTitleCommit?: (title: string) => void;
}

function withPreview(document: ChartDocument, previewTask?: GanttTask): ChartDocument {
  if (!previewTask) return document;
  return {
    ...document,
    tasks: document.tasks.map((task) => (task.id === previewTask.id ? previewTask : task)),
  };
}

function balancedSplitIndex(text: string, targetWidth: number, maximumWidth: number, fontSize: number): number {
  let characterSplit = 1;
  while (
    characterSplit < text.length
    && estimateTextWidth(text.slice(0, characterSplit + 1), fontSize, 700) <= targetWidth
  ) {
    characterSplit += 1;
  }
  while (
    characterSplit > 1
    && estimateTextWidth(text.slice(0, characterSplit), fontSize, 700) > maximumWidth
  ) {
    characterSplit -= 1;
  }

  const whitespaceSplits = Array.from(text)
    .flatMap((character, index) => character === " " && index > 0 ? [index] : [])
    .filter((index) => estimateTextWidth(text.slice(0, index), fontSize, 700) <= maximumWidth);
  const closestWhitespace = whitespaceSplits.reduce<number | null>((closest, index) => {
    if (closest === null) return index;
    const currentDelta = Math.abs(estimateTextWidth(text.slice(0, index), fontSize, 700) - targetWidth);
    const closestDelta = Math.abs(estimateTextWidth(text.slice(0, closest), fontSize, 700) - targetWidth);
    return currentDelta < closestDelta ? index : closest;
  }, null);

  if (closestWhitespace !== null) {
    const whitespaceDelta = Math.abs(
      estimateTextWidth(text.slice(0, closestWhitespace), fontSize, 700) - targetWidth,
    );
    if (whitespaceDelta <= fontSize * 4) return closestWhitespace;
  }
  return characterSplit;
}

function wrapTaskName(name: string, maximumWidth: number, fontSize: number, maximumLines: number): string[] {
  const normalizedName = name.trim();
  if (
    maximumLines <= 1
    || estimateTextWidth(normalizedName, fontSize, 700) <= maximumWidth
  ) return [normalizedName];

  const lines: string[] = [];
  let remaining = normalizedName;
  for (let lineIndex = 0; lineIndex < maximumLines - 1 && remaining; lineIndex += 1) {
    const remainingLines = maximumLines - lineIndex;
    const targetWidth = estimateTextWidth(remaining, fontSize, 700) / remainingLines;
    const splitIndex = balancedSplitIndex(remaining, targetWidth, maximumWidth, fontSize);
    lines.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

export const GanttChart = forwardRef<SVGSVGElement, GanttChartProps>(function GanttChart(props, ref) {
  const document = withPreview(props.document, props.previewTask);
  const today = props.today ?? currentLocalIsoDate();
  const layout = calculateChartLayout(document, today, props.viewport);
  const { metrics } = layout;
  const gridBottom = layout.height - metrics.legendHeight;
  const timelineX = (position: number) => metrics.labelWidth + position * metrics.dayWidth;

  return (
    <svg
      ref={ref}
      className="gantt-chart"
      role={props.mode === "editor" ? "group" : "img"}
      aria-label={`${document.title} Gantt chart`}
      data-testid="chart-background"
      onClick={props.mode === "editor" ? props.onClearSelection : undefined}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
    >
      <rect data-export-background="true" width={layout.width} height={layout.height} fill="#ffffff" />
      {props.mode === "editor" && props.onTitleCommit ? (
        <foreignObject
          data-editor-only="true"
          x={metrics.padding}
          y={metrics.padding * 0.25}
          width={Math.max(0.01, metrics.labelWidth - metrics.padding * 2)}
          height={Math.max(0.01, metrics.headerHeight * 0.5)}
        >
          <InlineChartTitle
            value={document.title}
            onCommit={props.onTitleCommit}
            style={{ fontSize: metrics.titleFontSize }}
          />
        </foreignObject>
      ) : (
        <text className="gantt-chart-title" x={metrics.padding} y={metrics.headerHeight * 0.42} style={{ fontSize: metrics.titleFontSize }}>{document.title}</text>
      )}
      <text className="gantt-chart-label" x={metrics.padding} y={metrics.headerHeight * 0.8} style={{ fontSize: metrics.dateFontSize }}>Task</text>
      <g className="gantt-header" data-tier={layout.header.tier}>
        {layout.header.gridLines.map((position) => (
          <line key={position} className="gantt-grid-line" x1={timelineX(position)} y1={0} x2={timelineX(position)} y2={gridBottom} />
        ))}
        {layout.header.weekBoundaryIndices.map((position) => (
          <line
            key={`week-div-${position}`}
            className="gantt-week-divider"
            x1={timelineX(position)}
            y1={0}
            x2={timelineX(position)}
            y2={gridBottom}
          />
        ))}
        {layout.header.bands.map((band) => (
          <g key={band.key} className="gantt-header-band">
            <line className="gantt-month-divider" x1={timelineX(band.startIndex)} y1={0} x2={timelineX(band.startIndex)} y2={metrics.headerHeight * 0.5} />
            <text className="gantt-header-band-label" x={timelineX((band.startIndex + band.endIndex) / 2)} y={metrics.headerHeight * 0.28} style={{ fontSize: metrics.dateFontSize }}>{band.label}</text>
          </g>
        ))}
        {layout.header.weekBands.map((band) => (
          <g key={band.key} className="gantt-week-band">
            {band.label ? (
              <text
                className="gantt-week-band-label"
                x={timelineX((band.startIndex + band.endIndex) / 2)}
                y={metrics.headerHeight * (layout.header.bands.length > 0 ? 0.52 : 0.28)}
                style={{ fontSize: metrics.dateFontSize }}
              >
                {band.label}
              </text>
            ) : null}
          </g>
        ))}
        {layout.header.labels.map((label) => layout.header.tier === "detailed-days" ? (
          <text key={label.key} className="gantt-header-label gantt-date-weekday" x={timelineX(label.position)} y={metrics.headerHeight * 0.34} style={{ fontSize: metrics.dateFontSize }}>
            <tspan x={timelineX(label.position)}>{label.label}</tspan>
            <tspan className="gantt-date-value" x={timelineX(label.position)} dy="1.35em">{label.secondaryLabel}</tspan>
          </text>
        ) : (
          <text
            key={label.key}
            className="gantt-header-label"
            x={timelineX(label.position)}
            y={metrics.headerHeight * (
              layout.header.bands.length > 0 && layout.header.weekBands.length > 0
                ? 0.82
                : layout.header.weekBands.length > 0
                  ? 0.72
                  : layout.header.bands.length > 0
                    ? 0.78
                    : 0.62
            )}
            style={{ fontSize: metrics.dateFontSize }}
          >
            {label.label}
          </text>
        ))}
      </g>
      <line className="gantt-grid-line" x1={0} y1={metrics.headerHeight} x2={layout.width} y2={metrics.headerHeight} />
      {layout.tasks.map((geometry) => {
        const taskNameWidth = Math.max(0.01, metrics.labelWidth - metrics.padding * 2);
        const taskNameLines = wrapTaskName(
          geometry.task.name,
          taskNameWidth,
          metrics.taskFontSize,
          metrics.taskLabelLines,
        );
        const lineHeight = metrics.taskFontSize * 1.18;
        const taskNameY = geometry.y + metrics.barHeight / 2 - ((taskNameLines.length - 1) * lineHeight) / 2;

        return (
          <g key={geometry.id} data-testid="task-row">
          {props.mode === "editor" && props.onCommitTask ? (
            <foreignObject
              data-editor-only="true"
              data-testid="task-name-editor"
              x={metrics.padding}
              y={geometry.y}
              width={taskNameWidth}
              height={Math.max(0.01, metrics.rowHeight)}
            >
              <InlineTaskName
                value={geometry.task.name}
                onCommit={(name) => props.onCommitTask?.({ ...geometry.task, name })}
                style={{ fontSize: metrics.taskFontSize, fontWeight: 700 }}
              />
            </foreignObject>
          ) : (
            <text
              className="gantt-task-name"
              x={metrics.padding}
              y={taskNameY}
              style={{ fontSize: metrics.taskFontSize, fontWeight: 700 }}
            >
              {taskNameLines.map((line, lineIndex) => (
                <tspan
                  key={`${geometry.id}-${lineIndex}`}
                  x={metrics.padding}
                  dy={lineIndex === 0 ? 0 : lineHeight}
                  textLength={Math.min(taskNameWidth, estimateTextWidth(line, metrics.taskFontSize, 700))}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {line}
                </tspan>
              ))}
            </text>
          )}
          {geometry.isVisible && (
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
          )}
          </g>
        );
      })}
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
      {layout.todayX !== null && (
        <g className="gantt-today" pointerEvents="none">
          <line className="gantt-today-marker" x1={layout.todayX} y1={metrics.headerHeight} x2={layout.todayX} y2={gridBottom} />
        </g>
      )}
    </svg>
  );
});
