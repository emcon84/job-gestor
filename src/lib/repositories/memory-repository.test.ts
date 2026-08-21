import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "./memory-repository";
import type { NewTask } from "../domain";

function sampleTask(overrides: Partial<NewTask> = {}): NewTask {
  return {
    title: "Fix login",
    description: "El login no anda",
    area: "Backend",
    priority: "high",
    serviceId: sampleTask.defaultServiceId,
    attachments: [],
    ...overrides,
  };
}
sampleTask.defaultServiceId = "s1";

describe("MemoryRepository", () => {
  let repo: MemoryRepository;

  beforeEach(async () => {
    repo = new MemoryRepository();
    // Set up a default service so tasks can resolve a cost.
    const svc = await repo.createService({ name: "mantenimiento landing", defaultCostArs: 50_000_00 });
    sampleTask.defaultServiceId = svc.id;
  });

  it("creates a task with pending status and auto-filled amount from its service", async () => {
    const task = await repo.createTask(sampleTask());
    expect(task.id).toBeTruthy();
    expect(task.status).toBe("pending");
    expect(task.amountArs).toBe(50_000_00);
    expect(task.serviceId).toBe(sampleTask.defaultServiceId);
    expect(task.paymentState).toBeNull();
    expect(task.completedAt).toBeNull();
  });

  it("defaults to a zero amount when the service is unknown", async () => {
    const task = await repo.createTask(sampleTask({ serviceId: "missing" }));
    expect(task.amountArs).toBe(0);
  });

  it("stores attachments on create", async () => {
    const task = await repo.createTask(
      sampleTask({
        attachments: [
          {
            id: "a1",
            name: "foto.jpg",
            url: "blob:abc",
            contentType: "image/jpeg",
            sizeBytes: 100,
          },
        ],
      }),
    );
    expect(task.attachments).toHaveLength(1);
    expect(task.attachments[0].name).toBe("foto.jpg");
  });

  it("lists tasks newest first", async () => {
    await repo.createTask(sampleTask({ title: "A" }));
    // Simulate ordering by createdAt.
    await repo.createTask(sampleTask({ title: "B" }));
    const tasks = await repo.listTasks();
    expect(tasks).toHaveLength(2);
    // Newest (B) should be first.
    expect(tasks[0].title).toBe("B");
  });

  it("moves a task to done and records completedAt", async () => {
    const created = await repo.createTask(sampleTask());
    const updated = await repo.updateTask(created.id, { status: "done" });
    expect(updated?.status).toBe("done");
    expect(updated?.completedAt).toBeInstanceOf(Date);
  });

  it("overwrites amount and paymentState without history", async () => {
    const created = await repo.createTask(sampleTask());
    const u1 = await repo.updateTask(created.id, {
      amountArs: 50000,
      paymentState: "pending",
    });
    expect(u1?.amountArs).toBe(50000);
    expect(u1?.paymentState).toBe("pending");
    const u2 = await repo.updateTask(created.id, {
      amountArs: 75000,
      paymentState: "paid",
    });
    expect(u2?.amountArs).toBe(75000);
    expect(u2?.paymentState).toBe("paid");
    // No history retained.
    const listed = await repo.listTasks();
    expect(listed[0].amountArs).toBe(75000);
  });

  it("clears completedAt when reopening a done task", async () => {
    const created = await repo.createTask(sampleTask());
    await repo.updateTask(created.id, { status: "done" });
    const reopened = await repo.updateTask(created.id, { status: "pending" });
    expect(reopened?.status).toBe("pending");
    expect(reopened?.completedAt).toBeNull();
  });

  it("returns null when updating an unknown task", async () => {
    const result = await repo.updateTask("missing", { status: "done" });
    expect(result).toBeNull();
  });

  it("deletes a task", async () => {
    const created = await repo.createTask(sampleTask());
    await repo.deleteTask(created.id);
    const tasks = await repo.listTasks();
    expect(tasks).toHaveLength(0);
  });
});

describe("MemoryRepository comments", () => {
  let repo: MemoryRepository;

  beforeEach(async () => {
    repo = new MemoryRepository();
    const svc = await repo.createService({ name: "mantenimiento", defaultCostArs: 10_000_00 });
    sampleTask.defaultServiceId = svc.id;
  });

  it("adds a comment and lists it oldest first for the task", async () => {
    const task = await repo.createTask(sampleTask());
    await repo.addComment({ taskId: task.id, body: "primero", author: "client" });
    await repo.addComment({ taskId: task.id, body: "segundo", author: "owner" });

    const comments = await repo.listCommentsByTask(task.id);
    expect(comments).toHaveLength(2);
    expect(comments[0].body).toBe("primero");
    expect(comments[0].author).toBe("client");
    expect(comments[1].body).toBe("segundo");
    expect(comments[1].author).toBe("owner");
    expect(comments[0].id).toBeTruthy();
    expect(comments[0].createdAt).toBeInstanceOf(Date);
  });

  it("returns comments attached to tasks loaded via listTasks", async () => {
    const task = await repo.createTask(sampleTask());
    await repo.addComment({ taskId: task.id, body: "hola", author: "client" });
    const [listed] = await repo.listTasks();
    expect(listed.comments).toHaveLength(1);
    expect(listed.comments[0].body).toBe("hola");
  });

  it("returns an empty thread for a task without comments", async () => {
    const task = await repo.createTask(sampleTask());
    expect(await repo.listCommentsByTask(task.id)).toEqual([]);
  });

  it("returns null when adding a comment to a missing task", async () => {
    expect(
      await repo.addComment({ taskId: "missing", body: "x", author: "client" }),
    ).toBeNull();
  });

  it("deleting a task removes its comments", async () => {
    const task = await repo.createTask(sampleTask());
    await repo.addComment({ taskId: task.id, body: "adios", author: "client" });
    await repo.deleteTask(task.id);
    expect(await repo.listCommentsByTask(task.id)).toEqual([]);
    const tasks = await repo.listTasks();
    expect(tasks).toHaveLength(0);
  });
});

describe("MemoryRepository services", () => {
  let repo: MemoryRepository;

  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("creates and lists services", async () => {
    const s = await repo.createService({ name: "integración de terceros", defaultCostArs: 80_000_00 });
    const list = await repo.listServices();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(s.id);
    expect(list[0].name).toBe("integración de terceros");
    expect(list[0].defaultCostArs).toBe(80_000_00);
  });

  it("updates a service name and default cost", async () => {
    const s = await repo.createService({ name: "A", defaultCostArs: 10_000_00 });
    const updated = await repo.updateService(s.id, {
      name: "B",
      defaultCostArs: 99_000_00,
    });
    expect(updated?.name).toBe("B");
    expect(updated?.defaultCostArs).toBe(99_000_00);
    expect(await repo.resolveServiceCost(s.id)).toBe(99_000_00);
  });

  it("returns null when updating an unknown service", async () => {
    expect(await repo.updateService("missing", { name: "X" })).toBeNull();
  });

  it("deletes a service", async () => {
    const s = await repo.createService({ name: "A", defaultCostArs: 10_000_00 });
    await repo.deleteService(s.id);
    expect(await repo.listServices()).toHaveLength(0);
    expect(await repo.resolveServiceCost(s.id)).toBeNull();
  });

  it("resolves null cost for an unknown service", async () => {
    expect(await repo.resolveServiceCost("nope")).toBeNull();
  });
});
