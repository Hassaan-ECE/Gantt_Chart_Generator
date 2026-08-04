export const CHART_SCHEMA_VERSION = 1 as const;
export type IsoDate = string;

export interface ChartSettings {
  showSaturday: boolean;
  showSunday: boolean;
}

export interface GanttTask {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  category: string;
  color: string;
}

export interface ChartDocument {
  schemaVersion: typeof CHART_SCHEMA_VERSION;
  title: string;
  settings: ChartSettings;
  tasks: GanttTask[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

export function parseChartDocument(value: unknown): ChartDocument {
  if (!value || typeof value !== "object") throw new Error("chart document must be an object");
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== CHART_SCHEMA_VERSION) throw new Error("unsupported chart schema version");
  if (typeof document.title !== "string" || !document.title.trim()) throw new Error("title is required");
  if (!document.settings || typeof document.settings !== "object") throw new Error("settings are required");
  const settings = document.settings as Record<string, unknown>;
  if (typeof settings.showSaturday !== "boolean" || typeof settings.showSunday !== "boolean") throw new Error("weekend settings must be boolean");
  if (!Array.isArray(document.tasks)) throw new Error("tasks must be an array");

  const tasks = document.tasks.map((item, index): GanttTask => {
    if (!item || typeof item !== "object") throw new Error(`task ${index + 1} must be an object`);
    const task = item as Record<string, unknown>;
    for (const field of ["id", "name", "startDate", "endDate", "category", "color"] as const) {
      if (typeof task[field] !== "string" || !task[field].trim()) throw new Error(`task ${index + 1} ${field} is required`);
    }
    if (!isValidIsoDate(task.startDate as string) || !isValidIsoDate(task.endDate as string)) throw new Error(`task ${index + 1} dates must use valid YYYY-MM-DD values`);
    if ((task.endDate as string) < (task.startDate as string)) throw new Error(`task ${index + 1} endDate must not precede startDate`);
    if (!HEX_COLOR.test(task.color as string)) throw new Error(`task ${index + 1} color must be a six-digit hex color`);
    return task as unknown as GanttTask;
  });

  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    title: document.title.trim(),
    settings: settings as unknown as ChartSettings,
    tasks,
  };
}
