"use client";

import { useState } from "react";
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from "@/lib/domain";
import { formatArs } from "@/lib/format";
import AttachmentThumbs from "@/components/AttachmentThumbs";
import PaymentBadge from "@/components/PaymentBadge";
import PortalTaskItem from "@/components/PortalTaskItem";

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
  const [filter, setFilter] = useState<PaymentFilter>("all");

  const visible = tasks.filter((t) => matchesFilter(t, filter));

  return (
    <div className="space-y-4">
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
              </div>

              {task.attachments.length > 0 && (
                <AttachmentThumbs
                  attachments={task.attachments}
                  sizeClass="h-16 w-16"
                />
              )}
            </PortalTaskItem>
          ))}
        </ul>
      )}
    </div>
  );
}