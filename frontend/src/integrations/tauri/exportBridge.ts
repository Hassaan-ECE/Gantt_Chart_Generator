import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { sanitizeExportFilename } from "@/gantt/exportPng";

export function choosePngDestination(title: string): Promise<string | null> {
  return save({
    defaultPath: sanitizeExportFilename(title),
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
}

export function writePng(path: string, bytes: Uint8Array): Promise<void> {
  return invoke("write_png", { path, bytes: Array.from(bytes) });
}
