import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChartDocument } from "@/gantt/model";
import { createStarterChart } from "@/gantt/starterChart";
import { useAutosave } from "@/gantt/useAutosave";
import { saveChart } from "@/integrations/tauri/chartBridge";

vi.mock("@/integrations/tauri/chartBridge", () => ({ saveChart: vi.fn() }));

function Harness({ document, enabled }: { document: ChartDocument; enabled: boolean }) {
  const autosave = useAutosave(document, enabled);
  return (
    <div>
      <span>{autosave.phase}</span>
      <span>{autosave.message}</span>
      <button type="button" onClick={autosave.retry}>Retry</button>
    </div>
  );
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(saveChart).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("waits 300 ms after a committed document change", async () => {
    const initial = createStarterChart("2026-08-04");
    const changed = { ...initial, title: "Updated execution timeline" };
    const { rerender } = render(<Harness document={initial} enabled={false} />);

    rerender(<Harness document={changed} enabled />);
    act(() => vi.advanceTimersByTime(299));
    expect(saveChart).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(saveChart).toHaveBeenCalledExactlyOnceWith(changed);
    expect(screen.getByText("saved")).toBeVisible();
  });

  it("debounces several changes and saves only the latest document", async () => {
    const initial = createStarterChart("2026-08-04");
    const first = { ...initial, title: "First title" };
    const latest = { ...initial, title: "Latest title" };
    const { rerender } = render(<Harness document={initial} enabled={false} />);

    rerender(<Harness document={first} enabled />);
    act(() => vi.advanceTimersByTime(200));
    rerender(<Harness document={latest} enabled />);
    act(() => vi.advanceTimersByTime(299));
    expect(saveChart).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(saveChart).toHaveBeenCalledExactlyOnceWith(latest);
  });

  it("retains the latest unsaved document and retries it immediately", async () => {
    const initial = createStarterChart("2026-08-04");
    const failed = { ...initial, title: "Failed title" };
    const latest = { ...initial, title: "Retry this title" };
    vi.mocked(saveChart)
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValue(undefined);
    const { rerender } = render(<Harness document={initial} enabled={false} />);

    rerender(<Harness document={failed} enabled />);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByText("error")).toBeVisible();
    expect(screen.getByText("disk unavailable")).toBeVisible();

    rerender(<Harness document={latest} enabled />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));

    expect(saveChart).toHaveBeenNthCalledWith(2, latest);
    expect(screen.getByText("saved")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(saveChart).toHaveBeenCalledTimes(2);
  });
});
