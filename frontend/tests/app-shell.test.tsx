import { act, cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByLabelText("Task name")).toHaveValue("New task");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-08-04");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-08-06");
    await user.click(screen.getByRole("button", { name: "Save task" }));
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
});
