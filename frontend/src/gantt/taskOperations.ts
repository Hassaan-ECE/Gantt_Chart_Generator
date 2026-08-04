import { addCalendarDays, addVisibleDays, calendarDayDifference } from "@/gantt/dateMath";
import type { ChartSettings, GanttTask } from "@/gantt/model";

export function moveTaskByVisibleSteps(task: GanttTask, steps: number, settings: ChartSettings): GanttTask {
  const duration = calendarDayDifference(task.startDate, task.endDate);
  const startDate = addVisibleDays(task.startDate, steps, settings);
  return { ...task, startDate, endDate: addCalendarDays(startDate, duration) };
}

export function resizeTaskByVisibleSteps(
  task: GanttTask,
  edge: "start" | "end",
  steps: number,
  settings: ChartSettings,
): GanttTask {
  if (edge === "start") {
    const proposed = addVisibleDays(task.startDate, steps, settings);
    return { ...task, startDate: proposed > task.endDate ? task.endDate : proposed };
  }

  const proposed = addVisibleDays(task.endDate, steps, settings);
  return { ...task, endDate: proposed < task.startDate ? task.startDate : proposed };
}
