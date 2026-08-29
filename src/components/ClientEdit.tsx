"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClient } from "@/app/actions";
import type { ActionResult } from "@/lib/action-types";
import type { Client } from "@/lib/domain";
import { centsToPesosInput } from "@/lib/format";

/**
 * Owner inline edit controls for a single client: name, slug, and pack
 * threshold. Saving runs the updateClient server action and refreshes the
 * route so the header / progress bar reflect the new values.
 */
export default function ClientEdit({ client }: { client: Client }) {
  const router = useRouter();
  const [name, setName] = useState(client.name);
  const [slug, setSlug] = useState(client.slug);
  const [threshold, setThreshold] = useState(
    centsToPesosInput(client.packThresholdCents),
  );
  const [username, setUsername] = useState(client.username ?? "");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState(client.portalMessage ?? "");
  const [showBar, setShowBar] = useState(client.showPackProgress);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );

  async function onSave() {
    const fd = new FormData();
    fd.set("id", client.id);
    fd.set("name", name);
    fd.set("slug", slug);
    fd.set("packThresholdArs", threshold);
    fd.set("username", username);
    fd.set("password", password);
    fd.set("portalMessage", note);
    fd.set("showPackProgress", showBar ? "on" : "");
    const r: ActionResult = await updateClient(fd);
    setMsg(
      r.ok
        ? { kind: "success", text: r.message ?? "Guardado." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) {
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card p-5">
      <h2 className="mb-1 text-lg font-semibold text-primary">Configuración</h2>
      <p className="mb-4 text-xs text-muted">
        Cambiar el slug cambia la URL del portal del cliente.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Slug"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          placeholder="Abono ARS"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario"
          autoComplete="off"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="new-password"
          placeholder="Dejá vacío para no cambiarla"
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {client.username
          ? "El cliente ingresa con usuario"
          : "Sin acceso por usuario configurado (usa el enlace directo)"}
      </p>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-secondary">
          Sección {"Tu abono"} del portal
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Mensaje del abono (opcional). Si lo dejás vacío, se usa el texto por defecto."
          rows={3}
          className="w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={showBar}
            onChange={(e) => setShowBar(e.target.checked)}
            className="h-4 w-4"
          />
          Mostrar la barra de gasto del abono
        </label>
        <p className="text-xs text-muted">
          Estos controles personalizan la sección {"Tu abono"} en el portal del
          cliente.
        </p>
      </div>
      <button
        type="button"
        onClick={onSave}
        className="mt-3 min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        Guardar
      </button>
      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`mt-2 text-xs ${msg.kind === "error" ? "text-error" : "text-success"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}