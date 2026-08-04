import type { KeyboardEvent } from "react";

import type { TaskGeometry } from "@/gantt/layout";

interface TaskBarProps {
  geometry: TaskGeometry;
  mode: "editor" | "export";
  selected: boolean;
  onSelectTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
}

export function TaskBar({ geometry, mode, selected, onSelectTask, onEditTask }: TaskBarProps) {
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
          />
          <rect
            data-testid="resize-handle"
            x={geometry.x + geometry.width - handleWidth}
            y={geometry.y}
            width={handleWidth}
            height={geometry.height}
            rx={4}
            fill="rgba(255, 255, 255, 0.72)"
          />
        </>
      )}
    </g>
  );
}
