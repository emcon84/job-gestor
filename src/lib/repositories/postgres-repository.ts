/**
 * Production repository (tasks + services) backed by PostgreSQL (Neon) through
 * Drizzle. Rows are mapped to the shared domain models. Edits overwrite current
 * values (no history), and deleting a task cascades to its attachments.
 */
import { and, desc, eq, inArray, notExists } from "drizzle-orm";
import type {
  Client,
  ClientUpdate,
  Comment,
  CommentAuthor,
  NewClient,
  NewComment,
  NewPushSubscription,
  NewService,
  NewTask,
  PaymentState,
  Priority,
  PushSubscription,
  Service,
  ServiceOption,
  ServiceUpdate,
  Task,
  TaskStatus,
  TaskUpdate,
} from "../domain";
import { resolveCompletedAt } from "../domain";
import type {
  ClientRepository,
  ServiceRepository,
  TaskRepository,
} from "../repository";
import { db } from "../db";
import {
  attachments,
  clients,
  comments,
  pushSubscriptions,
  services,
  tasks,
} from "../schema";
import type {
  AttachmentRow,
  ClientRow,
  CommentRow,
  PushSubscriptionRow,
} from "../schema";

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
    clientMoveCount: row.clientMoveCount,
    amountArs: row.amountArs,
    paymentState: row.paymentState as PaymentState | null,
    paymentDueDate: row.paymentDueDate,
    serviceId: row.serviceId,
    clientId: row.clientId,
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
    authorName: row.authorName,
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
    clientId: row.clientId,
    createdAt: row.createdAt,
  };
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    packThresholdCents: row.packThresholdCents,
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

function mapPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    createdAt: row.createdAt,
  };
}

export class PostgresRepository
  implements ClientRepository, TaskRepository, ServiceRepository
{
  async listClients(): Promise<Client[]> {
    const rows = await db.select().from(clients).orderBy(clients.createdAt);
    return rows.map(mapClient);
  }

  async getClient(id: string): Promise<Client | null> {
    const [row] = await db.select().from(clients).where(eq(clients.id, id));
    return row ? mapClient(row) : null;
  }

  async getClientBySlug(slug: string): Promise<Client | null> {
    const [row] = await db.select().from(clients).where(eq(clients.slug, slug));
    return row ? mapClient(row) : null;
  }

  async createClient(input: NewClient): Promise<Client> {
    const [row] = await db
      .insert(clients)
      .values({
        name: input.name,
        slug: input.slug,
        packThresholdCents: input.packThresholdCents,
      })
      .returning();
    return mapClient(row);
  }

  async updateClient(id: string, update: ClientUpdate): Promise<Client | null> {
    const [existing] = await db.select().from(clients).where(eq(clients.id, id));
    if (!existing) {
      return null;
    }
    const [row] = await db
      .update(clients)
      .set({
        name: update.name ?? existing.name,
        slug: update.slug ?? existing.slug,
        packThresholdCents:
          update.packThresholdCents ?? existing.packThresholdCents,
      })
      .where(eq(clients.id, id))
      .returning();
    return mapClient(row);
  }

  async deleteClient(id: string): Promise<boolean> {
    // Guard: never delete a client that still has tasks or services.
    const [row] = await db
      .delete(clients)
      .where(
        and(
          eq(clients.id, id),
          notExists(
            db.select({ id: tasks.id }).from(tasks).where(eq(tasks.clientId, id)),
          ),
          notExists(
            db
              .select({ id: services.id })
              .from(services)
              .where(eq(services.clientId, id)),
          ),
        ),
      )
      .returning({ id: clients.id });
    return Boolean(row);
  }

  async listTasksByClient(clientId: string): Promise<Task[]> {
    const rows = await db
      .select()
      .from(tasks)
      .leftJoin(attachments, eq(attachments.taskId, tasks.id))
      .where(eq(tasks.clientId, clientId))
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

  async getTask(id: string): Promise<Task | null> {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!row) {
      return null;
    }
    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.taskId, id));
    const commentRows = await db
      .select()
      .from(comments)
      .where(eq(comments.taskId, id));
    return mapTask(
      { ...row, att: attRows },
      sortComments(commentRows.map(mapComment)),
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
          clientId: input.clientId,
          // Resolve the cost from the assigned service default (authoritative);
          // unclassified tasks start at 0.
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

    // Auto-fill: assigning a service to a task whose amount is still zero
    // populates the service default cost (mirrors createTask behavior).
    let amountArs =
      update.amountArs !== undefined ? update.amountArs : existing.amountArs;
    if (
      update.serviceId !== undefined &&
      update.serviceId &&
      existing.amountArs === 0 &&
      (update.amountArs === undefined || update.amountArs === 0)
    ) {
      amountArs = (await this.resolveServiceCost(update.serviceId)) ?? 0;
    }

    const [updated] = await db
      .update(tasks)
      .set({
        status,
        clientMoveCount:
          update.clientMoveCount !== undefined
            ? update.clientMoveCount
            : existing.clientMoveCount,
        amountArs,
        paymentState:
          update.paymentState !== undefined
            ? update.paymentState
            : existing.paymentState,
        paymentDueDate:
          update.paymentDueDate !== undefined
            ? update.paymentDueDate
            : existing.paymentDueDate,
        serviceId:
          update.serviceId !== undefined ? update.serviceId : existing.serviceId,
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
        authorName: input.authorName ?? null,
      })
      .returning();
    return mapComment(row);
  }

  async listServicesByClient(clientId: string): Promise<ServiceOption[]> {
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.clientId, clientId))
      .orderBy(services.createdAt);
    return rows.map(mapServiceOption);
  }

  async createService(input: NewService): Promise<Service> {
    const [row] = await db
      .insert(services)
      .values({
        name: input.name,
        defaultCostArs: input.defaultCostArs,
        clientId: input.clientId,
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

  async resolveServiceCost(id: string | null): Promise<number | null> {
    if (!id) {
      return null;
    }
    const [row] = await db
      .select({ defaultCostArs: services.defaultCostArs })
      .from(services)
      .where(eq(services.id, id));
    return row?.defaultCostArs ?? null;
  }

  async listPushSubscriptions(): Promise<PushSubscription[]> {
    const rows = await db
      .select()
      .from(pushSubscriptions)
      .orderBy(pushSubscriptions.createdAt);
    return rows.map(mapPushSubscription);
  }

  async addPushSubscription(
    input: NewPushSubscription,
  ): Promise<PushSubscription> {
    // Upsert by endpoint (unique) so re-subscribing never duplicates a row and
    // refreshes the encryption keys in place.
    const [row] = await db
      .insert(pushSubscriptions)
      .values(input)
      .onConflictDoNothing({ target: pushSubscriptions.endpoint })
      .returning();

    if (row) {
      return mapPushSubscription(row);
    }

    // Conflict on the endpoint — return the existing row (already subscribed).
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));
    return mapPushSubscription(existing!);
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }
}
