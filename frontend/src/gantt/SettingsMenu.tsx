import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

import type { ChartSettings } from "@/gantt/model";

export interface SettingsMenuProps {
  settings: ChartSettings;
  onChange: (settings: ChartSettings) => void;
}

export function SettingsMenu({ settings, onChange }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        type="button"
        aria-label="Chart settings"
        title="Chart settings"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Settings aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="settings-popover" role="group" aria-label="Chart settings options">
          <label>
            <input
              type="checkbox"
              checked={settings.showSaturday}
              onChange={(event) => onChange({ ...settings, showSaturday: event.target.checked })}
            />
            Show Saturday
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showSunday}
              onChange={(event) => onChange({ ...settings, showSunday: event.target.checked })}
            />
            Show Sunday
          </label>
        </div>
      )}
    </div>
  );
}
