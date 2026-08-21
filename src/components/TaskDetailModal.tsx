"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { deleteTask, updateTask } from "@/app/actions";
import {
  PRIORITY_LABELS,
  type Task,
  type TaskStatus,
} from "@/lib/domain";
import { centsToPesosInput } from "@/lib/format";
import AttachmentThumbs from "@/components/AttachmentThumbs";
import CommentThread from "@/components/CommentThread";
import {
  COLUMNS,
  MOVE_BUTTON_COLOR,
  STATUS_COLOR,
  STATUS_ICON,
  STATUS_VALUE,
} from "@/components/kanban-meta";

/**
 * Owner task detail drawer (right side on desktop, full-screen on mobile).
 * Opened from a compact kanban card. Contains the full description, larger
 * images with lightbox, amount/payment editing, move-status buttons, the
 * inline-confirm delete flow, and the comment thread.
 */
export default function TaskDetailModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );
  const amountRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLSelectElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Lock body scroll while the drawer is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

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

  async function saveEdits() {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("amountArs", amountRef.current?.value ?? "");
    fd.set("paymentState", paymentRef.current?.value ?? "");
    const r = await updateTask(fd);
    setMsg(
      r.ok
        ? { kind: "success", text: "Guardado." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) router.refresh();
  }

  async function onDelete() {
    const fd = new FormData();
    fd.set("id", task.id);
    const r = await deleteTask(fd);
    setMsg(
      r.ok
        ? { kind: "success", text: "Eliminada." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) {
      router.refresh();
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${task.title}`}
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <aside
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-card-border bg-card shadow-2xl"
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
                {STATUS_VALUE[task.status]}
              </span>
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

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-primary">Monto y pago</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                defaultValue={centsToPesosInput(task.amountArs)}
                placeholder="Monto ARS"
                className="rounded-lg border border-card-border bg-surface px-2 py-2 text-sm text-primary"
              />
              <select
                ref={paymentRef}
                defaultValue={task.paymentState ?? ""}
                className="rounded-lg border border-card-border bg-surface px-2 py-2 text-sm text-primary"
              >
                <option value="">Pago...</option>
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado</option>
              </select>
            </div>
            <button
              type="button"
              onClick={saveEdits}
              className="w-full min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            >
              Guardar
            </button>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-primary">Estado</h3>
            <div className="grid grid-cols-3 gap-2">
              {COLUMNS.filter((c) => c.status !== task.status).map((c) => {
                const Icon = STATUS_ICON[c.status];
                return (
                  <button
                    key={c.status}
                    type="button"
                    onClick={() => moveStatus(c.status)}
                    title={`Mover a ${c.label}`}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-card-border bg-surface px-2 py-2 text-xs font-medium ${MOVE_BUTTON_COLOR[c.status]}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border-t border-card-border pt-4">
            {confirmingDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  className="min-h-11 flex-1 rounded-lg bg-error px-2 py-2 text-sm font-semibold text-white"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-11 flex-1 rounded-lg bg-surface px-2 py-2 text-sm text-secondary"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="w-full min-h-11 rounded-lg border border-error/40 px-3 py-2 text-sm text-error"
              >
                Eliminar tarea
              </button>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-primary">
              Comentarios
            </h3>
            <CommentThread taskId={task.id} comments={task.comments} mode="owner" />
          </section>

          {msg && (
            <p
              role={msg.kind === "error" ? "alert" : "status"}
              className={`text-xs ${msg.kind === "error" ? "text-error" : "text-success"}`}
            >
              {msg.text}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}