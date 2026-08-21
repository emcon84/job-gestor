"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Task,
} from "@/lib/domain";
import { formatArs } from "@/lib/format";
import AttachmentThumbs from "@/components/AttachmentThumbs";
import CommentThread from "@/components/CommentThread";
import PaymentBadge from "@/components/PaymentBadge";

const STATUS_COLOR: Record<Task["status"], string> = {
  pending: "text-status-pending",
  in_progress: "text-status-progress",
  revision: "text-sky-400",
  done: "text-status-done",
};

/**
 * Portal task list item (client). Renders the item markup passed by the server
 * TaskList plus the comment thread inline on the card (social-network style, so
 * clients see and reply without opening anything) and a "Ver detalle"
 * affordance that opens a modal with the description and images only. No edit
 * controls on the client.
 */
export default function PortalTaskItem({
  task,
  children,
}: {
  task: Task;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <li className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
        {children}
        <CommentThread taskId={task.id} comments={task.comments} mode="portal" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm font-medium text-secondary transition-colors hover:border-accent hover:text-primary"
        >
          Ver detalle
        </button>
      </li>

      {open && (
        <PortalTaskDetailModal task={task} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function PortalTaskDetailModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${task.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-card-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-card-border bg-card p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-primary">{task.title}</h2>
            <p className="text-xs text-muted">{task.area}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">
                Prioridad: {PRIORITY_LABELS[task.priority]}
              </span>
              <span className={`font-medium ${STATUS_COLOR[task.status]}`}>
                {STATUS_LABELS[task.status]}
              </span>
              <span className="font-medium text-primary">
                {formatArs(task.amountArs)}
              </span>
              <PaymentBadge state={task.paymentState} />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-primary">
              Descripción
            </h3>
            <p className="whitespace-pre-wrap text-sm text-secondary">
              {task.description}
            </p>
          </section>

          {task.attachments.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-primary">
                Imágenes
              </h3>
              <AttachmentThumbs
                attachments={task.attachments}
                sizeClass="h-20 w-20"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}