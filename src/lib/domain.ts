/**
 * Domain model and pure business logic for job-gestor.
 *
 * These types and functions are deliberately free of any framework, database,
 * or network dependency so they can be unit-tested in isolation and shared by
 * both the server actions and the UI.
 */

export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "revision" | "done";
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
  revision: "en revisión",
  done: "hecho",
};

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const STATUSES: TaskStatus[] = ["pending", "in_progress", "revision", "done"];

/** Hard limit on how many status moves a client (portal) can make per task. */
export const MAX_CLIENT_MOVES = 5;

/**
 * Whether the client portal may still move this task's status. Blocked once the
 * task is done or the client has used all its moves.
 */
export function canClientMove(task: {
  status: TaskStatus;
  clientMoveCount: number;
}): boolean {
  return task.status !== "done" && task.clientMoveCount < MAX_CLIENT_MOVES;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

export type CommentAuthor = "client" | "owner";

/** A single message in a task's comment thread. */
export interface Comment {
  id: string;
  taskId: string;
  body: string;
  author: CommentAuthor;
  /** Display name of the author. Nullable for legacy rows created before this field existed. */
  authorName: string | null;
  createdAt: Date;
}

/** Fields required to add a comment to a task thread. */
export interface NewComment {
  taskId: string;
  body: string;
  author: CommentAuthor;
  authorName?: string | null;
}

/** Maximum length of a comment body, enforced on the server. */
export const COMMENT_MAX_LENGTH = 2000;

/** Maximum length of a comment author name, enforced on the server. */
export const COMMENT_AUTHOR_NAME_MAX_LENGTH = 60;

/**
 * Validates a comment body. Returns an error message, or null when valid.
 * The caller is expected to have already trimmed the input.
 */
export function validateCommentBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return "El comentario no puede estar vacío.";
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return `El comentario es demasiado largo (máx. ${COMMENT_MAX_LENGTH} caracteres).`;
  }
  return null;
}

/**
 * Validates a client-submitted author name. Empty is allowed (the caller falls
 * back to a default label). Returns an error message, or null when valid.
 * The caller is expected to have already trimmed the input.
 */
export function validateCommentAuthorName(name: string): string | null {
  if (name.length > COMMENT_AUTHOR_NAME_MAX_LENGTH) {
    return `El nombre es demasiado largo (máx. ${COMMENT_AUTHOR_NAME_MAX_LENGTH} caracteres).`;
  }
  return null;
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
  /** Number of status moves the client has already made on this task. */
  clientMoveCount: number;
  /** Amount in ARS, stored as integer cents. Auto-filled from the assigned service. */
  amountArs: number;
  paymentState: PaymentState | null;
  /** Optional date by which the payment is due (null = no due date). */
  paymentDueDate: Date | null;
  /** The catalog service this task is assigned to. */
  serviceId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  attachments: Attachment[];
  /** Comment thread for this task, oldest first. Loaded with the task. */
  comments: Comment[];
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
  /** Client-initiated move count. Only the client move action sets this. */
  clientMoveCount?: number;
  amountArs?: number;
  paymentState?: PaymentState | null;
  /** Optional payment due date. `null` clears an existing value. */
  paymentDueDate?: Date | null;
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
    revision: [],
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

/**
 * Parses a payment due date from an HTML `<input type="date">` value
 * ("YYYY-MM-DD"). Returns a Date at local midnight, or null when the input is
 * empty or not a real calendar date (e.g. "2026-02-31").
 */
export function parseDueDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Reject dates the calendar rolls over (e.g. 2026-02-31 -> March 3rd).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Whether a payment due date is overdue: strictly before the start of `today`
 * (compared at date granularity, so the due date itself is not "overdue").
 */
export function isDueDateOverdue(dueDate: Date, today: Date = new Date()): boolean {
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return dueDate.getTime() < startOfToday.getTime();
}
