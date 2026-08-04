import { invoke } from "@tauri-apps/api/core";

import { parseChartDocument, type ChartDocument } from "@/gantt/model";

export async function loadChart(): Promise<ChartDocument | null> {
  const value = await invoke<unknown>("load_chart");
  return value === null ? null : parseChartDocument(value);
}

export function saveChart(document: ChartDocument): Promise<void> {
  return invoke("save_chart", { document });
}
