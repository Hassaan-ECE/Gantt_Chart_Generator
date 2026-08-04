import { describe, expect, it } from "vitest";

import { prepareExportSvg, sanitizeExportFilename, svgToPngBytes } from "@/gantt/exportPng";

describe("PNG export preparation", () => {
  it("sanitizes a chart title for Windows", () => {
    expect(sanitizeExportFilename("Execution: Timeline / Week 32")).toBe("Execution Timeline Week 32.png");
  });

  it("falls back for an empty filename and appends the extension exactly once", () => {
    expect(sanitizeExportFilename(" <>:\"/\\|?*... ")).toBe("Gantt Chart.png");
    expect(sanitizeExportFilename("Roadmap.PNG")).toBe("Roadmap.png");
  });

  it("removes editor-only elements and fixes a white background", () => {
    document.body.innerHTML = `<svg width="800" height="400"><rect data-export-background="true" fill="transparent"/><g data-editor-only="true"><circle/></g><text>Task</text></svg>`;
    const source = document.querySelector("svg")!;
    const result = prepareExportSvg(source);

    expect(result).not.toBe(source);
    expect(result.querySelector("[data-editor-only='true']")).toBeNull();
    expect(result.querySelector("[data-export-background='true']")?.getAttribute("fill")).toBe("#ffffff");
    expect(result.getAttribute("viewBox")).toBe("0 0 800 400");
    expect(result.getAttribute("width")).toBe("800");
    expect(result.getAttribute("height")).toBe("400");
  });

  it("rejects rasterization when SVG dimensions are invalid", async () => {
    document.body.innerHTML = `<svg width="0" height="400"></svg>`;

    await expect(svgToPngBytes(document.querySelector("svg")!)).rejects.toThrow("Invalid SVG dimensions");
  });
});
