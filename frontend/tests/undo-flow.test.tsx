import { cleanup, render, screen, within } from "@testing-library/react";
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
    const dialog = screen.getByRole("dialog");
    const nameField = within(dialog).getByLabelText("Task name");
    await user.clear(nameField);
    await user.type(nameField, "Prepare weekly review");
    await user.click(within(dialog).getByRole("button", { name: "Save task" }));
    expect(screen.getByDisplayValue("Prepare weekly review")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByDisplayValue("Prepare weekly review")).not.toBeInTheDocument();
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

  it("undoes an inline task rename", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Gantt chart workspace");
    const names = await screen.findAllByRole("textbox", { name: "Task name" });
    const taskName = names[0];
    const previous = (taskName as HTMLInputElement).value;
    await user.click(taskName);
    await user.clear(taskName);
    await user.type(taskName, "Undoable rename{Enter}");
    expect(taskName).toHaveValue("Undoable rename");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByRole("textbox", { name: "Task name" })[0]).toHaveValue(previous);
  });
});
