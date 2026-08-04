import type { KeyboardEvent, MouseEvent } from "react";

import { DAY_WIDTH } from "@/gantt/layout";
import type { TaskGeometry } from "@/gantt/layout";
import type { ChartSettings, GanttTask } from "@/gantt/model";
import { useBarDrag } from "@/gantt/useBarDrag";

interface TaskBarProps {
  geometry: TaskGeometry;
  mode: "editor" | "export";
  selected: boolean;
  settings: ChartSettings;
  onSelectTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onPreviewTask?: (task: GanttTask | null) => void;
  onCommitTask?: (task: GanttTask) => void;
}

export function TaskBar({ geometry, mode, selected, settings, onSelectTask, onEditTask, onPreviewTask, onCommitTask }: TaskBarProps) {
  const handleWidth = 10;
  const isEditor = mode === "editor";
  const onClick = () => onSelectTask?.(geometry.id);
  const onDoubleClick = () => onEditTask?.(geometry.id);
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onClick();
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      onDoubleClick();
    }
  };
  const moveDrag = useBarDrag({
    task: geometry.task,
    kind: "move",
    dayWidth: DAY_WIDTH,
    settings,
    onPreviewTask,
    onCommitTask,
  });
  const startResizeDrag = useBarDrag({
    task: geometry.task,
    kind: "resize-start",
    dayWidth: DAY_WIDTH,
    settings,
    onPreviewTask,
    onCommitTask,
  });
  const endResizeDrag = useBarDrag({
    task: geometry.task,
    kind: "resize-end",
    dayWidth: DAY_WIDTH,
    settings,
    onPreviewTask,
    onCommitTask,
  });
  const stopHandlePropagation = (event: MouseEvent<SVGRectElement>) => event.stopPropagation();

  return (
    <g
      data-testid="task-bar-group"
      role={isEditor ? "button" : undefined}
      aria-label={isEditor ? `${geometry.task.name} task` : undefined}
      tabIndex={isEditor ? 0 : undefined}
      onClick={isEditor ? onClick : undefined}
      onDoubleClick={isEditor ? onDoubleClick : undefined}
      onKeyDown={isEditor ? onKeyDown : undefined}
    >
      {isEditor && (
        <rect
          data-testid="task-hit-target"
          x={geometry.x - 8}
          y={geometry.y - 6}
          width={geometry.width + 16}
          height={geometry.height + 12}
          fill="transparent"
          cursor="pointer"
        />
      )}
      <rect
        data-testid="task-bar"
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        rx={6}
        fill={geometry.task.color}
        stroke={isEditor && selected ? "#1d4ed8" : undefined}
        strokeWidth={isEditor && selected ? 2 : undefined}
        className={isEditor ? "gantt-task-bar gantt-task-bar--interactive" : "gantt-task-bar"}
        style={isEditor ? { cursor: moveDrag.isDragging ? "grabbing" : "grab", touchAction: "none" } : undefined}
        onPointerDown={isEditor ? moveDrag.onPointerDown : undefined}
        onPointerMove={isEditor ? moveDrag.onPointerMove : undefined}
        onPointerUp={isEditor ? moveDrag.onPointerUp : undefined}
        onPointerCancel={isEditor ? moveDrag.onPointerCancel : undefined}
        onLostPointerCapture={isEditor ? moveDrag.onLostPointerCapture : undefined}
      />
      {isEditor && selected && (
        <>
          <rect
            data-testid="resize-handle"
            x={geometry.x}
            y={geometry.y}
            width={handleWidth}
            height={geometry.height}
            rx={4}
            fill="rgba(255, 255, 255, 0.72)"
            className="gantt-resize-handle"
            style={{ cursor: "ew-resize", touchAction: "none" }}
            onClick={stopHandlePropagation}
            onDoubleClick={stopHandlePropagation}
            onPointerDown={startResizeDrag.onPointerDown}
            onPointerMove={startResizeDrag.onPointerMove}
            onPointerUp={startResizeDrag.onPointerUp}
            onPointerCancel={startResizeDrag.onPointerCancel}
            onLostPointerCapture={startResizeDrag.onLostPointerCapture}
          />
          <rect
            data-testid="resize-handle"
            x={geometry.x + geometry.width - handleWidth}
            y={geometry.y}
            width={handleWidth}
            height={geometry.height}
            rx={4}
            fill="rgba(255, 255, 255, 0.72)"
            className="gantt-resize-handle"
            style={{ cursor: "ew-resize", touchAction: "none" }}
            onClick={stopHandlePropagation}
            onDoubleClick={stopHandlePropagation}
            onPointerDown={endResizeDrag.onPointerDown}
            onPointerMove={endResizeDrag.onPointerMove}
            onPointerUp={endResizeDrag.onPointerUp}
            onPointerCancel={endResizeDrag.onPointerCancel}
            onLostPointerCapture={endResizeDrag.onLostPointerCapture}
          />
        </>
      )}
    </g>
  );
}
