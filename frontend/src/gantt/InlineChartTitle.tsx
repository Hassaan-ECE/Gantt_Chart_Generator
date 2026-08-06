import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

interface InlineChartTitleProps {
  value: string;
  onCommit: (value: string) => void;
  style?: CSSProperties;
}

export function InlineChartTitle({ value, onCommit, style }: InlineChartTitleProps) {
  const [draft, setDraft] = useState(value);
  const original = useRef(value);
  const cancelled = useRef(false);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim() || "Untitled Gantt Chart";
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

  const selectTitle = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.currentTarget.select();
  };

  return (
    <input
      aria-label="Chart title"
      className="gantt-inline-title"
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
      onClick={selectTitle}
    />
  );
}
