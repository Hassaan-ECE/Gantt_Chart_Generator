import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineRangePicker } from "@/gantt/TimelineRangePicker";

const effectiveRange = { startDate: "2026-08-01", endDate: "2026-08-14" };

afterEach(cleanup);

describe("TimelineRangePicker", () => {
  it("exposes the collapsed trigger state and effective range summary", () => {
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Choose timeline range" });
    expect(trigger).toHaveAttribute("title", "Choose timeline range");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveTextContent("Aug 1, 2026 – Aug 14, 2026");
  });

  it("connects the trigger to a labeled dialog", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Choose timeline range" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Choose timeline range" });
    expect(dialog).toHaveAttribute("id");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("applies a valid custom range entered in the styled textboxes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));

    const start = screen.getByRole("textbox", { name: "Timeline start" });
    const end = screen.getByRole("textbox", { name: "Timeline end" });
    expect(start).toHaveAttribute("inputmode", "numeric");
    expect(end).toHaveAttribute("inputmode", "numeric");
    await user.clear(start);
    await user.type(start, "2026-08-05");
    await user.clear(end);
    await user.type(end, "2026-08-28");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ startDate: "2026-08-05", endDate: "2026-08-28" });
    expect(screen.getByRole("button", { name: "Choose timeline range" })).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["incomplete", "", "2026-08-28"],
    ["reversed", "2026-08-28", "2026-08-05"],
    ["invalid calendar date", "2026-02-30", "2026-08-28"],
  ])("silently disables Apply for an %s draft", async (_case, startValue, endValue) => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));

    const start = screen.getByRole("textbox", { name: "Timeline start" });
    const end = screen.getByRole("textbox", { name: "Timeline end" });
    await user.clear(start);
    if (startValue) await user.type(start, startValue);
    await user.clear(end);
    if (endValue) await user.type(end, endValue);

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("switches to auto-fit and closes the popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimelineRangePicker effectiveRange={effectiveRange} customRange={effectiveRange} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
    await user.click(screen.getByRole("button", { name: "Auto-fit" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole("dialog", { name: "Choose timeline range" })).not.toBeInTheDocument();
  });

  it("discards edits when Escape closes the popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Choose timeline range" });
    await user.click(trigger);
    await user.clear(screen.getByRole("textbox", { name: "Timeline start" }));
    await user.type(screen.getByRole("textbox", { name: "Timeline start" }), "2026-08-05");

    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("discards edits when a pointer press occurs outside the picker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <TimelineRangePicker effectiveRange={effectiveRange} onChange={onChange} />
        <button type="button">Outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
    await user.clear(screen.getByRole("textbox", { name: "Timeline end" }));

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Choose timeline range" })).not.toBeInTheDocument();
  });

  it("uses valid grid ownership and range-selection semantics", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));

    const grid = screen.getByRole("grid", { name: "Timeline calendar" });
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(7);
    expect(within(rows[0]).getAllByRole("columnheader")).toHaveLength(7);
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("gridcell")).toHaveLength(7);
    }

    const start = screen.getByRole("button", { name: "Saturday, August 1, 2026" });
    const middle = screen.getByRole("button", { name: "Monday, August 10, 2026" });
    const end = screen.getByRole("button", { name: "Friday, August 14, 2026" });
    expect(start).not.toHaveAttribute("aria-pressed");
    expect(start).toHaveAccessibleDescription("Range start");
    expect(start.closest("[role=gridcell]")).toHaveAttribute("aria-selected", "true");
    expect(middle).toHaveAccessibleDescription("In selected range");
    expect(middle.closest("[role=gridcell]")).toHaveAttribute("aria-selected", "true");
    expect(end).toHaveAccessibleDescription("Range end");
    expect(end.closest("[role=gridcell]")).toHaveAttribute("aria-selected", "true");
  });

  it("renders exactly six weeks of date buttons", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));

    const grid = screen.getByRole("grid", { name: "Timeline calendar" });
    expect(grid.querySelectorAll("button[data-date]")).toHaveLength(42);
  });

  it("moves calendar focus across days and months with roving keys", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
    const augustFirst = screen.getByRole("button", { name: "Saturday, August 1, 2026" });
    augustFirst.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Sunday, August 2, 2026" })).toHaveFocus();

    await user.keyboard("{PageDown}");
    expect(screen.getByRole("button", { name: "Wednesday, September 2, 2026" })).toHaveFocus();
  });

  it("retains focus on month navigation during repeated activation", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));
    const nextMonth = screen.getByRole("button", { name: "Next month" });

    await user.click(nextMonth);
    expect(nextMonth).toHaveFocus();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(nextMonth).toHaveFocus();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("resets the draft and active endpoint from changed props whenever reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole("button", { name: "Choose timeline range" });
    await user.click(trigger);
    await user.clear(screen.getByRole("textbox", { name: "Timeline start" }));
    await user.keyboard("{Escape}");
    rerender(
      <TimelineRangePicker
        effectiveRange={{ startDate: "2026-09-01", endDate: "2026-09-30" }}
        customRange={{ startDate: "2026-09-03", endDate: "2026-09-18" }}
        onChange={vi.fn()}
      />,
    );

    await user.click(trigger);

    expect(screen.getByRole("textbox", { name: "Timeline start" })).toHaveValue("2026-09-03");
    expect(screen.getByRole("textbox", { name: "Timeline end" })).toHaveValue("2026-09-18");
    expect(screen.getByRole("button", { name: "Edit timeline start" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("September 2026")).toBeInTheDocument();
  });

  it("selects calendar endpoints in order and marks the inclusive range", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));

    await user.click(screen.getByRole("button", { name: "Monday, August 10, 2026" }));
    expect(screen.getByRole("textbox", { name: "Timeline start" })).toHaveValue("2026-08-10");
    await user.click(screen.getByRole("button", { name: "Thursday, August 20, 2026" }));

    expect(screen.getByRole("textbox", { name: "Timeline end" })).toHaveValue("2026-08-20");
    expect(screen.getByRole("button", { name: "Monday, August 10, 2026" })).toHaveClass("timeline-range-day--endpoint");
    expect(screen.getByRole("button", { name: "Saturday, August 15, 2026" })).toHaveClass("timeline-range-day--in-range");
    expect(screen.getByRole("button", { name: "Thursday, August 20, 2026" })).toHaveClass("timeline-range-day--endpoint");
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("lets either endpoint be revised explicitly", async () => {
    const user = userEvent.setup();
    render(<TimelineRangePicker effectiveRange={effectiveRange} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Choose timeline range" }));

    await user.click(screen.getByRole("button", { name: "Edit timeline end" }));
    await user.click(screen.getByRole("button", { name: "Tuesday, August 25, 2026" }));

    expect(screen.getByRole("textbox", { name: "Timeline start" })).toHaveValue("2026-08-01");
    expect(screen.getByRole("textbox", { name: "Timeline end" })).toHaveValue("2026-08-25");
  });
});
