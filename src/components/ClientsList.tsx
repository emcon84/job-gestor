"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/actions";
import type { ActionResult } from "@/lib/action-types";
import type { Client } from "@/lib/domain";
import { formatArs } from "@/lib/format";

export interface ClientWithCount {
  client: Client;
  taskCount: number;
}

/**
 * Owner client index: one card per client (name, slug, pack threshold, task
 * count, link to the per-client panel) plus a "Crear cliente" form. The slug
 * defaults from the name when left empty; the owner may still edit it.
 */
export default function ClientsList({
  clients,
}: {
  clients: ClientWithCount[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [threshold, setThreshold] = useState("150000");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );

  async function onCreate() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("slug", slug);
    fd.set("packThresholdArs", threshold);
    const r: ActionResult = await createClient(fd);
    setMsg(
      r.ok
        ? { kind: "success", text: r.message ?? "Cliente creado." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) {
      setName("");
      setSlug("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-card-border bg-card p-5">
        <h2 className="mb-1 text-lg font-semibold text-primary">Crear cliente</h2>
        <p className="mb-4 text-xs text-muted">
          Cada cliente tiene su propio portal (/c/slug), catálogo de servicios y
          abono. Si dejás el slug vacío, se genera solo desde el nombre.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej: Cliente 1)"
            className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Slug (ej: cliente-1)"
            className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
          />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="decimal"
            placeholder="Abono ARS (ej: 150000)"
            className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
          />
          <button
            type="button"
            onClick={onCreate}
            className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
          >
            Crear cliente
          </button>
        </div>
        {msg && (
          <p
            role={msg.kind === "error" ? "alert" : "status"}
            className={`mt-2 text-xs ${msg.kind === "error" ? "text-error" : "text-success"}`}
          >
            {msg.text}
          </p>
        )}
      </section>

      {clients.length === 0 ? (
        <p className="rounded-2xl border border-card-border bg-card p-6 text-center text-muted">
          Todavía no hay clientes. Creá el primero arriba.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clients.map(({ client, taskCount }) => (
            <li key={client.id}>
              <Link
                href={`/owner/${client.slug}`}
                className="block rounded-2xl border border-card-border bg-card p-5 transition-colors hover:border-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-primary">
                    {client.name}
                  </h2>
                  <span className="rounded-full border border-card-border bg-surface px-2 py-0.5 text-xs text-muted">
                    {taskCount} {taskCount === 1 ? "tarea" : "tareas"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-secondary">/c/{client.slug}</p>
                <p className="mt-1 text-sm text-secondary">
                  Abono: {formatArs(client.packThresholdCents)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}