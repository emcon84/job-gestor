"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask, getUploadUrlAction } from "@/app/actions";
import type { ActionResult } from "@/lib/action-types";
import { MAX_ATTACHMENT_BYTES, resolveImageType } from "@/lib/r2";
import type { Attachment, ServiceOption } from "@/lib/domain";

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif," +
  "application/zip,application/x-zip-compressed,application/x-rar-compressed," +
  "application/x-7z-compressed,application/gzip,application/x-tar";

export default function SubmitForm({ services }: { services: ServiceOption[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "error" | "success"; text: string }>(
    { kind: "idle", text: "" },
  );
  const [submitting, setSubmitting] = useState(false);
  const [serviceId, setServiceId] = useState("");

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const errors: string[] = [];
    const ok: File[] = [];
    for (const f of selected) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        errors.push(`"${f.name}" supera los 10MB.`);
        continue;
      }
      if (!resolveImageType(f.type, f.name)) {
        errors.push(`"${f.name}" no es un archivo permitido (imagen o comprimido).`);
        continue;
      }
      ok.push(f);
    }
    if (errors.length) {
      setStatus({ kind: "error", text: errors.join(" ") });
    }
    setFiles((prev) => [...prev, ...ok].slice(0, 10));
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ kind: "idle", text: "" });

    try {
      const form = e.currentTarget;
      const attachments: Attachment[] = [];

      for (const file of files) {
        const contentType = file.type || "application/octet-stream";
        const { ok, uploadUrl, publicUrl } = await getUploadUrlAction(
          file.name,
          file.type || "",
        );
        if (!ok || !uploadUrl) {
          // Dev fallback (R2 not configured): keep a local object URL.
          attachments.push({
            id: crypto.randomUUID(),
            name: file.name,
            url: URL.createObjectURL(file),
            contentType,
            sizeBytes: file.size,
          });
          continue;
        }
        // Production: direct upload to Cloudflare R2 via the presigned PUT URL.
        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });
        attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          url: publicUrl ?? "",
          contentType,
          sizeBytes: file.size,
        });
      }

      const data = new FormData(form);
      data.set("attachments", JSON.stringify(attachments));

      const result: ActionResult = await createTask(data);
      if (!result.ok) {
        setStatus({ kind: "error", text: result.error ?? "Ocurrió un error." });
        return;
      }
      setStatus({ kind: "success", text: result.message ?? "Tarea enviada." });
      setFiles([]);
      form.reset();
      router.refresh();
    } catch (err) {
      // Surface the real error detail (e.g. the R2 PUT 403 body) so the
      // client can report it and we can diagnose without DevTools.
      const detail =
        err instanceof Error && err.message ? ` ${err.message}` : "";
      setStatus({
        kind: "error",
        text: `No se pudo enviar la tarea.${detail}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-card-border bg-card p-5 space-y-4"
      style={{ touchAction: "manipulation" }}
    >
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-primary">
          Título *
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary text-base focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="area" className="block text-sm font-medium text-primary">
          Área / Sistema *
        </label>
        <input
          id="area"
          name="area"
          type="text"
          required
          maxLength={80}
          placeholder="Ej: backend, app web, red..."
          className="mt-1 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary text-base focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-primary">
          Descripción *
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary text-base focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="serviceId" className="block text-sm font-medium text-primary">
          Servicio (opcional)
        </label>
        <select
          id="serviceId"
          name="serviceId"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary text-base focus:border-accent focus:outline-none"
        >
          <option value="">Sin clasificar</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Opcional: elegí el servicio si lo conocés; lo clasificamos nosotros.
        </p>
      </div>

      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-primary">
          Prioridad
        </label>
        <select
          id="priority"
          name="priority"
          defaultValue="medium"
          className="mt-1 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary text-base focus:border-accent focus:outline-none"
        >
          <option value="low">Baja</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>
      </div>

      <div>
        <label htmlFor="attachments" className="block text-sm font-medium text-primary">
          Imágenes (opcional)
        </label>
        <input
          id="attachments"
          name="attachments"
          type="file"
          accept={ACCEPT}
          capture="environment"
          multiple
          onChange={onFileChange}
          className="mt-1 w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-sm text-secondary"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="min-h-11 min-w-11 rounded-md px-2 text-muted hover:text-primary"
                  aria-label={`Quitar ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted">
          Imágenes o comprimidos (zip/rar/7z), máx 20MB cada uno.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full min-h-11 rounded-lg bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Enviando..." : "Enviar tarea"}
      </button>

      {status.kind === "error" && (
        <p role="alert" className="rounded-md bg-error/15 px-3 py-2 text-sm text-error">
          {status.text}
        </p>
      )}
      {status.kind === "success" && (
        <p role="status" className="rounded-md bg-success/15 px-3 py-2 text-sm text-success">
          {status.text}
        </p>
      )}
    </form>
  );
}
