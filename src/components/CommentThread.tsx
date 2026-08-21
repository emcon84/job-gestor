"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/app/actions";
import type { Comment } from "@/lib/domain";

const COMMENT_AUTHOR_NAME_MAX_LENGTH = 60;
const COMMENT_MAX_LENGTH = 2000;

/** Fallback display name for legacy comments stored before authorName existed. */
function commentDisplayName(c: Comment): string {
  if (c.authorName) {
    return c.authorName;
  }
  return c.author === "owner" ? "Propietario" : "Cliente";
}

/** First letter of the display name, uppercased, for the avatar circle. */
function avatarInitial(c: Comment): string {
  const name = commentDisplayName(c).trim();
  return name.charAt(0).toUpperCase() || "?";
}

/** Compact relative-ish timestamp: day/month + time (es-AR). */
function formatCommentDate(d: Date): string {
  const date = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/**
 * Social-network style task comment thread, shared by the owner drawer and the
 * portal card. Each comment is a row with an avatar, name, relative timestamp,
 * and body; owner rows get an accent highlight so the two sides read apart.
 *
 * portal mode: shows a name input + textarea + "Comentar" (both required).
 * owner mode: no name input; the server labels the author "Propietario".
 */
export default function CommentThread({
  taskId,
  comments,
  mode,
}: {
  taskId: string;
  comments: Comment[];
  mode: "portal" | "owner";
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!body.trim()) {
      setMsg({ kind: "error", text: "Escribí un comentario." });
      return;
    }
    if (mode === "portal" && !name.trim()) {
      setMsg({ kind: "error", text: "Ingresá tu nombre." });
      return;
    }
    setSending(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("body", body);
    if (mode === "portal") {
      fd.set("authorName", name);
    }
    const r = await addComment(fd);
    setSending(false);
    setMsg(
      r.ok
        ? { kind: "success", text: "Comentario agregado." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) {
      setBody("");
      setName("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted">Sin comentarios todavía.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const isOwner = c.author === "owner";
            return (
              <li
                key={c.id}
                className={`flex gap-3 rounded-xl border p-3 ${
                  isOwner
                    ? "border-accent/25 bg-surface/50"
                    : "border-card-border bg-surface"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    isOwner
                      ? "bg-accent/20 text-accent"
                      : "bg-status-progress/15 text-status-progress"
                  }`}
                >
                  {avatarInitial(c)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-primary">
                      {commentDisplayName(c)}
                    </span>
                    <time className="text-[11px] text-muted">
                      {formatCommentDate(c.createdAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-secondary">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        {mode === "portal" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={COMMENT_AUTHOR_NAME_MAX_LENGTH}
            placeholder="Tu nombre"
            autoComplete="name"
            className="w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted"
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Escribí un comentario…"
          className="w-full resize-y rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted"
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending}
          className="w-full min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Comentar
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
    </div>
  );
}
