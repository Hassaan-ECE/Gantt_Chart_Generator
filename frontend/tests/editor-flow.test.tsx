import { act, cleanup, render, screen } from "@testing-library/react";
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
vi.mock("@/integrations/tauri/chartBridge", () => ({
  loadChart: vi.fn(),
  saveChart: vi.fn(),
}));
vi.mock("@/integrations/tauri/exportBridge", () => ({
  choosePngDestination: vi.fn(),
  writePng: vi.fn(),
}));

describe("complete editor flow", () => {
  const artifact: PngArtifact = {
    blob: new Blob([], { type: "image/png" }),
    bytes: new Uint8Array([1, 2, 3]),
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "new-task-id") });
    vi.mocked(loadChart).mockReset().mockResolvedValue(null);
    vi.mocked(saveChart).mockReset().mockResolvedValue(undefined);
    vi.mocked(choosePngDestination).mockReset().mockResolvedValue("C:\\Exports\\Execution Timeline.png");
    vi.mocked(svgToPngArtifact).mockReset().mockResolvedValue(artifact);
    vi.mocked(copyPngToClipboard).mockReset().mockResolvedValue(undefined);
    vi.mocked(writePng).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("adds, edits, configures, autosaves, copies, and exports one chart", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    expect(await screen.findByLabelText("Gantt chart workspace")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.clear(screen.getByLabelText("Task name"));
    await user.type(screen.getByLabelText("Task name"), "Prepare weekly review");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(screen.getByText("Prepare weekly review")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Chart settings" }));
    await user.click(screen.getByRole("checkbox", { name: "Show Saturday" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(saveChart).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy image" }));
    expect(copyPngToClipboard).toHaveBeenCalledWith(artifact);
    expect(choosePngDestination).not.toHaveBeenCalled();
    expect(await screen.findByText("Copied")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Export PNG" }));
    expect(svgToPngArtifact).toHaveBeenCalledTimes(2);
    expect(writePng).toHaveBeenCalled();
    expect(copyPngToClipboard).toHaveBeenCalledTimes(1);
  });
});
