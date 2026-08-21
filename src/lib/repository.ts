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
  NewService,
  NewTask,
  Service,
  ServiceOption,
  ServiceUpdate,
  Task,
  TaskUpdate,
} from "./domain";

export interface TaskRepository {
  /** Lists all tasks, newest first. */
  listTasks(): Promise<Task[]>;
  /** Creates a task with its attachments and resolves its cost from a service. */
  createTask(input: NewTask): Promise<Task>;
  /** Updates a task (status/amount/payment). Overwrites — no history. */
  updateTask(id: string, update: TaskUpdate): Promise<Task | null>;
  /** Deletes a task and its attachments. */
  deleteTask(id: string): Promise<void>;
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
  resolveServiceCost(id: string): Promise<number | null>;
}

/** Combined repository contract used by server actions and pages. */
export type Repository = TaskRepository & ServiceRepository;
