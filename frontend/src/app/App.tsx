import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Copy, Download, Plus } from "lucide-react";

import { APP_DISPLAY_NAME } from "@/app/branding";
import { GanttChart } from "@/gantt/GanttChart";
import { useElementSize } from "@/gantt/useElementSize";
import { addCalendarDays } from "@/gantt/dateMath";
import { svgToPngArtifact } from "@/gantt/exportPng";
import type { GanttTask, TimelineRange } from "@/gantt/model";
import { SettingsMenu } from "@/gantt/SettingsMenu";
import { createStarterChart, currentLocalIsoDate } from "@/gantt/starterChart";
import { TaskEditorDialog } from "@/gantt/TaskEditorDialog";
import { TimelineRangePicker } from "@/gantt/TimelineRangePicker";
import { resolveTimelineRange } from "@/gantt/timelineRange";
import { useAutosave } from "@/gantt/useAutosave";
import { copyPngToClipboard } from "@/integrations/tauri/clipboardBridge";
import { loadChart, saveChart } from "@/integrations/tauri/chartBridge";
import { choosePngDestination, writePng } from "@/integrations/tauri/exportBridge";

type ImageAction = "copy" | "export";
type ImageActionPhase = "idle" | "preparing" | "copied" | "exported" | "error";

function createNewTask(startDate: string): GanttTask {
  return {
    id: crypto.randomUUID(),
    name: "New task",
    startDate,
    endDate: addCalendarDays(startDate, 2),
    category: "General",
    color: "#2f55cf",
  };
}

export function App() {
  const [document, setDocument] = useState(() => createStarterChart());
  const [today, setToday] = useState(currentLocalIsoDate);
  const [startupPhase, setStartupPhase] = useState<"loading" | "ready" | "error">("loading");
  const [startupError, setStartupError] = useState("");
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [previewTask, setPreviewTask] = useState<GanttTask | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [imagePhase, setImagePhase] = useState<ImageActionPhase>("idle");
  const [imageError, setImageError] = useState("");
  const [imageRequest, setImageRequest] = useState<ImageAction | null>(null);
  const exportSvgRef = useRef<SVGSVGElement>(null);
  const imageInProgressRef = useRef(false);
  const imageRequestQueuedRef = useRef(false);
  const lastImageActionRef = useRef<ImageAction>("copy");
  const { ref: chartViewportRef, size: chartViewport } = useElementSize<HTMLDivElement>();
  const autosave = useAutosave(document, autosaveEnabled);
  const effectiveRange = useMemo(
    () => resolveTimelineRange(document, today),
    [document, today],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(document.tasks.map((task) => task.category))),
    [document.tasks],
  );
  const colorOptions = useMemo(
    () => Array.from(new Set(document.tasks.map((task) => task.color.toLowerCase()))),
    [document.tasks],
  );

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const reconcileTodayAndScheduleNextMidnight = () => {
      const now = new Date();
      setToday(currentLocalIsoDate(now));
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      midnightTimer = globalThis.setTimeout(
        reconcileTodayAndScheduleNextMidnight,
        Math.max(1, nextMidnight.getTime() - now.getTime()),
      );
    };
    reconcileTodayAndScheduleNextMidnight();
    return () => globalThis.clearTimeout(midnightTimer);
  }, []);

  useEffect(() => {
    let active = true;
    void loadChart()
      .then((loadedDocument) => {
        if (!active) return;
        setDocument(loadedDocument ?? createStarterChart());
        setStartupPhase("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStartupError(error instanceof Error ? error.message : String(error));
        setStartupPhase("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (startupPhase === "ready") setAutosaveEnabled(true);
  }, [startupPhase]);

  useEffect(() => {
    if (dialogMode) return;
    const clearSelection = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTaskId(null);
    };
    globalThis.document.addEventListener("keydown", clearSelection);
    return () => globalThis.document.removeEventListener("keydown", clearSelection);
  }, [dialogMode]);

  const resetToStarterChart = async () => {
    const starterDocument = createStarterChart();
    setResetting(true);
    try {
      await saveChart(starterDocument);
      setDocument(starterDocument);
      setStartupError("");
      setStartupPhase("ready");
    } catch (error) {
      setStartupError(error instanceof Error ? error.message : String(error));
    } finally {
      setResetting(false);
    }
  };

  const commitTask = (task: GanttTask) => {
    setDocument((currentDocument) => ({
      ...currentDocument,
      tasks: currentDocument.tasks.map((currentTask) => (currentTask.id === task.id ? task : currentTask)),
    }));
  };

  const openNewTask = () => {
    setEditingTask(createNewTask(document.settings.timelineRange?.startDate ?? document.tasks[0]?.startDate ?? today));
    setDialogMode("create");
  };

  const changeTimelineRange = (timelineRange: TimelineRange | undefined) => {
    setDocument((current) => {
      const settings = { ...current.settings };
      if (timelineRange) settings.timelineRange = timelineRange;
      else delete settings.timelineRange;
      return { ...current, settings };
    });
    setSelectedTaskId(null);
  };

  const openTaskEditor = (taskId: string) => {
    const task = document.tasks.find((currentTask) => currentTask.id === taskId);
    if (!task) return;
    setSelectedTaskId(task.id);
    setEditingTask(task);
    setDialogMode("edit");
  };

  const closeTaskEditor = () => {
    setDialogMode(null);
    setEditingTask(null);
  };

  const saveTask = (task: GanttTask) => {
    setDocument((currentDocument) => ({
      ...currentDocument,
      tasks: dialogMode === "create"
        ? [...currentDocument.tasks, task]
        : currentDocument.tasks.map((currentTask) => (currentTask.id === task.id ? task : currentTask)),
    }));
    setSelectedTaskId(task.id);
    closeTaskEditor();
  };

  const deleteTask = (taskId: string) => {
    setDocument((currentDocument) => ({
      ...currentDocument,
      tasks: currentDocument.tasks.filter((task) => task.id !== taskId),
    }));
    setSelectedTaskId((selectedId) => (selectedId === taskId ? null : selectedId));
    closeTaskEditor();
  };

  const runImageAction = useCallback(async (action: ImageAction) => {
    if (imageInProgressRef.current) return;
    const exportSvg = exportSvgRef.current;
    if (!exportSvg) {
      setImageError("The export chart is not ready.");
      setImagePhase("error");
      setImageRequest(null);
      imageRequestQueuedRef.current = false;
      return;
    }

    imageInProgressRef.current = true;
    setImageError("");
    setImagePhase("preparing");
    try {
      const artifact = await svgToPngArtifact(exportSvg, 2);
      if (action === "copy") {
        await copyPngToClipboard(artifact);
        setImagePhase("copied");
      } else {
        const path = await choosePngDestination(document.title);
        if (!path) {
          setImagePhase("idle");
          return;
        }
        await writePng(path, artifact.bytes);
        setImagePhase("exported");
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
      setImagePhase("error");
    } finally {
      imageInProgressRef.current = false;
      imageRequestQueuedRef.current = false;
      setImageRequest(null);
    }
  }, [document.title]);

  useEffect(() => {
    if (imageRequest) void runImageAction(imageRequest);
  }, [imageRequest, runImageAction]);

  const requestImageAction = (action: ImageAction) => {
    if (imageInProgressRef.current || imageRequestQueuedRef.current) return;
    imageRequestQueuedRef.current = true;
    lastImageActionRef.current = action;
    setImageError("");
    setImagePhase("preparing");
    setImageRequest(action);
  };

  if (startupPhase === "loading") {
    return (
      <main className="app-shell">
        <section className="recovery-panel" role="status">
          <h1>{APP_DISPLAY_NAME}</h1>
          <p>Loading chart…</p>
        </section>
      </main>
    );
  }

  if (startupPhase === "error") {
    return (
      <main className="app-shell">
        <section className="recovery-panel" role="alert">
          <h1>Could not load chart</h1>
          <p>{startupError}</p>
          <button type="button" disabled={resetting} onClick={() => void resetToStarterChart()}>
            Reset to starter chart
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="toolbar">
        <h1>{APP_DISPLAY_NAME}</h1>
        <div className="toolbar-actions">
          <span className="sr-only" role="status" aria-label="Save status" aria-live="polite">
            {autosave.phase === "saving" ? "Saving" : autosave.phase === "saved" ? "Saved" :
              autosave.phase === "error" ? `Could not save: ${autosave.message}` : ""}
          </span>
          <span className="sr-only" role="status" aria-label="Image action status" aria-live="polite">
            {imagePhase === "preparing" ? "Preparing image" : imagePhase === "copied" ? "Copied" :
              imagePhase === "exported" ? "PNG exported" : imagePhase === "error" ? imageError : ""}
          </span>
          {autosave.phase === "error" && (
            <button
              type="button"
              className="icon-action status-error"
              aria-label="Retry save"
              title={autosave.message}
              onClick={autosave.retry}
            >
              <CircleAlert aria-hidden="true" />
            </button>
          )}
          <button type="button" className="primary-action" onClick={openNewTask}>
            <Plus aria-hidden="true" />
            Add task
          </button>
          <TimelineRangePicker
            effectiveRange={effectiveRange}
            customRange={document.settings.timelineRange}
            onChange={changeTimelineRange}
          />
          <div className="toolbar-icon-group" role="group" aria-label="Chart image actions">
            <button
              type="button"
              className="icon-action"
              aria-label="Copy image"
              aria-busy={imagePhase === "preparing" && imageRequest === "copy" ? true : undefined}
              data-state={imagePhase === "error" && lastImageActionRef.current === "copy" ? "error" : undefined}
              title={imagePhase === "error" && lastImageActionRef.current === "copy"
                ? imageError
                : "Copy chart image"}
              onClick={() => requestImageAction("copy")}
            >
              <Copy aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-action"
              aria-label="Export PNG"
              aria-busy={imagePhase === "preparing" && imageRequest === "export" ? true : undefined}
              data-state={imagePhase === "error" && lastImageActionRef.current === "export" ? "error" : undefined}
              title={imagePhase === "error" && lastImageActionRef.current === "export"
                ? imageError
                : "Export chart PNG"}
              onClick={() => requestImageAction("export")}
            >
              <Download aria-hidden="true" />
            </button>
          </div>
          <SettingsMenu
            settings={document.settings}
            onChange={(settings) => setDocument((currentDocument) => ({ ...currentDocument, settings }))}
          />
        </div>
      </header>
      <section className="chart-surface" aria-label="Gantt chart workspace">
        <div ref={chartViewportRef} className="chart-viewport">
          {chartViewport.width > 0 && chartViewport.height > 0 && (
            <GanttChart
              document={document}
              today={today}
              mode="editor"
              selectedTaskId={selectedTaskId}
              previewTask={previewTask ?? undefined}
              viewport={chartViewport}
              onSelectTask={setSelectedTaskId}
              onEditTask={openTaskEditor}
              onPreviewTask={setPreviewTask}
              onCommitTask={commitTask}
              onClearSelection={() => setSelectedTaskId(null)}
              onTitleCommit={(title) => setDocument((currentDocument) => ({ ...currentDocument, title }))}
            />
          )}
        </div>
      </section>
      {imageRequest && chartViewport.width > 0 && chartViewport.height > 0 && (
        <div
          aria-hidden="true"
          className="export-staging"
        >
          <GanttChart
            ref={exportSvgRef}
            document={document}
            today={today}
            mode="export"
            selectedTaskId={null}
            viewport={chartViewport}
          />
        </div>
      )}
      {dialogMode && editingTask && (
        <TaskEditorDialog
          mode={dialogMode}
          task={editingTask}
          categoryOptions={categoryOptions}
          colorOptions={colorOptions}
          onSave={saveTask}
          onCancel={closeTaskEditor}
          onDelete={deleteTask}
        />
      )}
    </main>
  );
}
