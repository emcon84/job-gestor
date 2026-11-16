"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createOwnerTask } from "@/app/actions";
import type { ActionResult } from "@/lib/action-types";
import { PRIORITIES, PRIORITY_LABELS, type ServiceOption } from "@/lib/domain";
import { centsToPesosInput } from "@/lib/format";

const fieldClass =
  "w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary";

/**
 * Owner form to create a task for this client with a fixed amount. The amount
 * is billed as-is, also for hourly clients (no timer, hours ignored). Picking a
 * service pre-fills the amount with its default cost; it stays editable.
 */
export default function OwnerTaskForm({
  clientId,
  services,
}: {
  clientId: string;
  services: ServiceOption[];
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [priority, setPriority] = useState("medium");
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function onServiceChange(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      setAmount(centsToPesosInput(svc.defaultCostArs));
    }
  }

  async function onCreate() {
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("area", area);
    fd.set("priority", priority);
    fd.set("serviceId", serviceId);
    fd.set("amountArs", amount);
    setPending(true);
    const r: ActionResult = await createOwnerTask(fd);
    setPending(false);
    setMsg(
      r.ok
        ? { kind: "success", text: r.message ?? "Creada." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) {
      setTitle("");
      setDescription("");
      setArea("");
      setPriority("medium");
      setServiceId("");
      setAmount("");
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
          Nueva tarea
          <span className="ml-2 text-xs font-normal text-muted">monto fijo</span>
        </h2>
        <ChevronDown
          className={`h-5 w-5 text-muted transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted">
            El monto se cobra tal cual, también en clientes por hora (no se
            cronometra).
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            aria-label="Título"
            className={fieldClass}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            aria-label="Descripción"
            rows={3}
            className={fieldClass}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Área o sistema"
              aria-label="Área o sistema"
              className={fieldClass}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Prioridad"
              className={fieldClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  Prioridad {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <select
              value={serviceId}
              onChange={(e) => onServiceChange(e.target.value)}
              aria-label="Servicio"
              className={fieldClass}
            >
              <option value="">Sin clasificar</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Monto fijo ARS"
              aria-label="Monto fijo ARS"
              className={fieldClass}
            />
          </div>
          {msg && (
            <p
              role={msg.kind === "error" ? "alert" : "status"}
              className={`text-sm ${msg.kind === "error" ? "text-error" : "text-success"}`}
            >
              {msg.text}
            </p>
          )}
          <button
            type="button"
            onClick={onCreate}
            disabled={pending}
            className="w-full min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Creando..." : "Crear tarea"}
          </button>
        </div>
      )}
    </div>
  );
}
