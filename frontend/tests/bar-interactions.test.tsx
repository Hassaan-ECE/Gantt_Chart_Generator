import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

afterEach(cleanup);

describe("bar pointer interactions", () => {
  it("previews during movement and commits once on pointer release", () => {
    const chart = createStarterChart("2026-08-04");
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={chart.tasks[0].id}
        onPreviewTask={onPreviewTask}
        onCommitTask={onCommitTask}
      />,
    );
    const bar = screen.getAllByTestId("task-bar")[0];
    Object.defineProperty(bar, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(bar, "releasePointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 248 });
    expect(onPreviewTask).toHaveBeenCalled();
    expect(onCommitTask).not.toHaveBeenCalled();
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 248 });
    expect(onCommitTask).toHaveBeenCalledTimes(1);
  });

  it("clears its preview without committing when the pointer is canceled", () => {
    const chart = createStarterChart("2026-08-04");
    const onPreviewTask = vi.fn();
    const onCommitTask = vi.fn();
    render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={chart.tasks[0].id}
        onPreviewTask={onPreviewTask}
        onCommitTask={onCommitTask}
      />,
    );
    const bar = screen.getAllByTestId("task-bar")[0];
    Object.defineProperty(bar, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(bar, { pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(bar, { pointerId: 2, clientX: 248 });
    fireEvent.pointerCancel(bar, { pointerId: 2 });
    expect(onPreviewTask).toHaveBeenLastCalledWith(null);
    expect(onCommitTask).not.toHaveBeenCalled();
  });
});
