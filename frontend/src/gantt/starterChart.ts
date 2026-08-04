import { addVisibleDays, nearestVisibleDate } from "@/gantt/dateMath";
import { CHART_SCHEMA_VERSION, type ChartDocument, type ChartSettings } from "@/gantt/model";

const DEFAULT_SETTINGS: ChartSettings = { showSaturday: false, showSunday: false };

export function currentLocalIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createStarterChart(today = currentLocalIsoDate()): ChartDocument {
  const start = nearestVisibleDate(today, 1, DEFAULT_SETTINGS);
  const task = (id: string, name: string, from: number, to: number, category: string, color: string) => ({
    id,
    name,
    startDate: addVisibleDays(start, from, DEFAULT_SETTINGS),
    endDate: addVisibleDays(start, to, DEFAULT_SETTINGS),
    category,
    color,
  });
  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    title: "Execution Timeline",
    settings: { ...DEFAULT_SETTINGS },
    tasks: [
      task("starter-assembly", "Assemble two units using calibrated meters", 0, 1, "IRHX", "#00b95a"),
      task("starter-testing", "Support PCS testing", 0, 5, "PCS Testing", "#8757ed"),
      task("starter-feedback", "Incorporate project feedback", 2, 3, "PDU R&D", "#f59e0b"),
      task("starter-inventory", "Complete component updates", 3, 4, "Inventory", "#55c5ca"),
      task("starter-quotes", "Review quotations and recommend a path", 0, 5, "HVDC", "#1689c8"),
    ],
  };
}
