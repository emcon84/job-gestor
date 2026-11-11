"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/** Previous / next pager. Renders nothing when everything fits in one page. */
export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const button =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary transition-colors hover:border-accent hover:text-primary disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-3">
      <button
        type="button"
        className={button}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Anterior
      </button>
      <span className="text-sm text-muted">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className={button}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
