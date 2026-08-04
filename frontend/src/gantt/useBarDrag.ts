import { useRef, useState, type PointerEvent } from "react";

import { moveTaskByVisibleSteps, resizeTaskByVisibleSteps } from "@/gantt/taskOperations";
import type { ChartSettings, GanttTask } from "@/gantt/model";

export type BarInteractionKind = "move" | "resize-start" | "resize-end";

interface UseBarDragOptions {
  task: GanttTask;
  kind: BarInteractionKind;
  dayWidth: number;
  settings: ChartSettings;
  onPreviewTask?: (task: GanttTask | null) => void;
  onCommitTask?: (task: GanttTask) => void;
}

interface ActiveDrag {
  pointerId: number;
  originX: number;
  originalTask: GanttTask;
  lastSteps: number;
  lastPreview: GanttTask | null;
}

type SvgPointerEvent = PointerEvent<SVGRectElement>;

function releasePointerCapture(element: SVGRectElement, pointerId: number) {
  (element as SVGRectElement & { releasePointerCapture?: (pointerId: number) => void })
    .releasePointerCapture?.(pointerId);
}

export function useBarDrag({ task, kind, dayWidth, settings, onPreviewTask, onCommitTask }: UseBarDragOptions) {
  const activeDrag = useRef<ActiveDrag | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const transformTask = (originalTask: GanttTask, steps: number): GanttTask => {
    if (kind === "move") return moveTaskByVisibleSteps(originalTask, steps, settings);
    return resizeTaskByVisibleSteps(originalTask, kind === "resize-start" ? "start" : "end", steps, settings);
  };

  const clearPreview = () => {
    activeDrag.current = null;
    setIsDragging(false);
    onPreviewTask?.(null);
  };

  const onPointerDown = (event: SvgPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    activeDrag.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originalTask: task,
      lastSteps: 0,
      lastPreview: null,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event: SvgPointerEvent) => {
    const drag = activeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const steps = Math.round((event.clientX - drag.originX) / dayWidth);
    if (steps === drag.lastSteps) return;

    const preview = transformTask(drag.originalTask, steps);
    drag.lastSteps = steps;
    drag.lastPreview = preview;
    onPreviewTask?.(preview);
  };

  const onPointerUp = (event: SvgPointerEvent) => {
    const drag = activeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    activeDrag.current = null;
    setIsDragging(false);
    if (drag.lastPreview) onCommitTask?.(drag.lastPreview);
    onPreviewTask?.(null);
    releasePointerCapture(event.currentTarget, event.pointerId);
  };

  const onPointerCancel = (event: SvgPointerEvent) => {
    const drag = activeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    clearPreview();
    releasePointerCapture(event.currentTarget, event.pointerId);
  };

  const onLostPointerCapture = () => {
    if (!activeDrag.current) return;
    clearPreview();
  };

  return { isDragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture };
}
