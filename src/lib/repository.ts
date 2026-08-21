/**
 * Task repository — the data-access abstraction.
 *
 * Server actions and pages depend on this interface, never on a concrete store.
 * Two implementations exist:
 *
 *  - `MemoryRepository`  — in-memory, for local dev and unit tests without a DB.
 *  - `PostgresRepository`— Drizzle + postgres.js against Neon (production).
 *
 * The factory in `store.ts` selects the implementation based on the presence of
 * `DATABASE_URL`, so the app runs identically with or without a real database.
 */
import type {
  Comment,
  NewComment,
  NewPushSubscription,
  NewService,
  NewTask,
  PushSubscription,
  Service,
  ServiceOption,
  ServiceUpdate,
  Task,
  TaskUpdate,
} from "./domain";

export interface TaskRepository {
  /** Lists all tasks, newest first, each carrying its attachments and comments. */
  listTasks(): Promise<Task[]>;
  /** Returns a single task with its attachments and comments, or null. */
  getTask(id: string): Promise<Task | null>;
  /** Creates a task with its attachments and resolves its cost from a service. */
  createTask(input: NewTask): Promise<Task>;
  /** Updates a task (status/amount/payment). Overwrites — no history. */
  updateTask(id: string, update: TaskUpdate): Promise<Task | null>;
  /** Deletes a task, its attachments, and its comments. */
  deleteTask(id: string): Promise<void>;
  /** Lists a task's comments, oldest first. Empty when the task has none. */
  listCommentsByTask(taskId: string): Promise<Comment[]>;
  /** Adds a comment to a task. Returns null when the task doesn't exist. */
  addComment(input: NewComment): Promise<Comment | null>;
  /** Lists all stored push subscriptions (one per device/browser). */
  listPushSubscriptions(): Promise<PushSubscription[]>;
  /** Stores a push subscription, upserting by endpoint. */
  addPushSubscription(input: NewPushSubscription): Promise<PushSubscription>;
  /** Removes a push subscription by its endpoint (e.g. a 404/410 from the push service). */
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
}

/** Service catalog data-access contract. */
export interface ServiceRepository {
  /** Lists all services (catalog order). */
  listServices(): Promise<ServiceOption[]>;
  /** Creates a service in the catalog. */
  createService(input: NewService): Promise<Service>;
  /** Updates a service name / default cost. */
  updateService(id: string, update: ServiceUpdate): Promise<Service | null>;
  /** Deletes a service from the catalog. Returns false if it is referenced by tasks. */
  deleteService(id: string): Promise<boolean>;
  /** Resolves the default cost (cents) for a service, or null if it doesn't exist. */
  resolveServiceCost(id: string | null): Promise<number | null>;
}

/** Combined repository contract used by server actions and pages. */
export type Repository = TaskRepository & ServiceRepository;
