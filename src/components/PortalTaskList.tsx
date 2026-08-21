"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_CLIENT_MOVES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  canClientMove,
  isDueDateOverdue,
  type Task,
  type TaskStatus,
} from "@/lib/domain";
import { formatArs, formatDateEs } from "@/lib/format";
import AttachmentThumbs from "@/components/AttachmentThumbs";
import PaymentBadge from "@/components/PaymentBadge";
import PortalTaskItem from "@/components/PortalTaskItem";
import { moveTaskStatusClient } from "@/app/actions";
import { COLUMNS, MOVE_BUTTON_COLOR, STATUS_ICON } from "@/components/kanban-meta";

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-muted",
  medium: "bg-status-progress",
  high: "bg-status-progress",
  urgent: "bg-status-urgent",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-status-pending",
  in_progress: "text-status-progress",
  revision: "text-sky-400",
  done: "text-status-done",
};

type PaymentFilter = "all" | "pending" | "paid";

const FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "paid", label: "Pagadas" },
];

function matchesFilter(task: Task, filter: PaymentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return task.paymentState === "paid";
  // "pending" includes tasks with no payment state assigned yet — the client
  // cares about everything that is not confirmed as paid.
  return task.paymentState !== "paid";
}

/**
 * Client-side portal list with a payment-state filter. The server TaskList
 * delegates rendering here so the client can filter without a page reload.
 */
export default function PortalTaskList({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function moveStatus(task: Task, next: TaskStatus) {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("status", next);
    setMovingId(task.id);
    setError(null);
    const r = await moveTaskStatusClient(fd);
    if (!r.ok) {
      setError(r.error ?? "Error.");
    }
    setMovingId(null);
    router.refresh();
  }

  const visible = tasks.filter((t) => matchesFilter(t, filter));

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-error/40 bg-error/10 p-3 text-sm text-error"
        >
          {error}
        </p>
      )}
      <div
        role="group"
        aria-label="Filtrar por estado de pago"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? tasks.length
              : tasks.filter((t) => matchesFilter(t, f.value)).length;
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-card-border bg-surface text-secondary hover:border-accent hover:text-primary"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-card-border bg-card p-6 text-center text-muted">
          No hay tareas en este filtro.
        </p>
      ) : (
        <ul className="space-y-4">
          {visible.map((task) => (
            <PortalTaskItem key={task.id} task={task}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-primary">
                    {task.title}
                  </h3>
                  <p className="text-sm text-muted">{task.area}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_COLOR[task.status]}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`}
                  />
                  {STATUS_LABELS[task.status]}
                </span>
              </div>

              <p className="whitespace-pre-wrap text-sm text-secondary">
                {task.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary">
                <span>Prioridad: {PRIORITY_LABELS[task.priority]}</span>
                <span className="font-medium text-primary">
                  {formatArs(task.amountArs)}
                </span>
                <PaymentBadge state={task.paymentState} />
                {task.paymentDueDate && task.paymentState !== "paid" && (
                  isDueDateOverdue(task.paymentDueDate) ? (
                    <span className="font-semibold text-status-urgent">
                      Vencido {formatDateEs(task.paymentDueDate)}
                    </span>
                  ) : (
                    <span className="text-muted">
                      Vence el {formatDateEs(task.paymentDueDate)}
                    </span>
                  )
                )}
              </div>

              {task.attachments.length > 0 && (
                <AttachmentThumbs
                  attachments={task.attachments}
                  sizeClass="h-16 w-16"
                />
              )}

              <ClientStatusMoves
                task={task}
                moving={movingId === task.id}
                onMove={(next) => moveStatus(task, next)}
              />
            </PortalTaskItem>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Client-facing status move controls for a portal card. Shows compact move
 * buttons when the client still has moves left (task not done and below the
 * hard limit); a muted notice once the limit is reached; nothing when done.
 */
function ClientStatusMoves({
  task,
  moving,
  onMove,
}: {
  task: Task;
  moving: boolean;
  onMove: (next: TaskStatus) => void;
}) {
  if (task.status === "done") {
    return null;
  }

  if (!canClientMove(task)) {
    return (
      <p className="text-xs text-muted">Límite de movimientos alcanzado</p>
    );
  }

  const remaining = MAX_CLIENT_MOVES - task.clientMoveCount;
  const targets = COLUMNS.filter((c) => c.status !== task.status);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {targets.map((c) => {
          const Icon = STATUS_ICON[c.status];
          return (
            <button
              key={c.status}
              type="button"
              disabled={moving}
              onClick={() => onMove(c.status)}
              title={`Mover a ${c.label}`}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-card-border bg-surface px-2 py-2 text-xs font-medium ${MOVE_BUTTON_COLOR[c.status]} disabled:opacity-50`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{c.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        {remaining}/{MAX_CLIENT_MOVES} movimientos
      </p>
    </div>
  );
}