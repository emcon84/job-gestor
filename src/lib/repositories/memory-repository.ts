/**
 * In-memory repository (tasks + services).
 *
 * Dev fallback used when no DATABASE_URL is present, so the UI and unit tests
 * can run locally without Neon. Data lives in Maps and is lost on restart.
 */
import { randomUUID } from "node:crypto";
import type {
  Client,
  ClientUpdate,
  Comment,
  NewClient,
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
} from "../domain";
import { resolveCompletedAt } from "../domain";
import type {
  ClientRepository,
  ServiceRepository,
  TaskRepository,
} from "../repository";

export class MemoryRepository
  implements ClientRepository, TaskRepository, ServiceRepository
{
  private clients = new Map<string, Client>();
  private tasks = new Map<string, Task>();
  private services = new Map<string, Service>();
  private seq = 0;
  private order = new Map<string, number>();
  private comments = new Map<string, { comment: Comment; seq: number }[]>();
  private commentSeq = 0;
  private pushSubs = new Map<string, PushSubscription>();

  async listClients(): Promise<Client[]> {
    return [...this.clients.values()].sort((a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async getClient(id: string): Promise<Client | null> {
    return this.clients.get(id) ?? null;
  }

  async getClientBySlug(slug: string): Promise<Client | null> {
    for (const c of this.clients.values()) {
      if (c.slug === slug) {
        return { ...c };
      }
    }
    return null;
  }

  async createClient(input: NewClient): Promise<Client> {
    const client: Client = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      packThresholdCents: input.packThresholdCents,
      createdAt: new Date(),
    };
    this.clients.set(client.id, client);
    return { ...client };
  }

  async updateClient(id: string, update: ClientUpdate): Promise<Client | null> {
    const existing = this.clients.get(id);
    if (!existing) {
      return null;
    }
    const updated: Client = {
      ...existing,
      name: update.name ?? existing.name,
      slug: update.slug ?? existing.slug,
      packThresholdCents:
        update.packThresholdCents ?? existing.packThresholdCents,
    };
    this.clients.set(id, updated);
    return { ...updated };
  }

  async deleteClient(id: string): Promise<boolean> {
    const hasTasks = [...this.tasks.values()].some((t) => t.clientId === id);
    const hasServices = [...this.services.values()].some(
      (s) => s.clientId === id,
    );
    if (hasTasks || hasServices) {
      return false;
    }
    return this.clients.delete(id);
  }

  async listTasksByClient(clientId: string): Promise<Task[]> {
    return [...this.tasks.values()]
      .filter((t) => t.clientId === clientId)
      .sort((a, b) => {
        const ta = a.createdAt.getTime();
        const tb = b.createdAt.getTime();
        if (ta !== tb) {
          return tb - ta;
        }
        // Stable tie-break by insertion order (newest inserted first).
        return (this.order.get(b.id) ?? 0) - (this.order.get(a.id) ?? 0);
      });
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async createTask(input: NewTask): Promise<Task> {
    const now = new Date();
    const cost = await this.resolveServiceCost(input.serviceId);
    const task: Task = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      area: input.area,
      priority: input.priority,
      status: "pending",
      clientMoveCount: 0,
      amountArs: cost ?? 0,
      paymentState: null,
      paymentDueDate: null,
      serviceId: input.serviceId,
      clientId: input.clientId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      attachments: input.attachments.map((a) => ({ ...a })),
      comments: [],
    };
    this.tasks.set(task.id, task);
    this.order.set(task.id, this.seq++);
    return task;
  }

  async updateTask(id: string, update: TaskUpdate): Promise<Task | null> {
    const existing = this.tasks.get(id);
    if (!existing) {
      return null;
    }
    const status = update.status ?? existing.status;
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
    const updated: Task = {
      ...existing,
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
      completedAt: resolveCompletedAt(status, new Date(), existing.completedAt),
      updatedAt: new Date(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
    this.order.delete(id);
    this.comments.delete(id);
  }

  async listCommentsByTask(taskId: string): Promise<Comment[]> {
    const list = this.comments.get(taskId) ?? [];
    return list
      .slice()
      .sort((a, b) => {
        const ta = a.comment.createdAt.getTime();
        const tb = b.comment.createdAt.getTime();
        if (ta !== tb) {
          return ta - tb;
        }
        return a.seq - b.seq;
      })
      .map(({ comment }) => ({ ...comment }));
  }

  async addComment(input: NewComment): Promise<Comment | null> {
    const stored = this.tasks.get(input.taskId);
    if (!stored) {
      return null;
    }
    const comment: Comment = {
      id: randomUUID(),
      taskId: input.taskId,
      body: input.body,
      author: input.author,
      authorName: input.authorName ?? null,
      createdAt: new Date(),
    };
    const list = this.comments.get(input.taskId) ?? [];
    list.push({ comment, seq: this.commentSeq++ });
    this.comments.set(input.taskId, list);
    // Keep the stored task's own thread in sync so listTasks returns it.
    stored.comments.push(comment);
    return { ...comment };
  }

  async listServicesByClient(clientId: string): Promise<ServiceOption[]> {
    return [...this.services.values()]
      .filter((s) => s.clientId === clientId)
      .map((s) => ({
        id: s.id,
        name: s.name,
        defaultCostArs: s.defaultCostArs,
      }));
  }

  async createService(input: NewService): Promise<Service> {
    const service: Service = {
      id: randomUUID(),
      name: input.name,
      defaultCostArs: input.defaultCostArs,
      clientId: input.clientId,
      createdAt: new Date(),
    };
    this.services.set(service.id, service);
    return service;
  }

  async updateService(id: string, update: ServiceUpdate): Promise<Service | null> {
    const existing = this.services.get(id);
    if (!existing) {
      return null;
    }
    const updated: Service = {
      ...existing,
      name: update.name ?? existing.name,
      defaultCostArs:
        update.defaultCostArs !== undefined
          ? update.defaultCostArs
          : existing.defaultCostArs,
    };
    this.services.set(id, updated);
    return updated;
  }

  async deleteService(id: string): Promise<boolean> {
    const inUse = [...this.tasks.values()].some((t) => t.serviceId === id);
    if (inUse) {
      return false;
    }
    return this.services.delete(id);
  }

  async resolveServiceCost(id: string | null): Promise<number | null> {
    if (!id) {
      return null;
    }
    return this.services.get(id)?.defaultCostArs ?? null;
  }

  async listPushSubscriptions(): Promise<PushSubscription[]> {
    return [...this.pushSubs.values()];
  }

  async addPushSubscription(
    input: NewPushSubscription,
  ): Promise<PushSubscription> {
    // Upsert by endpoint so re-subscribing with the same push service never
    // duplicates a row (the schema marks endpoint unique).
    const existing = this.pushSubs.get(input.endpoint);
    const sub: PushSubscription = {
      id: existing?.id ?? randomUUID(),
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.pushSubs.set(sub.endpoint, sub);
    return { ...sub };
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    this.pushSubs.delete(endpoint);
  }
}
