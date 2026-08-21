"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/app/actions";
import type { Comment } from "@/lib/domain";

const AUTHOR_LABEL: Record<Comment["author"], string> = {
  client: "Cliente",
  owner: "Tú",
};

const AUTHOR_BADGE: Record<Comment["author"], string> = {
  client: "bg-status-progress/15 text-status-progress",
  owner: "bg-accent/15 text-accent",
};

function formatCommentDate(d: Date): string {
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Task comment thread shared by the owner drawer and the portal task modal.
 * Renders the existing comments (oldest first) plus a textarea + "Comentar"
 * button that calls the `addComment` server action and refreshes the route.
 */
export default function CommentThread({
  taskId,
  comments,
}: {
  taskId: string;
  comments: Comment[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!body.trim()) {
      setMsg({ kind: "error", text: "Escribí un comentario." });
      return;
    }
    setSending(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("body", body);
    const r = await addComment(fd);
    setSending(false);
    setMsg(
      r.ok
        ? { kind: "success", text: "Comentario agregado." }
        : { kind: "error", text: r.error ?? "Error." },
    );
    if (r.ok) {
      setBody("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted">Sin comentarios todavía.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-card-border bg-surface p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${AUTHOR_BADGE[c.author]}`}
                >
                  {AUTHOR_LABEL[c.author]}
                </span>
                <time className="text-[11px] text-muted">
                  {formatCommentDate(c.createdAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm text-secondary">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
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