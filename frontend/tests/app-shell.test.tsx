import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";

describe("App shell", () => {
  it("shows the product name and primary chart actions", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Gantt Chart Creator" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export PNG" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Chart settings" })).toBeEnabled();
  });
});
