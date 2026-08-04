import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsMenu } from "@/gantt/SettingsMenu";

afterEach(cleanup);

describe("SettingsMenu", () => {
  it("changes Saturday and Sunday independently", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsMenu settings={{ showSaturday: false, showSunday: false }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Chart settings" }));
    await user.click(screen.getByRole("checkbox", { name: "Show Saturday" }));
    expect(onChange).toHaveBeenCalledWith({ showSaturday: true, showSunday: false });
  });
});
