import { useState } from "react";
import { Download, Plus, Settings } from "lucide-react";

import { APP_DISPLAY_NAME } from "@/app/branding";
import { GanttChart } from "@/gantt/GanttChart";
import { createStarterChart } from "@/gantt/starterChart";

export function App() {
  const [document] = useState(() => createStarterChart());

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
          <GanttChart document={document} mode="editor" selectedTaskId={null} />
        </div>
      </section>
    </main>
  );
}
