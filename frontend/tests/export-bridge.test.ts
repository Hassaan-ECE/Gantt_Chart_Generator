import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { svgToPngArtifact, type PngArtifact } from "@/gantt/exportPng";
import { loadChart, saveChart } from "@/integrations/tauri/chartBridge";
import { choosePngDestination, writePng } from "@/integrations/tauri/exportBridge";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@/integrations/tauri/chartBridge", () => ({
  loadChart: vi.fn(),
  saveChart: vi.fn(),
}));
vi.mock("@/gantt/exportPng", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/gantt/exportPng")>();
  return { ...actual, svgToPngArtifact: vi.fn() };
});

const artifact: PngArtifact = {
  blob: new Blob([], { type: "image/png" }),
  bytes: new Uint8Array([137, 80, 78, 71]),
};

describe("PNG export bridge", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    vi.mocked(save).mockReset().mockResolvedValue(null);
    vi.mocked(loadChart).mockReset().mockResolvedValue(null);
    vi.mocked(saveChart).mockReset().mockResolvedValue(undefined);
    vi.mocked(svgToPngArtifact).mockReset().mockResolvedValue(artifact);
  });

  afterEach(cleanup);

  it("chooses a PNG destination using the sanitized title", async () => {
    vi.mocked(save).mockResolvedValue("C:\\Exports\\chart.png");

    await expect(choosePngDestination("Execution: Timeline")).resolves.toBe("C:\\Exports\\chart.png");
    expect(save).toHaveBeenCalledExactlyOnceWith({
      defaultPath: "Execution Timeline.png",
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
  });

  it("returns null when destination selection is cancelled", async () => {
    await expect(choosePngDestination("Execution Timeline")).resolves.toBeNull();
  });

  it("writes PNG bytes through the Tauri command", async () => {
    await writePng("C:\\Exports\\chart.png", new Uint8Array([137, 80, 78, 71]));

    expect(invoke).toHaveBeenCalledExactlyOnceWith("write_png", {
      path: "C:\\Exports\\chart.png",
      bytes: [137, 80, 78, 71],
    });
  });

  it("exports the full passive chart and reports success without changing chart state", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("C:\\Exports\\chart.png");
    render(createElement(App));

    const title = await screen.findByRole("textbox", { name: "Chart title" });
    const titleBeforeExport = title.getAttribute("value");
    const exportButton = screen.getByRole("button", { name: "Export PNG" });
    expect(exportButton).toHaveTextContent("");
    await user.click(exportButton);

    expect(svgToPngArtifact).toHaveBeenCalledTimes(1);
    const exportSvg = vi.mocked(svgToPngArtifact).mock.calls[0][0];
    expect(exportSvg).toBeInstanceOf(SVGSVGElement);
    expect(exportSvg.closest("[aria-hidden='true']")).not.toBeNull();
    expect(exportSvg.querySelector("[data-testid='task-hit-target']")).toBeNull();
    expect(exportSvg).toHaveAttribute("width", "1792");
    expect(exportSvg).toHaveAttribute("height", "952");
    expect(svgToPngArtifact).toHaveBeenCalledWith(exportSvg, 2);
    expect(await screen.findByText("PNG exported")).toBeVisible();
    expect(title).toHaveValue(titleBeforeExport);
    expect(invoke).toHaveBeenCalledWith("write_png", {
      path: "C:\\Exports\\chart.png",
      bytes: [137, 80, 78, 71],
    });
  });

  it("ignores duplicate export clicks while rasterization is in progress", async () => {
    let finishRasterization: ((result: PngArtifact) => void) | undefined;
    vi.mocked(svgToPngArtifact).mockImplementation(() => new Promise((resolve) => {
      finishRasterization = resolve;
    }));
    render(createElement(App));
    const exportButton = await screen.findByRole("button", { name: "Export PNG" });

    act(() => {
      fireEvent.click(exportButton);
      fireEvent.click(exportButton);
    });

    expect(svgToPngArtifact).toHaveBeenCalledTimes(1);
    finishRasterization?.(artifact);
    await waitFor(() => expect(exportButton).toBeEnabled());
  });

  it("returns to idle when the native destination dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(createElement(App));

    const exportButton = await screen.findByRole("button", { name: "Export PNG" });
    await user.click(exportButton);

    expect(svgToPngArtifact).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByText("Preparing PNG…")).not.toBeInTheDocument();
    expect(screen.queryByText("PNG exported")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not export PNG")).not.toBeInTheDocument();
    expect(exportButton).toBeEnabled();
  });

  it("retries from the export icon with the latest chart after rasterization fails", async () => {
    const user = userEvent.setup();
    const exportedTitles: string[] = [];
    vi.mocked(svgToPngArtifact)
      .mockImplementationOnce(async (svg) => {
        exportedTitles.push(svg.querySelector(".gantt-chart-title")?.textContent ?? "");
        throw new Error("canvas failed");
      })
      .mockImplementationOnce(async (svg) => {
        exportedTitles.push(svg.querySelector(".gantt-chart-title")?.textContent ?? "");
        return artifact;
      });
    vi.mocked(save).mockResolvedValue("C:\\Exports\\latest.png");
    render(createElement(App));

    const exportButton = await screen.findByRole("button", { name: "Export PNG" });
    await user.click(exportButton);
    await waitFor(() => expect(exportButton).toHaveAttribute("data-state", "error"));
    expect(exportButton).toHaveAttribute("title", "canvas failed");
    const announcement = screen.getByRole("status", { name: "Image action status" });
    expect(announcement).toHaveTextContent("canvas failed");
    expect(announcement).toHaveClass("sr-only");
    expect(document.querySelector(".image-action-status")).toBeNull();
    expect(save).not.toHaveBeenCalled();

    const title = screen.getByRole("textbox", { name: "Chart title" });
    await user.clear(title);
    await user.type(title, "Latest Roadmap");
    await user.click(exportButton);

    expect(exportedTitles).toEqual(["Execution Timeline", "Latest Roadmap"]);
    expect(save).toHaveBeenCalledWith({
      defaultPath: "Latest Roadmap.png",
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    expect(screen.getByRole("status", { name: "Image action status" })).toHaveTextContent("PNG exported");
  });

  it("shows a retryable error when native PNG writing fails", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("C:\\Exports\\chart.png");
    vi.mocked(invoke).mockRejectedValue(new Error("disk full"));
    render(createElement(App));

    const exportButton = await screen.findByRole("button", { name: "Export PNG" });
    await user.click(exportButton);

    await waitFor(() => expect(exportButton).toHaveAttribute("data-state", "error"));
    expect(exportButton).toHaveAttribute("title", "disk full");
    expect(screen.getByRole("status", { name: "Image action status" })).toHaveTextContent("disk full");
    expect(exportButton).toBeEnabled();
  });
});
