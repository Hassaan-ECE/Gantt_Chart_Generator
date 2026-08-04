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
  const onClick = () => onSelectTask?.(geometry.id);
  const onDoubleClick = () => onEditTask?.(geometry.id);

  return (
    <g aria-label={`${geometry.task.name} task`} onClick={onClick} onDoubleClick={onDoubleClick}>
      <rect
        x={geometry.x - 8}
        y={geometry.y - 6}
        width={geometry.width + 16}
        height={geometry.height + 12}
        fill="transparent"
        cursor={mode === "editor" ? "pointer" : undefined}
      />
      <rect
        data-testid="task-bar"
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        rx={6}
        fill={geometry.task.color}
      />
      {mode === "editor" && selected && (
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
