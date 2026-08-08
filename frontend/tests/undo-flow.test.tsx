import { cleanup, render, screen } from "@testing-library/react";
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
});

describe("document undo and redo", () => {
  it("disables Undo and Redo after startup load", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("undoes and redoes a committed title edit via the toolbar", async () => {
    const user = userEvent.setup();
    render(<App />);

    const title = await screen.findByRole("textbox", { name: "Chart title" }) as HTMLInputElement;
    await user.click(title);
    await user.clear(title);
    await user.type(title, "Revised Timeline{Enter}");
    expect(title).toHaveValue("Revised Timeline");

    const undoButton = screen.getByRole("button", { name: "Undo" });
    expect(undoButton).toBeEnabled();
    await user.click(undoButton);
    expect(title).toHaveValue("Execution Timeline");

    const redoButton = screen.getByRole("button", { name: "Redo" });
    expect(redoButton).toBeEnabled();
    await user.click(redoButton);
    expect(title).toHaveValue("Revised Timeline");
  });

  it("undoes adding a task", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Add task" });
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.clear(screen.getByLabelText("Task name"));
    await user.type(screen.getByLabelText("Task name"), "Prepare weekly review");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(screen.getByText("Prepare weekly review")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Prepare weekly review")).not.toBeInTheDocument();
  });

  it("does not document-undo with Ctrl+Z while the chart title field is focused", async () => {
    const user = userEvent.setup();
    vi.mocked(loadChart).mockResolvedValue(createStarterChart("2026-08-04"));
    render(<App />);

    const title = await screen.findByRole("textbox", { name: "Chart title" });
    await user.click(title);
    await user.clear(title);
    await user.type(title, "Draft");
    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });
});
