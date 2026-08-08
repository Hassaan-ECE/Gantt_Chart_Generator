import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GanttChart", () => {
  it("uses interactive editor semantics instead of hiding controls inside an image role", () => {
    render(
      <GanttChart
        document={createStarterChart("2026-08-04")}
        mode="editor"
        selectedTaskId={null}
        onTitleCommit={vi.fn()}
      />,
    );

    const chart = screen.getByRole("group", { name: "Execution Timeline Gantt chart" });
    expect(chart.querySelector('[aria-label="Chart title"]')).toBeInTheDocument();
    expect(chart.querySelector('[role="button"]')).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Execution Timeline Gantt chart" })).not.toBeInTheDocument();
  });

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

    const svg = screen.getByRole("group", { name: "Execution Timeline Gantt chart" });
    expect(svg).toHaveAttribute("width", "800");
    expect(svg).toHaveAttribute("height", "420");
    expect(svg.querySelector(".gantt-today-label")).toBeNull();
    const marker = svg.querySelector(".gantt-today");
    expect(marker).not.toBeNull();
    expect(marker).toBe(svg.lastElementChild);
  });

  it("renders task names, date headers, bars, and legend", () => {
    render(<GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />);
    expect(screen.getByRole("group", { name: "Execution Timeline Gantt chart" })).toBeVisible();
    expect(screen.getAllByTestId("task-bar").length).toBeGreaterThan(0);
    expect(screen.getByText("IRHX")).toBeVisible();
    expect(screen.getAllByText("Tue")[0]).toBeVisible();
  });

  it.each([
    ["2026-08-03", "2026-08-14", "detailed-days", "Aug 3"],
    ["2026-08-01", "2026-08-28", "compact-days", "08/03"],
    ["2026-08-01", "2026-10-31", "month-days", "August"],
    ["2026-01-01", "2026-07-01", "month-weeks", "January"],
  ])("renders the %s through %s range with a semantic %s header", (startDate, endDate, tier, label) => {
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate, endDate };
    const { container } = render(<GanttChart document={chart} mode="editor" selectedTaskId={null} />);

    expect(container.querySelector(`.gantt-header[data-tier="${tier}"]`)).not.toBeNull();
    expect(screen.getByText(label)).toBeVisible();
  });

  it("renders week band labels and week dividers for multi-week ranges", () => {
    const chart = {
      ...createStarterChart("2026-08-05"),
      settings: {
        showSaturday: false,
        showSunday: false,
        timelineRange: { startDate: "2026-08-03", endDate: "2026-08-28" },
      },
    };
    render(
      <GanttChart
        document={chart}
        today="2026-08-05"
        mode="export"
        selectedTaskId={null}
        viewport={{ width: 1200, height: 640 }}
      />,
    );

    const weekLabels = document.querySelectorAll(".gantt-week-band-label");
    expect(weekLabels.length).toBeGreaterThan(0);
    expect(
      Array.from(weekLabels).some(
        (node) => node.textContent?.includes("Week of") || node.textContent?.includes("–"),
      ),
    ).toBe(true);
    expect(document.querySelectorAll(".gantt-week-divider").length).toBeGreaterThan(0);
  });

  it("does not render week bands for detailed-days ranges", () => {
    const chart = {
      ...createStarterChart("2026-08-05"),
      settings: {
        showSaturday: false,
        showSunday: false,
        timelineRange: { startDate: "2026-08-03", endDate: "2026-08-14" },
      },
    };
    render(
      <GanttChart
        document={chart}
        today="2026-08-05"
        mode="export"
        selectedTaskId={null}
        viewport={{ width: 1200, height: 640 }}
      />,
    );
    expect(document.querySelectorAll(".gantt-week-band-label")).toHaveLength(0);
    expect(document.querySelectorAll(".gantt-week-divider")).toHaveLength(0);
  });

  it("keeps outside task rows but omits their bars", () => {
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate: "2026-09-01", endDate: "2026-09-14" };
    render(<GanttChart document={chart} mode="editor" selectedTaskId={null} />);

    expect(screen.getAllByTestId("task-row")).toHaveLength(chart.tasks.length);
    chart.tasks.forEach((task) => expect(screen.getByText(task.name)).toBeVisible());
    expect(screen.queryByTestId("task-bar")).not.toBeInTheDocument();
  });

  it("keeps task names prominent by wrapping them before shrinking the type", () => {
    const { container } = render(
      <GanttChart
        document={createStarterChart("2026-08-04")}
        mode="editor"
        selectedTaskId={null}
        viewport={{ width: 709, height: 672 }}
      />,
    );

    const firstTaskName = container.querySelector(".gantt-task-name");
    expect(firstTaskName?.querySelectorAll("tspan")).toHaveLength(2);
    expect(firstTaskName).toHaveStyle({ fontSize: "14px", fontWeight: "700" });
  });

  it("fits wide unbroken task labels without dropping any characters", () => {
    const chart = createStarterChart("2026-08-04");
    const longName = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
    chart.tasks[0] = { ...chart.tasks[0], name: longName };
    const { container } = render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={null}
        viewport={{ width: 709, height: 672 }}
      />,
    );

    const firstTaskName = container.querySelector(".gantt-task-name")!;
    const lines = Array.from(firstTaskName.querySelectorAll("tspan"));
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.textContent).join("")).toBe(longName);
    expect(lines.every((line) => line.getAttribute("lengthAdjust") === "spacingAndGlyphs")).toBe(true);
    expect(lines.every((line) => Number(line.getAttribute("textLength")) <= 709 * 0.5)).toBe(true);
  });

  it("groups task rows without drawing container-like horizontal dividers", () => {
    render(<GanttChart document={createStarterChart("2026-08-04")} mode="editor" selectedTaskId={null} />);

    expect(screen.getAllByTestId("task-row").every((row) => !row.querySelector(".gantt-grid-line"))).toBe(true);
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

  it("omits today when the custom range excludes it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00"));
    const chart = createStarterChart("2026-08-04");
    chart.settings.timelineRange = { startDate: "2026-09-01", endDate: "2026-09-14" };
    const { container } = render(<GanttChart document={chart} mode="editor" selectedTaskId={null} />);

    expect(container.querySelector(".gantt-today")).toBeNull();
  });

  it("shows the current-day seam even when today is a hidden weekend far from every task", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00"));
    const chart = createStarterChart("2026-10-05");
    const { container } = render(
      <GanttChart
        document={chart}
        mode="editor"
        selectedTaskId={null}
        viewport={{ width: 800, height: 420 }}
      />,
    );

    const marker = container.querySelector(".gantt-today-marker");
    expect(marker).not.toBeNull();
    expect(Number(marker?.getAttribute("x1"))).toBe(Number(marker?.getAttribute("x2")));
    expect(container.querySelector(".gantt-today")).toBe(container.querySelector(".gantt-chart")?.lastElementChild);
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

  it("renames a task when the inline task name is committed", async () => {
    const user = userEvent.setup();
    const onCommitTask = vi.fn();
    const chart = createStarterChart("2026-08-05");
    render(
      <GanttChart
        document={chart}
        today="2026-08-05"
        mode="editor"
        selectedTaskId={null}
        viewport={{ width: 1200, height: 640 }}
        onCommitTask={onCommitTask}
      />,
    );

    const inputs = screen.getAllByRole("textbox", { name: "Task name" });
    await user.click(inputs[0]);
    await user.clear(inputs[0]);
    await user.type(inputs[0], "Renamed assembly{Enter}");

    expect(onCommitTask).toHaveBeenCalledWith(expect.objectContaining({
      id: chart.tasks[0].id,
      name: "Renamed assembly",
    }));
  });

  it("exports task names as text without inline inputs", () => {
    const chart = createStarterChart("2026-08-05");
    render(
      <GanttChart
        document={chart}
        today="2026-08-05"
        mode="export"
        selectedTaskId={null}
        viewport={{ width: 1200, height: 640 }}
      />,
    );
    expect(screen.queryByRole("textbox", { name: "Task name" })).toBeNull();
    expect(document.querySelector(".gantt-task-name")?.textContent).toContain(chart.tasks[0].name);
  });
});
