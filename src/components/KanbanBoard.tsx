"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { updateTask } from "@/app/actions";
import { PRIORITY_LABELS, type ServiceOption, type Task, type TaskStatus } from "@/lib/domain";
import { formatArs } from "@/lib/format";
import { effectiveAmountCents, formatHours, totalWorkedMs } from "@/lib/hours";
import AttachmentThumbs from "@/components/AttachmentThumbs";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskFilters from "@/components/TaskFilters";
import { filterTasks, sortRecentlyCompleted, type TaskFilter } from "@/lib/task-view";
import { hasRunningSession, useNow } from "@/components/work-hours";
import {
  COLUMNS,
  MOVE_BUTTON_COLOR,
  STATUS_ICON,
  STATUS_VALUE,
} from "@/components/kanban-meta";

/** How many completed tasks the "Hecho" column shows before "Ver todas". */
const DONE_PREVIEW = 10;

const COLUMN_ACCENT:Record<TaskStatus, string> = {
  pending: "border-status-pending",
  in_progress: "border-status-progress",
  revision: "border-sky-400",
  done: "border-status-done",
};

export default function KanbanBoard({
  columns,
  services,
  hourlyRateCents,
}: {
  columns: Record<TaskStatus, Task[]>;
  services: ServiceOption[];
  /** Client hourly rate in cents; null = pack mode. */
  hourlyRateCents: number | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilter>({ query: "", priority: "all" });
  const [showAllDone, setShowAllDone] = useState(false);
  // Resolve from the current columns so the drawer reflects refreshed data
  // (e.g. a just-started work session) instead of a stale snapshot.
  const selected =
    selectedId === null
      ? null
      : (Object.values(columns)
          .flat()
          .find((t) => t.id === selectedId) ?? null);

  const filtering = filter.query.trim() !== "" || filter.priority !== "all";

  return (
    <>
      <div className="mb-4">
        <TaskFilters value={filter} onChange={setFilter} />
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {COLUMNS.map((col) => {
            const matching = filterTasks(columns[col.status], filter);
            const ordered =
              col.status === "done" ? sortRecentlyCompleted(matching) : matching;
            // "Done" grows forever: show only the most recent ones unless the
            // owner asks for all of them or is actively searching.
            const collapsed =
              col.status === "done" &&
              !showAllDone &&
              !filtering &&
              ordered.length > DONE_PREVIEW;
            const shown = collapsed ? ordered.slice(0, DONE_PREVIEW) : ordered;
            return (
              <section
                key={col.status}
                className={`flex w-72 shrink-0 flex-col rounded-2xl border border-t-4 ${COLUMN_ACCENT[col.status]} bg-surface/40 p-3`}
              >
                <h2 className="mb-3 px-1 text-sm font-semibold text-primary">
                  {col.label}{" "}
                  <span className="text-muted">
                    ({filtering ? `${matching.length}/` : ""}
                    {columns[col.status].length})
                  </span>
                </h2>
                {/* Fixed-height column: cards scroll inside, header stays put. */}
                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  {shown.length === 0 && (
                    <p className="rounded-xl border border-dashed border-card-border px-3 py-6 text-center text-xs text-muted">
                      {filtering ? "Sin resultados" : "Sin tareas"}
                    </p>
                  )}
                  {shown.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      hourlyRateCents={hourlyRateCents}
                      onOpen={() => setSelectedId(task.id)}
                    />
                  ))}
                  {col.status === "done" &&
                    !filtering &&
                    ordered.length > DONE_PREVIEW && (
                      <button
                        type="button"
                        onClick={() => setShowAllDone((v) => !v)}
                        className="min-h-11 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary transition-colors hover:border-accent hover:text-primary"
                      >
                        {collapsed
                          ? `Ver todas (${ordered.length})`
                          : `Mostrar solo las últimas ${DONE_PREVIEW}`}
                      </button>
                    )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {selected && (
        <TaskDetailModal
          task={selected}
          services={services}
          hourlyRateCents={hourlyRateCents}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

function KanbanCard({
  task,
  hourlyRateCents,
  onOpen,
}: {
  task: Task;
  hourlyRateCents: number | null;
  onOpen: () => void;
}) {
  const router = useRouter();
  // Fixed-amount tasks bill their stored amount: no hours, no timer.
  const hourly = hourlyRateCents !== null && !task.fixedAmount;
  const running = hasRunningSession(task);
  const now = useNow(hourly && running);
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

        {hourly ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className="text-sm font-semibold text-primary"
              suppressHydrationWarning
            >
              {formatHours(totalWorkedMs(task, now))} ·{" "}
              {formatArs(effectiveAmountCents(task, { hourlyRateCents }, now))}
            </p>
            {running && (
              <span className="inline-flex items-center rounded-full border border-accent/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                En curso
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm font-semibold text-primary">
            {formatArs(task.amountArs)}
            {task.fixedAmount && hourlyRateCents !== null && (
              <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                Monto fijo
              </span>
            )}
          </p>
        )}

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