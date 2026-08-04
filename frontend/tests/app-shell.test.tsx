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

afterEach(cleanup);

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
});
