import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { InlineChartTitle } from "@/gantt/InlineChartTitle";

afterEach(cleanup);

it("does not commit or autosave when an unchanged title loses focus", async () => {
  const user = userEvent.setup();
  const onCommit = vi.fn();
  render(
    <div>
      <InlineChartTitle value="Execution Timeline" onCommit={onCommit} />
      <button type="button">Outside</button>
    </div>,
  );

  await user.click(screen.getByRole("textbox", { name: "Chart title" }));
  await user.click(screen.getByRole("button", { name: "Outside" }));

  expect(onCommit).not.toHaveBeenCalled();
});
