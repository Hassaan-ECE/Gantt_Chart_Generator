import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { calculateChartLayout } from "@/gantt/layout";
import { createStarterChart } from "@/gantt/starterChart";

afterEach(cleanup);

function renderEditor(overrides?: {
  onSelectTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onPreviewTask?: (task: ReturnType<typeof createStarterChart>["tasks"][number] | null) => void;
  onCommitTask?: (task: ReturnType<typeof createStarterChart>["tasks"][number]) => void;
}) {
  const chart = createStarterChart("2026-08-04");
  render(
    <GanttChart
      document={chart}
      mode="editor"
      selectedTaskId={chart.tasks[0].id}
      {...overrides}
    />,
  );
  return chart;
}

function installPointerCaptureSpies(element: Element) {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  Object.defineProperty(element, "setPointerCapture", { value: setPointerCapture });
  Object.defineProperty(element, "releasePointerCapture", { value: releasePointerCapture });
  return { setPointerCapture, releasePointerCapture };
}

describe("bar pointer interactions", () => {
  it("maps screen coordinates through the SVG transform at adaptive day widths", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    const chart = createStarterChart("2026-08-04");
    render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={chart.tasks[0].id}
        viewport={{ width: 800, height: 420 }}
        onPreviewTask={onPreviewTask}
        onCommitTask={onCommitTask}
      />,
    );
    const svg = screen.getByRole("group") as unknown as SVGSVGElement;
    Object.defineProperty(svg, "getScreenCTM", {
      configurable: true,
      value: () => ({ inverse: () => ({}) }),
    });
    Object.defineProperty(svg, "createSVGPoint", {
      configurable: true,
      value: () => {
        const point = {
          x: 0,
          y: 0,
          matrixTransform: () => ({ x: point.x * 2, y: point.y * 2 }),
        };
        return point;
      },
    });
    const bar = screen.getAllByTestId("task-bar")[0];
    installPointerCaptureSpies(bar);

    fireEvent.pointerDown(bar, { pointerId: 10, clientX: 100, clientY: 20 });
    fireEvent.pointerMove(bar, { pointerId: 10, clientX: 125, clientY: 20 });
    fireEvent.pointerUp(bar, { pointerId: 10, clientX: 125, clientY: 20 });

    expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2026-08-05",
      endDate: "2026-08-06",
    }));
  });

  it("previews during movement and commits once on pointer release", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    renderEditor({ onPreviewTask, onCommitTask });
    const bar = screen.getAllByTestId("task-bar")[0];
    const { setPointerCapture, releasePointerCapture } = installPointerCaptureSpies(bar);
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 100 });
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 248 });
    expect(onPreviewTask).toHaveBeenCalled();
    expect(onCommitTask).not.toHaveBeenCalled();
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 248 });
    expect(onCommitTask).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("clears its preview without committing when the pointer is canceled", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    renderEditor({ onPreviewTask, onCommitTask });
    const bar = screen.getAllByTestId("task-bar")[0];
    installPointerCaptureSpies(bar);
    fireEvent.pointerDown(bar, { pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 2, clientX: 248 });
    fireEvent.pointerCancel(bar, { pointerId: 2 });
    expect(onPreviewTask).toHaveBeenLastCalledWith(null);
    expect(onCommitTask).not.toHaveBeenCalled();
  });

  it("clears its preview without committing when pointer capture is lost", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    renderEditor({ onPreviewTask, onCommitTask });
    const bar = screen.getAllByTestId("task-bar")[0];
    installPointerCaptureSpies(bar);

    fireEvent.pointerDown(bar, { pointerId: 3, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 3, clientX: 248 });
    fireEvent.lostPointerCapture(bar, { pointerId: 3 });
    fireEvent.pointerUp(bar, { pointerId: 3, clientX: 248 });

    expect(onPreviewTask).toHaveBeenLastCalledWith(null);
    expect(onCommitTask).not.toHaveBeenCalled();
  });

  it("resizes the left handle by visible-day steps", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    renderEditor({ onPreviewTask, onCommitTask });
    const leftHandle = screen.getAllByTestId("resize-handle")[0];
    installPointerCaptureSpies(leftHandle);

    fireEvent.pointerDown(leftHandle, { pointerId: 4, clientX: 100 });
    fireEvent.pointerMove(leftHandle, { pointerId: 4, clientX: 248 });
    fireEvent.pointerUp(leftHandle, { pointerId: 4, clientX: 248 });

    expect(onPreviewTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-05", endDate: "2026-08-05" }));
    expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-05", endDate: "2026-08-05" }));
  });

  it("resizes the right handle by visible-day steps", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    renderEditor({ onPreviewTask, onCommitTask });
    const rightHandle = screen.getAllByTestId("resize-handle")[1];
    installPointerCaptureSpies(rightHandle);

    fireEvent.pointerDown(rightHandle, { pointerId: 5, clientX: 100 });
    fireEvent.pointerMove(rightHandle, { pointerId: 5, clientX: 248 });
    fireEvent.pointerUp(rightHandle, { pointerId: 5, clientX: 248 });

    expect(onPreviewTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-04", endDate: "2026-08-06" }));
    expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-04", endDate: "2026-08-06" }));
  });

  it("does not let resize-handle clicks select or edit the bar", () => {
    const onSelectTask = vi.fn();
    const onEditTask = vi.fn();
    renderEditor({ onSelectTask, onEditTask });

    for (const handle of screen.getAllByTestId("resize-handle")) {
      fireEvent.click(handle);
      fireEvent.doubleClick(handle);
    }

    expect(onSelectTask).not.toHaveBeenCalled();
    expect(onEditTask).not.toHaveBeenCalled();
  });

  it("exposes only the real end handle for a selected left-clipped task", () => {
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate: "2026-08-05", endDate: "2026-08-10" };
    chart.tasks = [{ ...chart.tasks[0], startDate: "2026-08-03", endDate: "2026-08-06" }];
    render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);

    expect(screen.getAllByTestId("resize-handle")).toHaveLength(1);
  });

  it("exposes no handles for a selected task clipped at both endpoints", () => {
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate: "2026-08-05", endDate: "2026-08-10" };
    chart.tasks = [{ ...chart.tasks[0], startDate: "2026-08-03", endDate: "2026-08-12" }];
    render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);

    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });

  it.each([
    ["2026-08-03", "2026-08-14"],
    ["2026-08-01", "2026-08-28"],
    ["2026-08-01", "2026-10-31"],
    ["2026-03-01", "2026-12-01"],
  ])("moves a body bar one day at the rendered width for %s through %s", (startDate, endDate) => {
    const onCommitTask = vi.fn();
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate, endDate };
    chart.tasks = [{ ...chart.tasks[0], startDate: "2026-08-04", endDate: "2026-08-04" }];
    const layout = calculateChartLayout(chart, "2026-08-04");
    render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} onCommitTask={onCommitTask} />);
    const bar = screen.getByTestId("task-bar");
    installPointerCaptureSpies(bar);

    fireEvent.pointerDown(bar, { pointerId: 20, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 20, clientX: 100 + layout.metrics.dayWidth });
    fireEvent.pointerUp(bar, { pointerId: 20, clientX: 100 + layout.metrics.dayWidth });

    expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-05" }));
  });

  it("ignores a competing pointer and its stale lost-capture event", () => {
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    renderEditor({ onPreviewTask, onCommitTask });
    const bar = screen.getAllByTestId("task-bar")[0];
    const { setPointerCapture } = installPointerCaptureSpies(bar);

    fireEvent.pointerDown(bar, { pointerId: 6, clientX: 100 });
    fireEvent.pointerDown(bar, { pointerId: 7, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 7, clientX: 248 });
    fireEvent.lostPointerCapture(bar, { pointerId: 7 });
    fireEvent.pointerMove(bar, { pointerId: 6, clientX: 248 });
    fireEvent.pointerUp(bar, { pointerId: 6, clientX: 248 });

    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(6);
    expect(onPreviewTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-05", endDate: "2026-08-06" }));
    expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-05", endDate: "2026-08-06" }));
  });
});
