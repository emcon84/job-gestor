"use client";

import { Search } from "lucide-react";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/domain";
import type { TaskFilter } from "@/lib/task-view";

/** Search box + priority select shared by the owner kanban and the client portal. */
export default function TaskFilters({
  value,
  onChange,
}: {
  value: TaskFilter;
  onChange: (next: TaskFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-56">
        <span className="sr-only">Buscar tareas</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder="Buscar por título, área o descripción"
          className="min-h-11 w-full rounded-lg border border-card-border bg-surface py-2 pl-9 pr-3 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      <label>
        <span className="sr-only">Filtrar por prioridad</span>
        <select
          value={value.priority}
          onChange={(e) =>
            onChange({ ...value, priority: e.target.value as TaskFilter["priority"] })
          }
          className="min-h-11 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary focus:border-accent focus:outline-none"
        >
          <option value="all">Todas las prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Prioridad {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
