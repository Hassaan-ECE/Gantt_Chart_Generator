import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GanttChart", () => {
  it("fits the requested viewport and keeps an unlabeled current-day marker in front", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00"));
    render(
      <GanttChart
        document={createStarterChart("2026-08-04")}
        mode="editor"
        selectedTaskId={null}
        viewport={{ width: 800, height: 420 }}
      />,
    );

    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute("width", "800");
    expect(svg).toHaveAttribute("height", "420");
    expect(svg.querySelector(".gantt-today-label")).toBeNull();
    const marker = svg.querySelector(".gantt-today");
    expect(marker).not.toBeNull();
    expect(marker).toBe(svg.lastElementChild);
  });

  it("renders task names, date headers, bars, and legend", () => {
    render(<GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />);
    expect(screen.getByRole("img", { name: "Execution Timeline Gantt chart" })).toBeVisible();
    expect(screen.getAllByTestId("task-bar").length).toBeGreaterThan(0);
    expect(screen.getByText("IRHX")).toBeVisible();
    expect(screen.getAllByText("Tue")[0]).toBeVisible();
  });

  it("labels every visible date column across multiple weeks", () => {
    const { container } = render(
      <GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />,
    );

    const weekdayLabels = Array.from(container.querySelectorAll(".gantt-date-weekday"));
    expect(weekdayLabels).toHaveLength(8);
    expect(weekdayLabels.every((label) => label.textContent?.trim())).toBe(true);
    expect(screen.getAllByText("Tue")).toHaveLength(2);
  });

  it("marks today at its visible date column without redundant text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00"));
    const { container } = render(
      <GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />,
    );

    expect(container.querySelector(".gantt-today")).not.toBeNull();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("omits editor-only handles in export mode", () => {
    const chart = createStarterChart("2026-08-04");
    const { rerender } = render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);
    expect(screen.getAllByTestId("resize-handle")).toHaveLength(2);
    rerender(<GanttChart document={chart} mode="export" selectedTaskId={chart.tasks[0].id} />);
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });

  it("outlines the selected editor task bar", () => {
    const chart = createStarterChart("2026-08-04");
    render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);

    expect(screen.getAllByTestId("task-bar")[0]).toHaveAttribute("stroke", "#1d4ed8");
    expect(screen.getAllByTestId("task-bar")[0]).toHaveAttribute("stroke-width", "2");
    expect(screen.getAllByRole("button", { name: /task$/ })[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps export bars passive without editor hit targets or callbacks", () => {
    const chart = createStarterChart("2026-08-04");
    const selectedTaskIds: string[] = [];
    render(
      <GanttChart
        document={chart}
        mode="export"
        selectedTaskId={chart.tasks[0].id}
        onSelectTask={(taskId) => selectedTaskIds.push(taskId)}
      />,
    );

    fireEvent.click(screen.getAllByTestId("task-bar-group")[0]);
    expect(screen.queryByTestId("task-hit-target")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(selectedTaskIds).toEqual([]);
  });

  it("makes editor task bars keyboard controls for selection and editing", () => {
    const chart = createStarterChart("2026-08-04");
    const selectedTaskIds: string[] = [];
    const editedTaskIds: string[] = [];
    render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={null}
        onSelectTask={(taskId) => selectedTaskIds.push(taskId)}
        onEditTask={(taskId) => editedTaskIds.push(taskId)}
      />,
    );

    const taskControl = screen.getByRole("button", { name: `${chart.tasks[0].name} task` });
    expect(taskControl).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(taskControl, { key: "Enter" });
    fireEvent.keyDown(taskControl, { key: " " });
    expect(selectedTaskIds).toEqual([chart.tasks[0].id]);
    expect(editedTaskIds).toEqual([chart.tasks[0].id]);
  });

  it("edits the first task when its bar is double-clicked", () => {
    const chart = createStarterChart("2026-08-04");
    const onEditTask = vi.fn();
    render(<GanttChart document={chart} mode="editor" selectedTaskId={null} onEditTask={onEditTask} />);

    fireEvent.doubleClick(screen.getAllByTestId("task-bar")[0]);

    expect(onEditTask).toHaveBeenCalledWith(chart.tasks[0].id);
  });
});
