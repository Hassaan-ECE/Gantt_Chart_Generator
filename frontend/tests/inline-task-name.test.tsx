import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InlineTaskName } from "@/gantt/InlineTaskName";

afterEach(() => cleanup());

describe("InlineTaskName", () => {
  it("commits a trimmed name on Enter", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTaskName value="Old name" onCommit={onCommit} />);

    const input = screen.getByRole("textbox", { name: "Task name" });
    await user.click(input);
    await user.clear(input);
    await user.type(input, "  New name  {Enter}");

    expect(onCommit).toHaveBeenCalledWith("New name");
  });

  it("restores the previous value on Escape", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTaskName value="Keep me" onCommit={onCommit} />);

    const input = screen.getByRole("textbox", { name: "Task name" });
    await user.click(input);
    await user.clear(input);
    await user.type(input, "Nope{Escape}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Keep me");
  });

  it("restores the previous name when the committed value is blank", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineTaskName value="Keep me" onCommit={onCommit} />);

    const input = screen.getByRole("textbox", { name: "Task name" });
    await user.click(input);
    await user.clear(input);
    await user.tab();

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Keep me");
  });
});
