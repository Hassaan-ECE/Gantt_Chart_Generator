import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";

import { APP_DISPLAY_NAME } from "@/app/branding";
import { GanttChart } from "@/gantt/GanttChart";
import { addCalendarDays } from "@/gantt/dateMath";
import type { GanttTask } from "@/gantt/model";
import { SettingsMenu } from "@/gantt/SettingsMenu";
import { createStarterChart } from "@/gantt/starterChart";
import { TaskEditorDialog } from "@/gantt/TaskEditorDialog";
import { useAutosave } from "@/gantt/useAutosave";
import { loadChart, saveChart } from "@/integrations/tauri/chartBridge";

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
  const [startupPhase, setStartupPhase] = useState<"loading" | "ready" | "error">("loading");
  const [startupError, setStartupError] = useState("");
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [previewTask, setPreviewTask] = useState<GanttTask | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const autosave = useAutosave(document, autosaveEnabled);

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
    setEditingTask(createNewTask(document.tasks[0]?.startDate ?? new Date().toISOString().slice(0, 10)));
    setDialogMode("create");
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
          <div className="autosave-status" aria-live="polite">
            {autosave.phase === "saving" && "Saving…"}
            {autosave.phase === "saved" && "Saved"}
            {autosave.phase === "error" && (
              <>
                <span title={autosave.message}>Could not save</span>
                <button type="button" onClick={autosave.retry}>Retry</button>
              </>
            )}
          </div>
          <label className="chart-title-control">
            <span>Chart title</span>
            <input
              aria-label="Chart title"
              value={document.title}
              onChange={(event) => setDocument((currentDocument) => ({ ...currentDocument, title: event.target.value }))}
              onBlur={() => setDocument((currentDocument) => ({ ...currentDocument, title: currentDocument.title.trim() || "Untitled Gantt Chart" }))}
            />
          </label>
          <button type="button" onClick={openNewTask}>
            <Plus aria-hidden="true" />
            Add task
          </button>
          <button type="button">
            <Download aria-hidden="true" />
            Export PNG
          </button>
          <SettingsMenu
            settings={document.settings}
            onChange={(settings) => setDocument((currentDocument) => ({ ...currentDocument, settings }))}
          />
        </div>
      </header>
      <section className="chart-surface" aria-label="Gantt chart workspace">
        <div className="chart-viewport">
          <GanttChart
            document={document}
            mode="editor"
            selectedTaskId={selectedTaskId}
            previewTask={previewTask ?? undefined}
            onSelectTask={setSelectedTaskId}
            onEditTask={openTaskEditor}
            onPreviewTask={setPreviewTask}
            onCommitTask={commitTask}
          />
        </div>
      </section>
      {dialogMode && editingTask && (
        <TaskEditorDialog
          mode={dialogMode}
          task={editingTask}
          onSave={saveTask}
          onCancel={closeTaskEditor}
          onDelete={deleteTask}
        />
      )}
    </main>
  );
}
