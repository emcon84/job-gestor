"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { deleteTask, updateTask } from "@/app/actions";
import { type Task, type TaskStatus } from "@/lib/domain";
import { formatArs } from "@/lib/format";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "pending", label: "Pendiente" },
  { status: "in_progress", label: "En curso" },
  { status: "done", label: "Hecho" },
];

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  pending: "border-status-pending",
  in_progress: "border-status-progress",
  done: "border-status-done",
};

const STATUS_VALUE: Record<TaskStatus, string> = {
  pending: "pendiente",
  in_progress: "en curso",
  done: "hecho",
};

export default function KanbanBoard({
  columns,
}: {
  columns: Record<TaskStatus, Task[]>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <section
          key={col.status}
          className={`rounded-2xl border border-t-4 ${COLUMN_ACCENT[col.status]} bg-surface/40 p-3`}
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
              <KanbanCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function KanbanCard({ task }: { task: Task }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLSelectElement>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function moveStatus(next: TaskStatus) {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("status", next);
    const r = await updateTask(fd);
    setMsg(r.ok ? { kind: "success", text: "Estado actualizado." } : { kind: "error", text: r.error ?? "Error." });
    if (r.ok) router.refresh();
  }

  async function saveEdits() {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("amountArs", amountRef.current?.value ?? "");
    fd.set("paymentState", paymentRef.current?.value ?? "");
    const r = await updateTask(fd);
    setMsg(r.ok ? { kind: "success", text: "Guardado." } : { kind: "error", text: r.error ?? "Error." });
    if (r.ok) router.refresh();
  }

  async function onDelete() {
    const fd = new FormData();
    fd.set("id", task.id);
    const r = await deleteTask(fd);
    setMsg(r.ok ? { kind: "success", text: "Eliminada." } : { kind: "error", text: r.error ?? "Error." });
    if (r.ok) router.refresh();
  }

  return (
    <article className="rounded-xl border border-card-border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-primary">{task.title}</h3>
        <p className="text-xs text-muted">{task.area}</p>
      </div>

      <p className="whitespace-pre-wrap text-sm text-secondary line-clamp-3">
        {task.description}
      </p>

      {task.amountArs !== null && (
        <p className="text-sm font-semibold text-primary">{formatArs(task.amountArs)}</p>
      )}

      {task.paymentState && (
        <p
          className={`text-xs font-medium ${
            task.paymentState === "paid" ? "text-success" : "text-status-progress"
          }`}
        >
          Pago: {task.paymentState === "paid" ? "pagado" : "pendiente"}
        </p>
      )}

      {task.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.attachments.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
              <Image
                src={a.url}
                alt={a.name}
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {/* Move status */}
      <div className="flex gap-2">
        {COLUMNS.filter((c) => c.status !== task.status).map((c) => (
          <button
            key={c.status}
            type="button"
            onClick={() => moveStatus(c.status)}
            className="min-h-11 flex-1 rounded-lg bg-surface px-2 py-2 text-xs font-medium text-primary hover:border-accent border border-card-border"
          >
            → {c.label}
          </button>
        ))}
      </div>

      {/* Edit amount + payment */}
      <div className="grid grid-cols-2 gap-2">
        <input
          ref={amountRef}
          type="text"
          inputMode="decimal"
          defaultValue={task.amountArs === null ? "" : (task.amountArs / 100).toFixed(2)}
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

      {/* Delete */}
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

      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`text-xs ${msg.kind === "error" ? "text-error" : "text-success"}`}
        >
          {msg.text}
        </p>
      )}

      <p className="text-[10px] uppercase tracking-wide text-muted">
        {STATUS_VALUE[task.status]} · {task.priority}
      </p>
    </article>
  );
}
