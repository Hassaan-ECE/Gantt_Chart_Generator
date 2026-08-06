import { isTauri } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

import type { PngArtifact } from "@/gantt/exportPng";

export async function copyPngToClipboard(artifact: PngArtifact): Promise<void> {
  if (isTauri()) {
    const image = await Image.fromBytes(artifact.bytes);
    try {
      await writeImage(image);
    } finally {
      await image.close();
    }
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is unavailable");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": artifact.blob })]);
}
