import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { svgToPngArtifact, type PngArtifact } from "@/gantt/exportPng";
import { copyPngToClipboard } from "@/integrations/tauri/clipboardBridge";
import { loadChart, saveChart } from "@/integrations/tauri/chartBridge";
import { choosePngDestination, writePng } from "@/integrations/tauri/exportBridge";

vi.mock("@/gantt/exportPng", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/gantt/exportPng")>();
  return { ...actual, svgToPngArtifact: vi.fn() };
});
vi.mock("@/integrations/tauri/clipboardBridge", () => ({ copyPngToClipboard: vi.fn() }));
vi.mock("@/integrations/tauri/chartBridge", () => ({ loadChart: vi.fn(), saveChart: vi.fn() }));
vi.mock("@/integrations/tauri/exportBridge", () => ({
  choosePngDestination: vi.fn(),
  writePng: vi.fn(),
}));

const artifact: PngArtifact = {
  blob: new Blob([], { type: "image/png" }),
  bytes: new Uint8Array([137, 80, 78, 71]),
};

beforeEach(() => {
  vi.mocked(loadChart).mockReset().mockResolvedValue(null);
  vi.mocked(saveChart).mockReset().mockResolvedValue(undefined);
  vi.mocked(svgToPngArtifact).mockReset().mockResolvedValue(artifact);
  vi.mocked(copyPngToClipboard).mockReset().mockResolvedValue(undefined);
  vi.mocked(choosePngDestination).mockReset().mockResolvedValue(null);
  vi.mocked(writePng).mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("Copy image action", () => {
  it("copies the PowerPoint-ready artifact without opening a save dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    const copyButton = await screen.findByRole("button", { name: "Copy image" });
    expect(copyButton).toHaveTextContent("");
    await user.click(copyButton);

    expect(svgToPngArtifact).toHaveBeenCalledTimes(1);
    expect(copyPngToClipboard).toHaveBeenCalledWith(artifact);
    expect(choosePngDestination).not.toHaveBeenCalled();
    expect(await screen.findByText("Copied")).toBeVisible();
  });

  it("retries a failed clipboard write through the same action", async () => {
    const user = userEvent.setup();
    vi.mocked(copyPngToClipboard)
      .mockRejectedValueOnce(new Error("clipboard busy"))
      .mockResolvedValue(undefined);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Copy image" }));
    expect(await screen.findByText("Could not copy image")).toHaveAttribute("title", "clipboard busy");
    await user.click(screen.getByRole("button", { name: "Retry copy" }));

    expect(copyPngToClipboard).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Copied")).toBeVisible();
  });
});
