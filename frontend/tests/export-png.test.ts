import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareExportSvg, sanitizeExportFilename, svgToPngBytes } from "@/gantt/exportPng";

describe("PNG export preparation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.querySelector("[data-export-test-style]")?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sanitizes a chart title for Windows", () => {
    expect(sanitizeExportFilename("Execution: Timeline / Week 32")).toBe("Execution Timeline Week 32.png");
  });

  it("falls back for an empty filename and appends the extension exactly once", () => {
    expect(sanitizeExportFilename(" <>:\"/\\|?*... ")).toBe("Gantt Chart.png");
    expect(sanitizeExportFilename("Roadmap.PNG")).toBe("Roadmap.png");
  });

  it("removes C0 control characters from Windows filenames", () => {
    expect(sanitizeExportFilename("Road\u0000map\u001f 2026")).toBe("Roadmap 2026.png");
  });

  it.each(["CON", "CON.roadmap", "prn.png", "AUX", "nul.PNG", "COM1", "com9.png", "LPT1", "lpt9.PNG"])(
    "replaces the reserved Windows device basename %s",
    (title) => {
      expect(sanitizeExportFilename(title)).toBe("Gantt Chart.png");
    },
  );

  it.each(["COM¹", "COM²", "COM³", "LPT¹", "LPT²", "LPT³"])(
    "replaces the reserved Windows superscript device basename %s",
    (title) => {
      expect(sanitizeExportFilename(title)).toBe("Gantt Chart.png");
    },
  );

  it.each(["COM¹.roadmap", "COM².txt", "COM³.PNG", "LPT¹.roadmap", "LPT².txt", "LPT³.PNG"])(
    "replaces the reserved Windows superscript device basename with extension %s",
    (title) => {
      expect(sanitizeExportFilename(title)).toBe("Gantt Chart.png");
    },
  );

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

  it("overrides an inlined computed background fill with effective white", () => {
    document.head.insertAdjacentHTML("beforeend", `
      <style data-export-test-style>.transparent-export-background { fill: transparent; }</style>
    `);
    document.body.innerHTML = `
      <svg width="800" height="400">
        <rect data-export-background="true" class="transparent-export-background" width="800" height="400"/>
      </svg>
    `;

    const result = prepareExportSvg(document.querySelector("svg")!);
    const background = result.querySelector<SVGRectElement>("[data-export-background='true']")!;
    const serialized = new XMLSerializer().serializeToString(result);

    expect(background.style.fill).toBe("rgb(255, 255, 255)");
    expect(serialized).toContain("fill: rgb(255, 255, 255)");
  });

  it("inlines stylesheet-driven SVG presentation values before serialization", () => {
    document.head.insertAdjacentHTML("beforeend", `
      <style data-export-test-style>
        .export-shape { fill: rgb(18, 52, 86); stroke: rgb(101, 67, 33); stroke-width: 3px; }
        .export-text { fill: rgb(12, 34, 56); font-family: "Export Sans"; font-size: 18px; font-weight: 700; text-anchor: end; dominant-baseline: middle; }
      </style>
    `);
    document.body.innerHTML = `
      <svg width="800" height="400">
        <rect class="export-shape"/>
        <text class="export-text">Styled task</text>
        <g data-editor-only="true"><text class="export-text">Editor control</text></g>
      </svg>
    `;

    const result = prepareExportSvg(document.querySelector("svg")!);
    const shape = result.querySelector<SVGRectElement>(".export-shape")!;
    const text = result.querySelector<SVGTextElement>(".export-text")!;
    const serialized = new XMLSerializer().serializeToString(result);

    expect(shape.style.fill).toBe("rgb(18, 52, 86)");
    expect(shape.style.stroke).toBe("rgb(101, 67, 33)");
    expect(shape.style.strokeWidth).toBe("3px");
    expect(text.style.fill).toBe("rgb(12, 34, 56)");
    expect(text.style.fontFamily).toContain("Export Sans");
    expect(text.style.fontSize).toBe("18px");
    expect(text.style.fontWeight).toBe("700");
    expect(text.style.textAnchor).toBe("end");
    expect(text.style.dominantBaseline).toBe("middle");
    expect(result.querySelector("[data-editor-only='true']")).toBeNull();
    expect(serialized).toContain("stroke-width: 3px");
    expect(serialized).toContain("text-anchor: end");
  });

  it("rejects rasterization when SVG dimensions are invalid", async () => {
    document.body.innerHTML = `<svg width="0" height="400"></svg>`;

    await expect(svgToPngBytes(document.querySelector("svg")!)).rejects.toThrow("Invalid SVG dimensions");
  });

  it("rasterizes at 2x and returns the encoded PNG bytes", async () => {
    const environment = installRasterEnvironment();
    document.body.innerHTML = `<svg width="800" height="400"><text>Task</text></svg>`;

    await expect(svgToPngBytes(document.querySelector("svg")!)).resolves.toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );

    const canvas = environment.toBlob.mock.instances[0] as HTMLCanvasElement;
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(environment.context.scale).toHaveBeenCalledWith(2, 2);
    expect(environment.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 400);
    expect(environment.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(environment.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:gantt-export");
  });

  it("rejects an image load failure and revokes the object URL", async () => {
    const environment = installRasterEnvironment({ imageResult: "error" });
    document.body.innerHTML = `<svg width="800" height="400"></svg>`;

    await expect(svgToPngBytes(document.querySelector("svg")!)).rejects.toThrow(
      "Could not load SVG for PNG export",
    );
    expect(environment.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:gantt-export");
  });

  it("rejects a missing 2D context and revokes the object URL", async () => {
    const environment = installRasterEnvironment({ hasContext: false });
    document.body.innerHTML = `<svg width="800" height="400"></svg>`;

    await expect(svgToPngBytes(document.querySelector("svg")!)).rejects.toThrow(
      "Could not create PNG canvas context",
    );
    expect(environment.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:gantt-export");
  });

  it("rejects a null PNG blob and revokes the object URL", async () => {
    const environment = installRasterEnvironment({ encodedBlob: null });
    document.body.innerHTML = `<svg width="800" height="400"></svg>`;

    await expect(svgToPngBytes(document.querySelector("svg")!)).rejects.toThrow("Could not encode PNG");
    expect(environment.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:gantt-export");
  });
});

interface RasterEnvironmentOptions {
  imageResult?: "load" | "error";
  hasContext?: boolean;
  encodedBlob?: Blob | null;
}

function installRasterEnvironment(options: RasterEnvironmentOptions = {}) {
  const imageResult = options.imageResult ?? "load";
  const createObjectUrl = vi.fn(() => "blob:gantt-export");
  const revokeObjectUrl = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => {
        if (imageResult === "load") this.onload?.();
        else this.onerror?.();
      });
    }
  });

  const context = {
    scale: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    options.hasContext === false ? null : context as unknown as CanvasRenderingContext2D,
  );
  const pngBuffer = new Uint8Array([137, 80, 78, 71]).buffer;
  const encodedBlob = options.encodedBlob === undefined
    ? { arrayBuffer: vi.fn().mockResolvedValue(pngBuffer) } as unknown as Blob
    : options.encodedBlob;
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(callback) {
    callback(encodedBlob);
  });

  return {
    context,
    createObjectUrl,
    revokeObjectUrl,
    toBlob,
  };
}
