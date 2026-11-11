/**
 * Pure view helpers for task lists: text/priority filtering, ordering of
 * completed tasks, and pagination. Framework-free so they are unit-testable
 * and shared by the owner kanban and the client portal.
 */
import type { Priority, Task } from "@/lib/domain";

export type PriorityFilter = Priority | "all";

export interface TaskFilter {
  query: string;
  priority: PriorityFilter;
}

/** Lowercases and strips diacritics so "Menú" matches "menu". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Keeps tasks whose title, area or description contain the query and match the priority. */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  const query = normalize(filter.query.trim());
  return tasks.filter((t) => {
    if (filter.priority !== "all" && t.priority !== filter.priority) return false;
    if (query === "") return true;
    return normalize(`${t.title} ${t.area} ${t.description}`).includes(query);
  });
}

/** Returns a copy ordered by completion time (fallback: last update), newest first. */
export function sortRecentlyCompleted(tasks: Task[]): Task[] {
  const time = (t: Task) => (t.completedAt ?? t.updatedAt).getTime();
  return [...tasks].sort((a, b) => time(b) - time(a));
}

export interface Page<T> {
  items: T[];
  /** 1-based page actually returned (clamped to the valid range). */
  page: number;
  totalPages: number;
}

/** Slices a 1-based page out of the items, clamping out-of-range pages. */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: current, totalPages };
}
