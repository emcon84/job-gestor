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
    expect(task.clientMoveCount).toBe(0);
    expect(task.amountArs).toBe(50_000_00);
    expect(task.serviceId).toBe(sampleTask.defaultServiceId);
    expect(task.paymentState).toBeNull();
    expect(task.completedAt).toBeNull();
  });

  it("defaults to a zero amount when the service is unknown", async () => {
    const task = await repo.createTask(sampleTask({ serviceId: "missing" }));
    expect(task.amountArs).toBe(0);
  });

  it("creates an unclassified task (null service) with a zero amount", async () => {
    const task = await repo.createTask(sampleTask({ serviceId: null }));
    expect(task.serviceId).toBeNull();
    expect(task.amountArs).toBe(0);
  });

  it("creates a task with a service and resolves its default cost", async () => {
    const svc = await repo.createService({ name: "dev web", defaultCostArs: 90_000_00 });
    const task = await repo.createTask(sampleTask({ serviceId: svc.id }));
    expect(task.serviceId).toBe(svc.id);
    expect(task.amountArs).toBe(90_000_00);
  });

  it("updateTask sets a service and auto-fills the default cost on a zero-amount task", async () => {
    const svc = await repo.createService({ name: "soporte", defaultCostArs: 70_000_00 });
    const task = await repo.createTask(sampleTask({ serviceId: null }));
    expect(task.amountArs).toBe(0);

    const updated = await repo.updateTask(task.id, { serviceId: svc.id });
    expect(updated?.serviceId).toBe(svc.id);
    expect(updated?.amountArs).toBe(70_000_00);
  });

  it("updateTask does not auto-fill when the task already has a nonzero amount", async () => {
    const svc = await repo.createService({ name: "soporte", defaultCostArs: 70_000_00 });
    const task = await repo.createTask(sampleTask({ serviceId: null }));
    const withAmount = await repo.updateTask(task.id, { amountArs: 10_000_00 });
    expect(withAmount?.amountArs).toBe(10_000_00);

    const updated = await repo.updateTask(task.id, { serviceId: svc.id });
    expect(updated?.serviceId).toBe(svc.id);
    expect(updated?.amountArs).toBe(10_000_00);
  });

  it("updateTask clears a service back to null (unclassified)", async () => {
    const task = await repo.createTask(sampleTask());
    expect(task.serviceId).toBe(sampleTask.defaultServiceId);

    const cleared = await repo.updateTask(task.id, { serviceId: null });
    expect(cleared?.serviceId).toBeNull();
    // Clearing does not touch the amount.
    expect(cleared?.amountArs).toBe(50_000_00);
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

  it("round-trips paymentDueDate through updateTask (set then clear with null)", async () => {
    const created = await repo.createTask(sampleTask());
    expect(created.paymentDueDate).toBeNull();

    const due = new Date(2026, 8, 15); // 2026-09-15
    const withDate = await repo.updateTask(created.id, { paymentDueDate: due });
    expect(withDate?.paymentDueDate).toBe(due);

    const listed = await repo.listTasks();
    expect(listed[0].paymentDueDate).toBe(due);

    const cleared = await repo.updateTask(created.id, { paymentDueDate: null });
    expect(cleared?.paymentDueDate).toBeNull();
  });

  it("returns null when updating an unknown task", async () => {
    const result = await repo.updateTask("missing", { status: "done" });
    expect(result).toBeNull();
  });

  it("gets a task by id, or null when it does not exist", async () => {
    const created = await repo.createTask(sampleTask());
    const found = await repo.getTask(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.title).toBe(created.title);
    expect(await repo.getTask("missing")).toBeNull();
  });

  it("round-trips clientMoveCount through updateTask", async () => {
    const created = await repo.createTask(sampleTask());
    expect(created.clientMoveCount).toBe(0);
    const updated = await repo.updateTask(created.id, {
      status: "in_progress",
      clientMoveCount: 1,
    });
    expect(updated?.status).toBe("in_progress");
    expect(updated?.clientMoveCount).toBe(1);
    const fetched = await repo.getTask(created.id);
    expect(fetched?.clientMoveCount).toBe(1);
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
    await repo.addComment({ taskId: task.id, body: "primero", author: "client", authorName: "Ana" });
    await repo.addComment({ taskId: task.id, body: "segundo", author: "owner", authorName: "Propietario" });

    const comments = await repo.listCommentsByTask(task.id);
    expect(comments).toHaveLength(2);
    expect(comments[0].body).toBe("primero");
    expect(comments[0].author).toBe("client");
    expect(comments[0].authorName).toBe("Ana");
    expect(comments[1].body).toBe("segundo");
    expect(comments[1].author).toBe("owner");
    expect(comments[1].authorName).toBe("Propietario");
    expect(comments[0].id).toBeTruthy();
    expect(comments[0].createdAt).toBeInstanceOf(Date);
  });

  it("round-trips a comment author name through the thread", async () => {
    const task = await repo.createTask(sampleTask());
    await repo.addComment({ taskId: task.id, body: "hola", author: "client", authorName: "María" });
    const [withTask] = await repo.listTasks();
    expect(withTask.comments[0].authorName).toBe("María");
    const comments = await repo.listCommentsByTask(task.id);
    expect(comments[0].authorName).toBe("María");
  });

  it("defaults author name to null when not provided", async () => {
    const task = await repo.createTask(sampleTask());
    await repo.addComment({ taskId: task.id, body: "sin nombre", author: "client" });
    const comments = await repo.listCommentsByTask(task.id);
    expect(comments[0].authorName).toBeNull();
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

describe("MemoryRepository push subscriptions", () => {
  let repo: MemoryRepository;

  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("adds, lists, and deletes a push subscription", async () => {
    const sub = await repo.addPushSubscription({
      endpoint: "https://push.example.com/a",
      p256dh: "p1",
      auth: "a1",
    });
    expect(sub.id).toBeTruthy();
    expect(sub.endpoint).toBe("https://push.example.com/a");
    expect(sub.createdAt).toBeInstanceOf(Date);

    const list = await repo.listPushSubscriptions();
    expect(list).toHaveLength(1);
    expect(list[0].endpoint).toBe("https://push.example.com/a");

    await repo.deletePushSubscriptionByEndpoint("https://push.example.com/a");
    expect(await repo.listPushSubscriptions()).toEqual([]);
  });

  it("upserts by endpoint, keeping a single row with refreshed keys", async () => {
    await repo.addPushSubscription({
      endpoint: "https://push.example.com/b",
      p256dh: "p1",
      auth: "a1",
    });
    const resub = await repo.addPushSubscription({
      endpoint: "https://push.example.com/b",
      p256dh: "p2",
      auth: "a2",
    });
    const list = await repo.listPushSubscriptions();
    expect(list).toHaveLength(1);
    expect(list[0].p256dh).toBe("p2");
    expect(list[0].auth).toBe("a2");
    expect(resub.id).toBe(list[0].id);
  });

  it("returns an empty list when nothing is subscribed", async () => {
    expect(await repo.listPushSubscriptions()).toEqual([]);
  });
});
