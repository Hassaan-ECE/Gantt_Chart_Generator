import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

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
});
