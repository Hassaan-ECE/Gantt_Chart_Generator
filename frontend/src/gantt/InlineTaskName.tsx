import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

interface InlineTaskNameProps {
  value: string;
  onCommit: (value: string) => void;
  style?: CSSProperties;
}

export function InlineTaskName({ value, onCommit, style }: InlineTaskNameProps) {
  const [draft, setDraft] = useState(value);
  const original = useRef(value);
  const cancelled = useRef(false);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (!next) {
      setDraft(original.current);
      return;
    }
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      cancelled.current = true;
      setDraft(original.current);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      aria-label="Task name"
      className="gantt-inline-task-name"
      style={style}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        original.current = value;
        event.currentTarget.select();
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event: MouseEvent<HTMLInputElement>) => {
        event.stopPropagation();
        event.currentTarget.select();
      }}
    />
  );
}
