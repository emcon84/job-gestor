"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createService, deleteService, updateService } from "@/app/actions";
import type { ActionResult } from "@/lib/action-types";
import type { ServiceOption } from "@/lib/domain";
import { centsToPesosInput } from "@/lib/format";

/**
 * Owner catalog CRUD. Each service has a name and a fixed default cost in ARS.
 * List, create, edit, and delete services from the /owner area.
 */
export default function ServiceAdmin({ services }: { services: ServiceOption[] }) {
  const router = useRouter();
  // Collapsed by default so the catalog never pushes the kanban off-screen.
  const [collapsed, setCollapsed] = useState(true);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCost, setEditCost] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function onCreate() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("defaultCostArs", cost);
    const r: ActionResult = await createService(fd);
    setMsg(r.ok ? { kind: "success", text: r.message ?? "Creado." } : { kind: "error", text: r.error ?? "Error." });
    if (r.ok) {
      setName("");
      setCost("");
      router.refresh();
    }
  }

  function startEdit(s: ServiceOption) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditCost(centsToPesosInput(s.defaultCostArs));
  }

  async function onUpdate() {
    if (!editingId) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("name", editName);
    fd.set("defaultCostArs", editCost);
    const r: ActionResult = await updateService(fd);
    setMsg(r.ok ? { kind: "success", text: r.message ?? "Actualizado." } : { kind: "error", text: r.error ?? "Error." });
    if (r.ok) {
      setEditingId(null);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    const r: ActionResult = await deleteService(fd);
    setMsg(r.ok ? { kind: "success", text: r.message ?? "Eliminado." } : { kind: "error", text: r.error ?? "Error." });
    if (r.ok) {
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card p-5">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3"
      >
        <h2 className="text-left text-lg font-semibold text-primary">
          Catálogo de servicios
          <span className="ml-2 text-xs font-normal text-muted">
            ({services.length})
          </span>
        </h2>
        <span
          aria-hidden
          className={`text-muted transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        >
          ▾
        </span>
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted">
            Cada servicio tiene un costo fijo que se aplica automáticamente a las
            tareas que lo eligen. Podés ajustar el costo por tarea después.
          </p>

          {services.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay servicios.</p>
          ) : (
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-card-border bg-surface px-3 py-2"
            >
              {editingId === s.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nombre"
                    className="min-w-0 flex-1 rounded-md border border-card-border bg-background px-2 py-1.5 text-sm text-primary"
                  />
                  <input
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    inputMode="decimal"
                    placeholder="Costo ARS"
                    className="w-32 rounded-md border border-card-border bg-background px-2 py-1.5 text-sm text-primary"
                  />
                  <button
                    type="button"
                    onClick={onUpdate}
                    className="min-h-11 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="min-h-11 rounded-md bg-surface px-3 py-1.5 text-sm text-secondary"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm font-medium text-primary">
                    {s.name}
                  </span>
                  <span className="text-sm text-secondary">
                    {centsToPesosInput(s.defaultCostArs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="min-h-11 rounded-md border border-card-border px-3 py-1.5 text-sm text-secondary"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    className="min-h-11 rounded-md border border-error/40 px-3 py-1.5 text-sm text-error"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del servicio (ej: mantenimiento landing)"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          inputMode="decimal"
          placeholder="Costo fijo ARS (ej: 50000)"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="w-full min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
      >
        Agregar servicio
      </button>

      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`text-xs ${msg.kind === "error" ? "text-error" : "text-success"}`}
        >
          {msg.text}
        </p>
      )}
        </div>
      )}
    </div>
  );
}
