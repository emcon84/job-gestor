/**
 * In-memory repository (tasks + services).
 *
 * Dev fallback used when no DATABASE_URL is present, so the UI and unit tests
 * can run locally without Neon. Data lives in Maps and is lost on restart.
 */
import { randomUUID } from "node:crypto";
import type {
  NewService,
  NewTask,
  Service,
  ServiceOption,
  ServiceUpdate,
  Task,
  TaskUpdate,
} from "../domain";
import { resolveCompletedAt } from "../domain";
import type { ServiceRepository, TaskRepository } from "../repository";

export class MemoryRepository implements TaskRepository, ServiceRepository {
  private tasks = new Map<string, Task>();
  private services = new Map<string, Service>();
  private seq = 0;
  private order = new Map<string, number>();

  async listTasks(): Promise<Task[]> {
    return [...this.tasks.values()].sort((a, b) => {
      const ta = a.createdAt.getTime();
      const tb = b.createdAt.getTime();
      if (ta !== tb) {
        return tb - ta;
      }
      // Stable tie-break by insertion order (newest inserted first).
      return (this.order.get(b.id) ?? 0) - (this.order.get(a.id) ?? 0);
    });
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
      amountArs: cost ?? 0,
      paymentState: null,
      serviceId: input.serviceId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      attachments: input.attachments.map((a) => ({ ...a })),
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
    const updated: Task = {
      ...existing,
      status,
      amountArs:
        update.amountArs !== undefined ? update.amountArs : existing.amountArs,
      paymentState:
        update.paymentState !== undefined
          ? update.paymentState
          : existing.paymentState,
      completedAt: resolveCompletedAt(status, new Date(), existing.completedAt),
      updatedAt: new Date(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
    this.order.delete(id);
  }

  async listServices(): Promise<ServiceOption[]> {
    return [...this.services.values()].map((s) => ({
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

  async resolveServiceCost(id: string): Promise<number | null> {
    return this.services.get(id)?.defaultCostArs ?? null;
  }
}
