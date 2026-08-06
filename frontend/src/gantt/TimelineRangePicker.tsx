import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

import { addCalendarDays, addCalendarMonths } from "@/gantt/dateMath";
import { isValidIsoDate, type IsoDate, type TimelineRange } from "@/gantt/model";
import { formatTimelineRangeSummary } from "@/gantt/timelineRange";

export interface TimelineRangePickerProps {
  effectiveRange: TimelineRange;
  customRange?: TimelineRange;
  onChange: (range: TimelineRange | undefined) => void;
}

type TimelineEndpoint = "startDate" | "endDate";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dateNameFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function utcDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00Z`);
}

function firstOfMonth(value: IsoDate): IsoDate {
  return `${value.slice(0, 7)}-01`;
}

function calendarDates(monthStart: IsoDate): IsoDate[] {
  const firstGridDate = addCalendarDays(monthStart, -utcDate(monthStart).getUTCDay());
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(firstGridDate, index));
}

function isValidRange(range: TimelineRange): boolean {
  return isValidIsoDate(range.startDate)
    && isValidIsoDate(range.endDate)
    && range.endDate >= range.startDate;
}

export function TimelineRangePicker({ effectiveRange, customRange, onChange }: TimelineRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<TimelineRange>({ ...effectiveRange });
  const [activeEndpoint, setActiveEndpoint] = useState<TimelineEndpoint>("startDate");
  const [monthStart, setMonthStart] = useState<IsoDate>(firstOfMonth(effectiveRange.startDate));
  const [focusedDate, setFocusedDate] = useState<IsoDate>(effectiveRange.startDate);
  const rootRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => calendarDates(monthStart), [monthStart]);
  const today = new Date().toISOString().slice(0, 10);

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

  useLayoutEffect(() => {
    if (!isOpen) return;
    calendarRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)
      ?.focus();
  }, [focusedDate, isOpen, monthStart]);

  const openPicker = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const nextDraft = customRange ?? effectiveRange;
    setDraft({ ...nextDraft });
    setActiveEndpoint("startDate");
    setMonthStart(firstOfMonth(nextDraft.startDate));
    setFocusedDate(nextDraft.startDate);
    setIsOpen(true);
  };

  const selectDate = (date: IsoDate) => {
    setDraft((current) => ({ ...current, [activeEndpoint]: date }));
    setFocusedDate(date);
    if (activeEndpoint === "startDate") setActiveEndpoint("endDate");
  };

  const moveFocus = (date: IsoDate) => {
    setFocusedDate(date);
    setMonthStart(firstOfMonth(date));
  };

  const handleCalendarKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, date: IsoDate) => {
    const changes: Partial<Record<string, IsoDate>> = {
      ArrowLeft: addCalendarDays(date, -1),
      ArrowRight: addCalendarDays(date, 1),
      ArrowUp: addCalendarDays(date, -7),
      ArrowDown: addCalendarDays(date, 7),
      PageUp: addCalendarMonths(date, -1),
      PageDown: addCalendarMonths(date, 1),
    };
    const nextDate = changes[event.key];
    if (!nextDate) return;
    event.preventDefault();
    moveFocus(nextDate);
  };

  const changeMonth = (amount: number) => {
    const nextMonth = addCalendarMonths(monthStart, amount);
    setMonthStart(nextMonth);
    setFocusedDate(addCalendarMonths(focusedDate, amount));
  };

  return (
    <div className="timeline-range-picker" ref={rootRef}>
      <button
        type="button"
        className="timeline-range-trigger"
        aria-label="Choose timeline range"
        aria-expanded={isOpen}
        title="Choose timeline range"
        onClick={openPicker}
      >
        <CalendarRange aria-hidden="true" />
        <span>{formatTimelineRangeSummary(effectiveRange)}</span>
      </button>

      {isOpen && (
        <div className="timeline-range-popover" role="group" aria-label="Timeline range options">
          <div className="timeline-range-fields">
            <label>
              <span>Start</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Timeline start"
                value={draft.startDate}
                onFocus={() => setActiveEndpoint("startDate")}
                onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Timeline end"
                value={draft.endDate}
                onFocus={() => setActiveEndpoint("endDate")}
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
          </div>

          <div className="timeline-range-endpoints" aria-label="Choose endpoint">
            <button
              type="button"
              aria-label="Edit timeline start"
              aria-pressed={activeEndpoint === "startDate"}
              onClick={() => setActiveEndpoint("startDate")}
            >
              Start
            </button>
            <button
              type="button"
              aria-label="Edit timeline end"
              aria-pressed={activeEndpoint === "endDate"}
              onClick={() => setActiveEndpoint("endDate")}
            >
              End
            </button>
          </div>

          <div className="timeline-range-month-controls">
            <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong>{monthFormatter.format(utcDate(monthStart))}</strong>
            <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          <div className="timeline-range-calendar" ref={calendarRef} role="grid" aria-label="Timeline calendar">
            {weekdayLabels.map((label) => (
              <div className="timeline-range-weekday" role="columnheader" key={label}>{label}</div>
            ))}
            {dates.map((date) => {
              const isEndpoint = date === draft.startDate || date === draft.endDate;
              const isInRange = isValidRange(draft) && date > draft.startDate && date < draft.endDate;
              const className = [
                "timeline-range-day",
                date.slice(0, 7) !== monthStart.slice(0, 7) && "timeline-range-day--outside",
                date === today && "timeline-range-day--today",
                date === draft.startDate && "timeline-range-day--start",
                date === draft.endDate && "timeline-range-day--end",
                isEndpoint && "timeline-range-day--endpoint",
                isInRange && "timeline-range-day--in-range",
              ].filter(Boolean).join(" ");
              return (
                <button
                  type="button"
                  className={className}
                  aria-label={dateNameFormatter.format(utcDate(date))}
                  aria-pressed={isEndpoint}
                  data-date={date}
                  tabIndex={date === focusedDate ? 0 : -1}
                  key={date}
                  onClick={() => selectDate(date)}
                  onKeyDown={(event) => handleCalendarKeyDown(event, date)}
                >
                  {Number(date.slice(-2))}
                </button>
              );
            })}
          </div>

          <div className="timeline-range-actions">
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setIsOpen(false);
              }}
            >
              Auto-fit
            </button>
            <button
              type="button"
              className="timeline-range-apply"
              disabled={!isValidRange(draft)}
              onClick={() => {
                onChange({ ...draft });
                setIsOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
