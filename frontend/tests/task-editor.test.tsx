import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskEditorDialog } from "@/gantt/TaskEditorDialog";

const task = { id: "task-1", name: "Build", startDate: "2026-08-04", endDate: "2026-08-06", category: "IRHX", color: "#00b95a" };

let showModal: ReturnType<typeof vi.fn>;
let closeModal: ReturnType<typeof vi.fn>;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

beforeEach(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  closeModal = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: closeModal });
});

afterEach(() => {
  cleanup();
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else delete (HTMLDialogElement.prototype as { close?: unknown }).close;
});

describe("TaskEditorDialog", () => {
  it("opens modally, focuses the task name, and closes when unmounted", () => {
    const { unmount } = render(<TaskEditorDialog mode="edit" task={task} onSave={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />);

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Task name")).toHaveFocus();

    unmount();

    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("cancels when the native dialog receives Escape", () => {
    const onCancel = vi.fn();
    render(<TaskEditorDialog mode="edit" task={task} onSave={vi.fn()} onCancel={onCancel} onDelete={vi.fn()} />);

    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

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

  it.each(["2026-02-30", "2026-8-04"])("rejects invalid calendar date %s", async (startDate) => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TaskEditorDialog mode="edit" task={{ ...task, startDate }} onSave={onSave} onCancel={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save task" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Start date must use a valid YYYY-MM-DD value.")).toBeVisible();
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
