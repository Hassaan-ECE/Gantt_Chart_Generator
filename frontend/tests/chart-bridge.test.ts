import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadChart, saveChart } from "@/integrations/tauri/chartBridge";
import { createStarterChart } from "@/gantt/starterChart";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("chart persistence bridge", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("loads and parses the persisted chart document", async () => {
    const document = createStarterChart("2026-08-04");
    vi.mocked(invoke).mockResolvedValue(document);

    await expect(loadChart()).resolves.toEqual(document);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("load_chart");
  });

  it("returns null when no persisted chart exists", async () => {
    vi.mocked(invoke).mockResolvedValue(null);

    await expect(loadChart()).resolves.toBeNull();
  });

  it("saves the chart using the document command argument", async () => {
    const document = createStarterChart("2026-08-04");
    vi.mocked(invoke).mockResolvedValue(undefined);

    await saveChart(document);

    expect(invoke).toHaveBeenCalledExactlyOnceWith("save_chart", { document });
  });
});
