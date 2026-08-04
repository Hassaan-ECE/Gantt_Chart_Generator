const WINDOWS_INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;
const PNG_EXTENSION = /(?:\.png)+$/i;
const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
const SVG_PRESENTATION_PROPERTIES = [
  "alignment-baseline",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "opacity",
  "paint-order",
  "shape-rendering",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "text-rendering",
  "vector-effect",
] as const;

function svgDimensions(source: SVGSVGElement): { width: number; height: number } {
  const width = Number(source.getAttribute("width"));
  const height = Number(source.getAttribute("height"));
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Invalid SVG dimensions");
  }
  return { width, height };
}

export function sanitizeExportFilename(title: string): string {
  const withoutControlCharacters = Array.from(title)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  const sanitized = withoutControlCharacters
    .replace(WINDOWS_INVALID_FILENAME_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(PNG_EXTENSION, "")
    .replace(/[. ]+$/g, "");
  const safeBasename = WINDOWS_RESERVED_BASENAME.test(sanitized) ? "" : sanitized;
  return `${safeBasename || "Gantt Chart"}.png`;
}

function inlineComputedPresentation(source: SVGSVGElement, clone: SVGSVGElement): void {
  const sourceElements = [source, ...source.querySelectorAll<SVGElement>("*")];
  const cloneElements = [clone, ...clone.querySelectorAll<SVGElement>("*")];
  const view = source.ownerDocument.defaultView;
  if (!view) return;

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index];
    if (!cloneElement) return;
    const computedStyle = view.getComputedStyle(sourceElement);
    SVG_PRESENTATION_PROPERTIES.forEach((property) => {
      const value = computedStyle.getPropertyValue(property);
      if (value) cloneElement.style.setProperty(property, value);
    });
  });
}

export function prepareExportSvg(source: SVGSVGElement): SVGSVGElement {
  const { width, height } = svgDimensions(source);
  const clone = source.cloneNode(true) as SVGSVGElement;
  inlineComputedPresentation(source, clone);
  clone.querySelectorAll("[data-editor-only='true']").forEach((node) => node.remove());
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const background = clone.querySelector<SVGElement>("[data-export-background='true']");
  background?.setAttribute("fill", "#ffffff");
  background?.style.setProperty("fill", "#ffffff");
  return clone;
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load SVG for PNG export"));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode PNG"));
    }, "image/png");
  });
}

export async function svgToPngBytes(source: SVGSVGElement, scale = 2): Promise<Uint8Array> {
  const { width, height } = svgDimensions(source);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid SVG dimensions");

  const prepared = prepareExportSvg(source);
  const serialized = new XMLSerializer().serializeToString(prepared);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadSvgImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create PNG canvas context");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToPngBlob(canvas);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
