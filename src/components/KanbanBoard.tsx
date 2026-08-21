"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { updateTask } from "@/app/actions";
import { PRIORITY_LABELS, type ServiceOption, type Task, type TaskStatus } from "@/lib/domain";
import { formatArs } from "@/lib/format";
import AttachmentThumbs from "@/components/AttachmentThumbs";
import TaskDetailModal from "@/components/TaskDetailModal";
import {
  COLUMNS,
  MOVE_BUTTON_COLOR,
  STATUS_ICON,
  STATUS_VALUE,
} from "@/components/kanban-meta";

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  pending: "border-status-pending",
  in_progress: "border-status-progress",
  revision: "border-sky-400",
  done: "border-status-done",
};

export default function KanbanBoard({
  columns,
  services,
}: {
  columns: Record<TaskStatus, Task[]>;
  services: ServiceOption[];
}) {
  const [selected, setSelected] = useState<Task | null>(null);

  return (
    <>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {COLUMNS.map((col) => (
            <section
              key={col.status}
              className={`w-64 shrink-0 rounded-2xl border border-t-4 ${COLUMN_ACCENT[col.status]} bg-surface/40 p-3`}
            >
              <h2 className="mb-3 px-1 text-sm font-semibold text-primary">
                {col.label}{" "}
                <span className="text-muted">({columns[col.status].length})</span>
              </h2>
              <div className="space-y-3">
                {columns[col.status].length === 0 && (
                  <p className="rounded-xl border border-dashed border-card-border px-3 py-6 text-center text-xs text-muted">
                    Sin tareas
                  </p>
                )}
                {columns[col.status].map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    onOpen={() => setSelected(task)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {selected && (
        <TaskDetailModal
          task={selected}
          services={services}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function KanbanCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );

  async function moveStatus(next: TaskStatus) {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("status", next);
    const r = await updateTask(fd);
    setMsg(
      r.ok
        ? { kind: "success", text: "Estado actualizado." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) router.refresh();
  }

  return (
    <article className="rounded-xl border border-card-border bg-card p-3 transition-colors hover:border-accent/60">
      {/* Whole card body is clickable -> opens the detail modal. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Ver detalle de ${task.title}`}
        className="cursor-pointer space-y-2"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-primary">{task.title}</h3>
            <p className="truncate text-xs text-muted">{task.area}</p>
          </div>
          <ChevronRight
            className="mt-0.5 h-4 w-4 shrink-0 text-muted"
            aria-hidden="true"
          />
        </div>

        <p className="text-sm font-semibold text-primary">
          {formatArs(task.amountArs)}
        </p>

        {task.paymentState && (
          <p
            className={`text-xs font-medium ${
              task.paymentState === "paid" ? "text-success" : "text-status-progress"
            }`}
          >
            {task.paymentState === "paid" ? "Pagado" : "Pendiente"}
          </p>
        )}

        {task.attachments.length > 0 && (
          <AttachmentThumbs
            attachments={task.attachments}
            sizeClass="h-10 w-10"
            interactive={false}
          />
        )}

        <p className="text-[10px] uppercase tracking-wide text-muted">
          {STATUS_VALUE[task.status]} · {PRIORITY_LABELS[task.priority]}
        </p>

        {task.serviceId === null && (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
            Sin clasificar
          </span>
        )}
      </div>

      {/* Move status (fast path, kept on the card). */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {COLUMNS.filter((c) => c.status !== task.status).map((c) => {
          const Icon = STATUS_ICON[c.status];
          return (
            <button
              key={c.status}
              type="button"
              onClick={() => moveStatus(c.status)}
              title={`Mover a ${c.label}`}
              aria-label={`Mover a ${c.label}`}
              className={`flex min-h-9 items-center justify-center rounded-lg border border-card-border bg-surface ${MOVE_BUTTON_COLOR[c.status]}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`mt-2 text-xs ${msg.kind === "error" ? "text-error" : "text-success"}`}
        >
          {msg.text}
        </p>
      )}
    </article>
  );
}