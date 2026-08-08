import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { createStarterChart } from "@/gantt/starterChart";
import { loadChart, saveChart } from "@/integrations/tauri/chartBridge";

vi.mock("@/integrations/tauri/chartBridge", () => ({
  loadChart: vi.fn(),
  saveChart: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(loadChart).mockReset().mockResolvedValue(null);
  vi.mocked(saveChart).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("App shell", () => {
  it("moves title editing into the chart and clears selection from blank chart space", async () => {
    const user = userEvent.setup();
    render(<App />);

    const chartTitle = await screen.findByRole("textbox", { name: "Chart title" });
    expect(chartTitle).toHaveClass("gantt-inline-title");
    expect(chartTitle.closest(".toolbar")).toBeNull();

    const task = screen.getByRole("button", { name: "Support PCS testing task" });
    await user.click(task);
    expect(task).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("chart-background"));
    expect(task).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });

  it("clears selected resize handles with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    const task = await screen.findByRole("button", { name: "Support PCS testing task" });
    await user.click(task);
    expect(screen.getAllByTestId("resize-handle")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });

  it("commits direct title edits and restores the focused value on Escape", async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = await screen.findByRole("textbox", { name: "Chart title" }) as HTMLInputElement;

    await user.click(title);
    expect(title.selectionStart).toBe(0);
    expect(title.selectionEnd).toBe("Execution Timeline".length);
    await user.clear(title);
    await user.type(title, "Weekly Review{Enter}");
    expect(title).toHaveValue("Weekly Review");

    await user.click(title);
    await user.clear(title);
    await user.type(title, "Discard this{Escape}");
    expect(title).toHaveValue("Weekly Review");
  });

  it("shows the product name and primary chart actions after startup", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: "Add task" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Gantt Chart Creator" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Export PNG" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Chart settings" })).toBeEnabled();
  });

  it("uses a valid persisted chart at startup", async () => {
    const persisted = { ...createStarterChart("2026-08-04"), title: "Persisted roadmap" };
    vi.mocked(loadChart).mockResolvedValue(persisted);

    render(<App />);

    expect(await screen.findByRole("textbox", { name: "Chart title" })).toHaveValue("Persisted roadmap");
    expect(saveChart).not.toHaveBeenCalled();
  });

  it("persists a custom timeline range and removes it when Auto-fit is restored", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(loadChart).mockResolvedValue(createStarterChart("2026-08-04"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Choose timeline range" }));
    await user.clear(screen.getByRole("textbox", { name: "Timeline start" }));
    await user.type(screen.getByRole("textbox", { name: "Timeline start" }), "2026-08-05");
    await user.clear(screen.getByRole("textbox", { name: "Timeline end" }));
    await user.type(screen.getByRole("textbox", { name: "Timeline end" }), "2026-08-28");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(saveChart).toHaveBeenLastCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        timelineRange: { startDate: "2026-08-05", endDate: "2026-08-28" },
      }),
    }));

    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
    await user.click(screen.getByRole("button", { name: "Auto-fit" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));

    const lastSavedDocument = vi.mocked(saveChart).mock.calls.at(-1)?.[0];
    expect(lastSavedDocument?.settings).not.toHaveProperty("timelineRange");
  });

  it("shows a persisted custom timeline range at startup", async () => {
    const persisted = createStarterChart("2026-08-04");
    persisted.settings.timelineRange = { startDate: "2026-08-05", endDate: "2026-08-28" };
    vi.mocked(loadChart).mockResolvedValue(persisted);

    render(<App />);

    expect(await screen.findByRole("button", { name: "Choose timeline range" }))
      .toHaveTextContent("Aug 5, 2026 – Aug 28, 2026");
  });

  it("preserves invalid source data until reset is explicitly requested", async () => {
    const user = userEvent.setup();
    vi.mocked(loadChart).mockRejectedValue(new Error("invalid chart file"));

    render(<App />);

    expect(await screen.findByText("invalid chart file")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
    expect(saveChart).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reset to starter chart" }));

    expect(saveChart).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Add task" })).toBeEnabled();
  });

  it("normalizes a blank chart title when editing finishes", async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = await screen.findByRole("textbox", { name: "Chart title" });

    await user.clear(title);
    await user.type(title, "   ");
    await user.tab();

    expect(title).toHaveValue("Untitled Gantt Chart");
  });

  it("adds a task with the default values and a generated ID", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "generated-task-id") });
    vi.mocked(loadChart).mockResolvedValue(createStarterChart("2026-08-04"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Add task" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Task name")).toHaveValue("New task");
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-08-04");
    expect(within(dialog).getByLabelText("End date")).toHaveValue("2026-08-06");
    await user.click(within(dialog).getByRole("button", { name: "Save task" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(saveChart).toHaveBeenLastCalledWith(expect.objectContaining({
      tasks: expect.arrayContaining([expect.objectContaining({
        id: "generated-task-id",
        name: "New task",
        category: "General",
        color: "#2f55cf",
      })]),
    }));
  });

  it("defaults a new task to the custom timeline start", async () => {
    const persisted = createStarterChart("2026-08-04");
    persisted.settings.timelineRange = { startDate: "2026-08-05", endDate: "2026-08-28" };
    vi.mocked(loadChart).mockResolvedValue(persisted);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Add task" }));

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-08-05");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-08-07");
  });
});
