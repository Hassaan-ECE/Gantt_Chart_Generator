import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { ColorSuggestionField } from "@/gantt/ColorSuggestionField";
import { isValidIsoDate, type GanttTask } from "@/gantt/model";

export interface TaskEditorDialogProps {
  mode: "create" | "edit";
  task: GanttTask;
  categoryOptions?: string[];
  colorOptions?: string[];
  onSave: (task: GanttTask) => void;
  onCancel: () => void;
  onDelete?: (taskId: string) => void;
}

type FieldErrors = Partial<Record<"name" | "startDate" | "endDate" | "category" | "color", string>>;

function validateTask(task: GanttTask): FieldErrors {
  const errors: FieldErrors = {};
  if (!task.name.trim()) errors.name = "Task name is required.";
  if (!task.category.trim()) errors.category = "Category is required.";
  if (!/^#[0-9a-f]{6}$/i.test(task.color)) errors.color = "Color must be a six-digit hex value.";
  if (!isValidIsoDate(task.startDate)) errors.startDate = "Start date must use a valid YYYY-MM-DD value.";
  if (!isValidIsoDate(task.endDate)) errors.endDate = "End date must use a valid YYYY-MM-DD value.";
  if (isValidIsoDate(task.startDate) && isValidIsoDate(task.endDate) && task.endDate < task.startDate) {
    errors.endDate = "End date cannot be before start date.";
  }
  return errors;
}

export function TaskEditorDialog({ mode, task, categoryOptions = [], colorOptions = [], onSave, onCancel, onDelete }: TaskEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const categoryListId = useId();
  const [draft, setDraft] = useState<GanttTask>(task);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(task);
    setErrors({});
    setConfirmDelete(false);
  }, [task]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.open = true;
    nameInputRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  useEffect(() => {
    if (typeof dialogRef.current?.showModal === "function") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const updateField = <Field extends keyof GanttTask>(field: Field, value: GanttTask[Field]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const save = () => {
    const nextTask = { ...draft, name: draft.name.trim(), category: draft.category.trim() };
    const nextErrors = validateTask(nextTask);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSave(nextTask);
  };

  return (
    <dialog ref={dialogRef} className="task-editor-dialog" aria-labelledby="task-editor-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <h2 id="task-editor-title">{mode === "create" ? "Add task" : "Edit task"}</h2>
        <label>
          Task name
          <input ref={nameInputRef} aria-invalid={Boolean(errors.name)} value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
        </label>
        {errors.name && <p className="form-error">{errors.name}</p>}
        <label>
          Start date
          <input type="date" aria-invalid={Boolean(errors.startDate)} value={draft.startDate} onChange={(event) => updateField("startDate", event.target.value)} />
        </label>
        {errors.startDate && <p className="form-error">{errors.startDate}</p>}
        <label>
          End date
          <input type="date" aria-invalid={Boolean(errors.endDate)} value={draft.endDate} onChange={(event) => updateField("endDate", event.target.value)} />
        </label>
        {errors.endDate && <p className="form-error">{errors.endDate}</p>}
        <label>
          Category
          <input list={categoryListId} aria-invalid={Boolean(errors.category)} value={draft.category} onChange={(event) => updateField("category", event.target.value)} />
        </label>
        <datalist id={categoryListId}>
          {Array.from(new Set(categoryOptions)).map((category) => <option key={category} value={category} />)}
        </datalist>
        {errors.category && <p className="form-error">{errors.category}</p>}
        <div className="form-field">
          <span>Color</span>
          <ColorSuggestionField value={draft.color} options={colorOptions} onChange={(color) => updateField("color", color)} />
        </div>
        {errors.color && <p className="form-error">{errors.color}</p>}
        <div className="dialog-actions">
          <button type="submit">Save task</button>
          <button type="button" onClick={onCancel}>Cancel</button>
          {mode === "edit" && !confirmDelete && (
            <button type="button" className="danger-button" onClick={() => setConfirmDelete(true)}>Delete task</button>
          )}
        </div>
        {mode === "edit" && confirmDelete && (
          <section className="delete-confirmation" aria-live="polite">
            <p>Delete this task?</p>
            <button type="button" className="danger-button" onClick={() => onDelete?.(task.id)}>Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)}>Keep task</button>
          </section>
        )}
      </form>
    </dialog>
  );
}
