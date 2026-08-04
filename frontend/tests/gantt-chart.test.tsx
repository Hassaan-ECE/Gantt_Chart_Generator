import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

afterEach(cleanup);

describe("GanttChart", () => {
  it("renders task names, date headers, bars, and legend", () => {
    render(<GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />);
    expect(screen.getByRole("img", { name: "Execution Timeline Gantt chart" })).toBeVisible();
    expect(screen.getAllByTestId("task-bar").length).toBeGreaterThan(0);
    expect(screen.getByText("IRHX")).toBeVisible();
    expect(screen.getByText("Tue")).toBeVisible();
  });

  it("omits editor-only handles in export mode", () => {
    const chart = createStarterChart("2026-08-04");
    const { rerender } = render(<GanttChart document={chart} mode="editor" selectedTaskId={chart.tasks[0].id} />);
    expect(screen.getAllByTestId("resize-handle")).toHaveLength(2);
    rerender(<GanttChart document={chart} mode="export" selectedTaskId={chart.tasks[0].id} />);
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
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
});
