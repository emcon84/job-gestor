/**
 * Production repository (tasks + services) backed by PostgreSQL (Neon) through
 * Drizzle. Rows are mapped to the shared domain models. Edits overwrite current
 * values (no history), and deleting a task cascades to its attachments.
 */
import { and, desc, eq, inArray, notExists } from "drizzle-orm";
import type {
  Comment,
  CommentAuthor,
  NewComment,
  NewService,
  NewTask,
  PaymentState,
  Priority,
  Service,
  ServiceOption,
  ServiceUpdate,
  Task,
  TaskStatus,
  TaskUpdate,
} from "../domain";
import { resolveCompletedAt } from "../domain";
import type { ServiceRepository, TaskRepository } from "../repository";
import { db } from "../db";
import { attachments, comments, services, tasks } from "../schema";
import type { AttachmentRow, CommentRow } from "../schema";

function mapTask(
  row: (typeof tasks.$inferSelect) & { att: AttachmentRow[] },
  taskComments: Comment[],
): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    area: row.area,
    priority: row.priority as Priority,
    status: row.status as TaskStatus,
    amountArs: row.amountArs,
    paymentState: row.paymentState as PaymentState | null,
    serviceId: row.serviceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    attachments: row.att.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
    })),
    comments: taskComments,
  };
}

function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.taskId,
    body: row.body,
    author: row.author as CommentAuthor,
    createdAt: row.createdAt,
  };
}

/** Sorts comments oldest first (thread order, newest at the bottom). */
function sortComments(list: Comment[]): Comment[] {
  return list.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function mapService(row: (typeof services.$inferSelect)): Service {
  return {
    id: row.id,
    name: row.name,
    defaultCostArs: row.defaultCostArs,
    createdAt: row.createdAt,
  };
}

function mapServiceOption(row: (typeof services.$inferSelect)): ServiceOption {
  return {
    id: row.id,
    name: row.name,
    defaultCostArs: row.defaultCostArs,
  };
}

export class PostgresRepository implements TaskRepository, ServiceRepository {
  async listTasks(): Promise<Task[]> {
    const rows = await db
      .select()
      .from(tasks)
      .leftJoin(attachments, eq(attachments.taskId, tasks.id))
      .orderBy(desc(tasks.createdAt));

    const grouped = new Map<
      string,
      (typeof tasks.$inferSelect) & { att: AttachmentRow[] }
    >();
    for (const { tasks: t, attachments: a } of rows) {
      const entry = grouped.get(t.id) ?? { ...t, att: [] };
      if (a) {
        entry.att.push(a);
      }
      grouped.set(t.id, entry);
    }

    // Batch-load all comment threads for the listed tasks (single IN query).
    const taskIds = [...grouped.keys()];
    const commentRows =
      taskIds.length > 0
        ? await db
            .select()
            .from(comments)
            .where(inArray(comments.taskId, taskIds))
        : [];
    const commentsByTask = new Map<string, Comment[]>();
    for (const c of commentRows) {
      const list = commentsByTask.get(c.taskId) ?? [];
      list.push(mapComment(c));
      commentsByTask.set(c.taskId, list);
    }
    for (const list of commentsByTask.values()) {
      sortComments(list);
    }

    return [...grouped.values()].map((row) =>
      mapTask(row, commentsByTask.get(row.id) ?? []),
    );
  }

  async createTask(input: NewTask): Promise<Task> {
    const created = await db.transaction(async (tx) => {
      const [taskRow] = await tx
        .insert(tasks)
        .values({
          title: input.title,
          description: input.description,
          area: input.area,
          priority: input.priority,
          serviceId: input.serviceId,
          // Resolve the cost from the assigned service default (authoritative).
          amountArs: (await this.resolveServiceCost(input.serviceId)) ?? 0,
        })
        .returning();

      for (const att of input.attachments) {
        await tx.insert(attachments).values({
          id: att.id,
          taskId: taskRow.id,
          name: att.name,
          url: att.url,
          contentType: att.contentType,
          sizeBytes: att.sizeBytes,
        });
      }
      return taskRow;
    });

    return mapTask(
      {
        ...created,
        att: input.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          taskId: created.id,
          createdAt: new Date(),
        })),
      },
      [],
    );
  }

  async updateTask(id: string, update: TaskUpdate): Promise<Task | null> {
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!existing) {
      return null;
    }
    const status = update.status ?? existing.status;
    const completedAt = resolveCompletedAt(status, new Date(), existing.completedAt);

    const [updated] = await db
      .update(tasks)
      .set({
        status,
        amountArs:
          update.amountArs !== undefined ? update.amountArs : existing.amountArs,
        paymentState:
          update.paymentState !== undefined
            ? update.paymentState
            : existing.paymentState,
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.taskId, id));
    const commentRows = await db
      .select()
      .from(comments)
      .where(eq(comments.taskId, id));

    return mapTask(
      { ...updated, att: attRows },
      sortComments(commentRows.map(mapComment)),
    );
  }

  async deleteTask(id: string): Promise<void> {
    // Cascade delete of attachments and comments happens in the DB
    // (onDelete: 'cascade' on both tables).
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async listCommentsByTask(taskId: string): Promise<Comment[]> {
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.taskId, taskId));
    return sortComments(rows.map(mapComment));
  }

  async addComment(input: NewComment): Promise<Comment | null> {
    // Guard the FK: return null instead of letting the insert raise when the
    // task doesn't exist (mirrors the memory repository behavior).
    const [existing] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, input.taskId));
    if (!existing) {
      return null;
    }
    const [row] = await db
      .insert(comments)
      .values({
        taskId: input.taskId,
        body: input.body,
        author: input.author,
      })
      .returning();
    return mapComment(row);
  }

  async listServices(): Promise<ServiceOption[]> {
    const rows = await db
      .select()
      .from(services)
      .orderBy(services.createdAt);
    return rows.map(mapServiceOption);
  }

  async createService(input: NewService): Promise<Service> {
    const [row] = await db
      .insert(services)
      .values({
        name: input.name,
        defaultCostArs: input.defaultCostArs,
      })
      .returning();
    return mapService(row);
  }

  async updateService(id: string, update: ServiceUpdate): Promise<Service | null> {
    const [existing] = await db.select().from(services).where(eq(services.id, id));
    if (!existing) {
      return null;
    }
    const [row] = await db
      .update(services)
      .set({
        name: update.name ?? existing.name,
        defaultCostArs:
          update.defaultCostArs !== undefined
            ? update.defaultCostArs
            : existing.defaultCostArs,
      })
      .where(eq(services.id, id))
      .returning();
    return mapService(row);
  }

  async deleteService(id: string): Promise<boolean> {
    // Guard: never attempt to delete a service that tasks still reference.
    // The WHERE clause prevents the FK (ON DELETE no action) from raising at runtime.
    const [row] = await db
      .delete(services)
      .where(
        and(
          eq(services.id, id),
          notExists(
            db.select({ id: tasks.id }).from(tasks).where(eq(tasks.serviceId, id)),
          ),
        ),
      )
      .returning({ id: services.id });
    return Boolean(row);
  }

  async resolveServiceCost(id: string): Promise<number | null> {
    const [row] = await db
      .select({ defaultCostArs: services.defaultCostArs })
      .from(services)
      .where(eq(services.id, id));
    return row?.defaultCostArs ?? null;
  }
}
