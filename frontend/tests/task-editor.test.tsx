import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskEditorDialog } from "@/gantt/TaskEditorDialog";

const task = { id: "task-1", name: "Build", startDate: "2026-08-04", endDate: "2026-08-06", category: "IRHX", color: "#00b95a" };

afterEach(cleanup);

describe("TaskEditorDialog", () => {
  it("edits exact dates and returns a validated task", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TaskEditorDialog mode="edit" task={task} onSave={onSave} onCancel={vi.fn()} onDelete={vi.fn()} />);
    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-08-08");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ endDate: "2026-08-08" }));
  });

  it("keeps the dialog open when the end precedes the start", async () => {
    const user = userEvent.setup();
    render(<TaskEditorDialog mode="edit" task={task} onSave={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />);
    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(screen.getByText("End date cannot be before start date.")).toBeVisible();
  });

  it("discards draft changes when cancelled", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(<TaskEditorDialog mode="edit" task={task} onSave={onSave} onCancel={vi.fn()} onDelete={onDelete} />);
    await user.clear(screen.getByLabelText("Task name"));
    await user.type(screen.getByLabelText("Task name"), "Changed task");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
