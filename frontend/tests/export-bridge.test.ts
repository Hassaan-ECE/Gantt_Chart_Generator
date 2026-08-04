import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { svgToPngBytes } from "@/gantt/exportPng";
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
  return { ...actual, svgToPngBytes: vi.fn() };
});

describe("PNG export bridge", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    vi.mocked(save).mockReset().mockResolvedValue(null);
    vi.mocked(loadChart).mockReset().mockResolvedValue(null);
    vi.mocked(saveChart).mockReset().mockResolvedValue(undefined);
    vi.mocked(svgToPngBytes).mockReset().mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
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
    await user.click(screen.getByRole("button", { name: "Export PNG" }));

    expect(svgToPngBytes).toHaveBeenCalledTimes(1);
    const exportSvg = vi.mocked(svgToPngBytes).mock.calls[0][0];
    expect(exportSvg).toBeInstanceOf(SVGSVGElement);
    expect(exportSvg.closest("[aria-hidden='true']")).not.toBeNull();
    expect(exportSvg.querySelector("[data-testid='task-hit-target']")).toBeNull();
    expect(svgToPngBytes).toHaveBeenCalledWith(exportSvg, 2);
    expect(await screen.findByText("PNG exported")).toBeVisible();
    expect(title).toHaveValue(titleBeforeExport);
    expect(invoke).toHaveBeenCalledWith("write_png", {
      path: "C:\\Exports\\chart.png",
      bytes: [137, 80, 78, 71],
    });
  });
});
