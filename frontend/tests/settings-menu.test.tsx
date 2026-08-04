import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsMenu } from "@/gantt/SettingsMenu";

afterEach(cleanup);

describe("SettingsMenu", () => {
  it("changes Saturday and Sunday independently", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SettingsMenu settings={{ showSaturday: false, showSunday: false }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Chart settings" }));
    await user.click(screen.getByRole("checkbox", { name: "Show Sunday" }));
    expect(onChange).toHaveBeenLastCalledWith({ showSaturday: false, showSunday: true });

    rerender(<SettingsMenu settings={{ showSaturday: false, showSunday: true }} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Show Saturday" }));
    expect(onChange).toHaveBeenLastCalledWith({ showSaturday: true, showSunday: true });
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<SettingsMenu settings={{ showSaturday: false, showSunday: false }} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Chart settings" });
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Chart settings options" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when a pointer press occurs outside the menu", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SettingsMenu settings={{ showSaturday: false, showSunday: false }} onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Chart settings" }));

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("group", { name: "Chart settings options" })).not.toBeInTheDocument();
  });
});
