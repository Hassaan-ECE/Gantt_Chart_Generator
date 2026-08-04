import type { ChartSettings, IsoDate } from "@/gantt/model";

const DAY_MS = 86_400_000;

function toDayNumber(value: IsoDate): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function fromDayNumber(value: number): IsoDate {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

export function addCalendarDays(value: IsoDate, amount: number): IsoDate {
  return fromDayNumber(toDayNumber(value) + amount);
}

export function calendarDayDifference(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function isVisibleDate(value: IsoDate, settings: ChartSettings): boolean {
  const weekday = new Date(toDayNumber(value) * DAY_MS).getUTCDay();
  return (weekday !== 6 || settings.showSaturday) && (weekday !== 0 || settings.showSunday);
}

export function visibleDatesBetween(start: IsoDate, end: IsoDate, settings: ChartSettings): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let current = start; current <= end; current = addCalendarDays(current, 1)) {
    if (isVisibleDate(current, settings)) dates.push(current);
  }
  return dates;
}

export function addVisibleDays(value: IsoDate, amount: number, settings: ChartSettings): IsoDate {
  if (amount === 0) return nearestVisibleDate(value, 1, settings);
  const direction = amount > 0 ? 1 : -1;
  let current = value;
  let remaining = Math.abs(amount);
  while (remaining > 0) {
    current = addCalendarDays(current, direction);
    if (isVisibleDate(current, settings)) remaining -= 1;
  }
  return current;
}

export function nearestVisibleDate(value: IsoDate, direction: 1 | -1, settings: ChartSettings): IsoDate {
  let current = value;
  while (!isVisibleDate(current, settings)) current = addCalendarDays(current, direction);
  return current;
}
