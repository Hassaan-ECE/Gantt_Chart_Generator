import { isTauri } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PngArtifact } from "@/gantt/exportPng";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/image", () => ({ Image: { fromBytes: vi.fn() } }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeImage: vi.fn() }));

interface ClipboardBridgeModule {
  copyPngToClipboard: (artifact: PngArtifact) => Promise<void>;
}

const artifact: PngArtifact = {
  blob: new Blob([], { type: "image/png" }),
  bytes: new Uint8Array([137, 80, 78, 71]),
};

function loadBridge(): ClipboardBridgeModule {
  const modules = import.meta.glob<ClipboardBridgeModule>(
    "../src/integrations/tauri/clipboardBridge.ts",
    { eager: true },
  );
  const bridge = Object.values(modules)[0];
  expect(bridge).toBeDefined();
  return bridge;
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("image clipboard bridge", () => {
  it("decodes PNG bytes and writes a Tauri image resource", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const image = { close };
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(Image.fromBytes).mockResolvedValue(image as never);

    await loadBridge().copyPngToClipboard(artifact);

    expect(Image.fromBytes).toHaveBeenCalledWith(new Uint8Array([137, 80, 78, 71]));
    expect(writeImage).toHaveBeenCalledWith(image);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("releases the Tauri image resource when clipboard writing fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(Image.fromBytes).mockResolvedValue({ close } as never);
    vi.mocked(writeImage).mockRejectedValue(new Error("clipboard busy"));

    await expect(loadBridge().copyPngToClipboard(artifact)).rejects.toThrow("clipboard busy");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("uses ClipboardItem outside Tauri", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", class {
      constructor(readonly data: Record<string, Blob>) {}
    });
    vi.stubGlobal("navigator", { clipboard: { write } });

    await loadBridge().copyPngToClipboard(artifact);

    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0];
    expect(items[0].data["image/png"]).toBe(artifact.blob);
  });

  it("reports an unavailable browser image clipboard", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.stubGlobal("navigator", { clipboard: {} });
    vi.stubGlobal("ClipboardItem", undefined);

    await expect(loadBridge().copyPngToClipboard(artifact)).rejects.toThrow(
      "Image clipboard is unavailable",
    );
  });
});
