/**
 * Domain model and pure business logic for job-gestor.
 *
 * These types and functions are deliberately free of any framework, database,
 * or network dependency so they can be unit-tested in isolation and shared by
 * both the server actions and the UI.
 */

export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "done";
export type PaymentState = "paid" | "pending";

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "pendiente",
  in_progress: "en curso",
  done: "hecho",
};

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const STATUSES: TaskStatus[] = ["pending", "in_progress", "done"];

export interface Attachment {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * A service in the owner-defined catalog. Each service has a fixed default cost
 * in ARS (integer cents). Tasks are assigned to a service, which auto-fills the
 * task amount; the owner may still override the per-task cost later.
 */
export interface Service {
  id: string;
  name: string;
  /** Default cost in ARS, stored as integer cents. */
  defaultCostArs: number;
  createdAt: Date;
}

/** Fields required to create a new catalog service. */
export interface NewService {
  name: string;
  defaultCostArs: number;
}

/** Fields the owner may edit on an existing service. */
export interface ServiceUpdate {
  name?: string;
  defaultCostArs?: number;
}

/** Service entity with the data needed for a form/selector. */
export interface ServiceOption {
  id: string;
  name: string;
  defaultCostArs: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  area: string;
  priority: Priority;
  status: TaskStatus;
  /** Amount in ARS, stored as integer cents. Auto-filled from the assigned service. */
  amountArs: number;
  paymentState: PaymentState | null;
  /** The catalog service this task is assigned to. */
  serviceId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  attachments: Attachment[];
}

/** Fields required to create a new task (client submits these). */
export interface NewTask {
  title: string;
  description: string;
  area: string;
  priority: Priority;
  /** Catalog service assigned by the client on submit. */
  serviceId: string;
  attachments: Attachment[];
}

/** Fields the owner may edit on an existing task (status / amount / payment). */
export interface TaskUpdate {
  status?: TaskStatus;
  amountArs?: number;
  paymentState?: PaymentState | null;
}

export type KanbanColumns = Record<TaskStatus, Task[]>;

/**
 * Groups a list of tasks into the three kanban columns.
 * Order is preserved within each column (caller should pass newest-first).
 */
export function groupByStatus(tasks: Task[]): KanbanColumns {
  const columns: KanbanColumns = {
    pending: [],
    in_progress: [],
    done: [],
  };
  for (const task of tasks) {
    columns[task.status].push(task);
  }
  return columns;
}

/**
 * Determines the new value for `completedAt` when a task's status changes.
 * Returns the given timestamp when moving INTO `done`; returns null when moving
 * OUT of `done` (e.g. reopened); returns the existing value otherwise.
 */
export function resolveCompletedAt(
  nextStatus: TaskStatus,
  now: Date,
  existing: Date | null,
): Date | null {
  if (nextStatus === "done") {
    return now;
  }
  if (existing) {
    // Not moving into done, but the task was previously completed -> reopen.
    return null;
  }
  return existing;
}
