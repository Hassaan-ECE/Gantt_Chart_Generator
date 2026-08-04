import { useState } from "react";
import { Download, Plus, Settings } from "lucide-react";

import { APP_DISPLAY_NAME } from "@/app/branding";
import { GanttChart } from "@/gantt/GanttChart";
import type { GanttTask } from "@/gantt/model";
import { createStarterChart } from "@/gantt/starterChart";

export function App() {
  const [document, setDocument] = useState(() => createStarterChart());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [previewTask, setPreviewTask] = useState<GanttTask | null>(null);

  const commitTask = (task: GanttTask) => {
    setDocument((currentDocument) => ({
      ...currentDocument,
      tasks: currentDocument.tasks.map((currentTask) => (currentTask.id === task.id ? task : currentTask)),
    }));
  };

  return (
    <main className="app-shell">
      <header className="toolbar">
        <h1>{APP_DISPLAY_NAME}</h1>
        <div className="toolbar-actions">
          <button type="button">
            <Plus aria-hidden="true" />
            Add task
          </button>
          <button type="button">
            <Download aria-hidden="true" />
            Export PNG
          </button>
          <button type="button" aria-label="Chart settings">
            <Settings aria-hidden="true" />
          </button>
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
            onPreviewTask={setPreviewTask}
            onCommitTask={commitTask}
          />
        </div>
      </section>
    </main>
  );
}
