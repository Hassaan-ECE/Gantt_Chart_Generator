import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { svgToPngArtifact, type PngArtifact } from "@/gantt/exportPng";
import { createStarterChart } from "@/gantt/starterChart";
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function expectTodayAlignedWith(svg: SVGSVGElement, dateLabel: string) {
  const label = Array.from(svg.querySelectorAll<SVGTextElement>(".gantt-header-label"))
    .find((candidate) => candidate.textContent === dateLabel);
  expect(label).toBeDefined();
  expect(svg.querySelector(".gantt-today-marker")?.getAttribute("x1"))
    .toBe(label?.getAttribute("x"));
}

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
    const announcement = await screen.findByRole("status", { name: "Image action status" });
    expect(announcement).toHaveTextContent("Copied");
    expect(announcement).toHaveClass("sr-only");
    expect(document.querySelector(".image-action-status")).toBeNull();
  });

  it("retries a failed clipboard write through the same action", async () => {
    const user = userEvent.setup();
    vi.mocked(copyPngToClipboard)
      .mockRejectedValueOnce(new Error("clipboard busy"))
      .mockResolvedValue(undefined);
    render(<App />);

    const copyButton = await screen.findByRole("button", { name: "Copy image" });
    await user.click(copyButton);
    expect(copyButton).toHaveAttribute("data-state", "error");
    expect(copyButton).toHaveAttribute("title", "clipboard busy");
    await user.click(copyButton);

    expect(copyPngToClipboard).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status", { name: "Image action status" })).toHaveTextContent("Copied");
  });

  it("keeps the toolbar, editor, and copied SVG on the same local date across midnight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 5, 23, 59, 59, 900));
    const emptyChart = { ...createStarterChart("2026-08-05"), tasks: [] };
    vi.mocked(loadChart).mockResolvedValue(emptyChart);
    let stagedSvg: SVGSVGElement | null = null;
    vi.mocked(svgToPngArtifact).mockImplementation(async (svg) => {
      stagedSvg = svg.cloneNode(true) as SVGSVGElement;
      return artifact;
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    const rangeTrigger = await screen.findByRole("button", { name: "Choose timeline range" });
    expect(rangeTrigger).toHaveTextContent("Jul 28, 2026 – Aug 13, 2026");
    const editorSvg = screen.getByRole("group", { name: "Execution Timeline Gantt chart" }) as unknown as SVGSVGElement;
    expectTodayAlignedWith(editorSvg, "08/05");

    await act(async () => vi.advanceTimersByTimeAsync(100));
    await user.click(screen.getByRole("button", { name: "Copy image" }));

    expect(editorSvg.textContent).toContain("07/29");
    expect(editorSvg.textContent).toContain("08/14");
    expectTodayAlignedWith(editorSvg, "08/06");
    expect(stagedSvg).not.toBeNull();
    expect(stagedSvg!.textContent).toContain("07/29");
    expect(stagedSvg!.textContent).toContain("08/14");
    expectTodayAlignedWith(stagedSvg!, "08/06");
    expect(rangeTrigger).toHaveTextContent("Jul 29, 2026 – Aug 14, 2026");
  });
});
