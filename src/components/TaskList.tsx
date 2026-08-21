import { PRIORITY_LABELS, STATUS_LABELS, type Task } from "@/lib/domain";
import { formatArs } from "@/lib/format";
import AttachmentThumbs from "@/components/AttachmentThumbs";

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

export default function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-card-border bg-card p-6 text-center text-muted">
        Todavía no hay tareas.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="rounded-2xl border border-card-border bg-card p-5 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-primary">{task.title}</h3>
              <p className="text-sm text-muted">{task.area}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_COLOR[task.status]}`}
            >
              <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              {STATUS_LABELS[task.status]}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-sm text-secondary">{task.description}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary">
            <span>Prioridad: {PRIORITY_LABELS[task.priority]}</span>
            <span className="font-medium text-primary">{formatArs(task.amountArs)}</span>
            {task.paymentState && (
              <span className="text-muted">
                Pago: {task.paymentState === "paid" ? "pagado" : "pendiente"}
              </span>
            )}
          </div>

          {task.attachments.length > 0 && (
            <AttachmentThumbs attachments={task.attachments} sizeClass="h-16 w-16" />
          )}
        </li>
      ))}
    </ul>
  );
}
