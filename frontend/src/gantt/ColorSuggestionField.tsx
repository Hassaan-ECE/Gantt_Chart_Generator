import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

interface ColorSuggestionFieldProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function ColorSuggestionField({ value, options, onChange }: ColorSuggestionFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedValue = value.toLowerCase();
  const colors = Array.from(new Set([normalizedValue, ...options.map((color) => color.toLowerCase())]));

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  };

  const openMenu = () => {
    const selectedIndex = Math.max(0, colors.indexOf(normalizedValue));
    setActiveIndex(selectedIndex);
    setOpen(true);
    queueMicrotask(() => optionRefs.current[selectedIndex]?.focus());
  };

  const focusOption = (index: number) => {
    const nextIndex = (index + colors.length) % colors.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const choose = (color: string) => {
    onChange(color);
    close(true);
  };

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(colors.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(colors[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    globalThis.document.addEventListener("pointerdown", onPointerDown);
    return () => globalThis.document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="color-suggestion-field">
      <div className="color-suggestion-controls">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Choose task color"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              openMenu();
            } else if (open && event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
        >
          <span className="color-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
          <span>{normalizedValue}</span>
        </button>
        <input
          aria-label="Custom color"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {open && (
        <div id={listboxId} role="listbox" aria-label="Used task colors" className="color-suggestion-menu">
          {colors.map((color, index) => (
            <button
              key={color}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              aria-label={`Use color ${color}`}
              aria-selected={color === normalizedValue}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => choose(color)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              <span className="color-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{color}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
