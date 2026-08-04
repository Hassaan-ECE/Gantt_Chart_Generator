import { describe, expect, it } from "vitest";

import { moveTaskByVisibleSteps, resizeTaskByVisibleSteps } from "@/gantt/taskOperations";

const task = {
  id: "a",
  name: "Task",
  startDate: "2026-08-07",
  endDate: "2026-08-10",
  category: "Build",
  color: "#00b95a",
};
const weekdays = { showSaturday: false, showSunday: false };

describe("direct task operations", () => {
  it("moves one visible step across a hidden weekend and preserves calendar duration", () => {
    expect(moveTaskByVisibleSteps(task, 1, weekdays)).toMatchObject({ startDate: "2026-08-10", endDate: "2026-08-13" });
  });

  it("resizes the right edge to the next visible day", () => {
    expect(resizeTaskByVisibleSteps(task, "end", 1, weekdays).endDate).toBe("2026-08-11");
  });

  it("clamps the left edge so duration remains at least one day", () => {
    expect(resizeTaskByVisibleSteps(task, "start", 10, weekdays).startDate).toBe(task.endDate);
  });
});
