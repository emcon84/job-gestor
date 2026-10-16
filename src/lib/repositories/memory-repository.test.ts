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
    clientId: sampleTask.defaultClientId,
    attachments: [],
    ...overrides,
  };
}
sampleTask.defaultServiceId = "s1";
sampleTask.defaultClientId = "c1";

async function setupClientAndService(repo: MemoryRepository): Promise<{
  clientId: string;
  serviceId: string;
}> {
  const client = await repo.createClient({
    name: "Cliente 1",
    slug: "cliente-1",
    packThresholdCents: 150_000_00,
  });
  const svc = await repo.createService({
    name: "mantenimiento landing",
    defaultCostArs: 50_000_00,
    clientId: client.id,
  });
  sampleTask.defaultClientId = client.id;
  sampleTask.defaultServiceId = svc.id;
  return { clientId: client.id, serviceId: svc.id };
}

describe("MemoryRepository clients", () => {
  let repo: MemoryRepository;

  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("creates, gets, and lists clients", async () => {
    const c = await repo.createClient({
      name: "Cliente 1",
      slug: "cliente-1",
      packThresholdCents: 150_000_00,
    });
    expect(c.id).toBeTruthy();
    expect(c.slug).toBe("cliente-1");
    expect(c.packThresholdCents).toBe(150_000_00);
    expect(c.createdAt).toBeInstanceOf(Date);

    expect((await repo.getClient(c.id))?.name).toBe("Cliente 1");
    expect(await repo.getClientBySlug("cliente-1")).not.toBeNull();
    expect(await repo.getClientBySlug("missing")).toBeNull();
    expect(await repo.getClient("missing")).toBeNull();

    const list = await repo.listClients();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(c.id);
  });

  it("updates a client name, slug, and pack threshold", async () => {
    const c = await repo.createClient({
      name: "A",
      slug: "a",
      packThresholdCents: 100_000_00,
    });
    const updated = await repo.updateClient(c.id, {
      name: "B",
      slug: "b",
      packThresholdCents: 200_000_00,
    });
    expect(updated?.name).toBe("B");
    expect(updated?.slug).toBe("b");
    expect(updated?.packThresholdCents).toBe(200_000_00);
    expect((await repo.getClientBySlug("b"))?.id).toBe(c.id);
    expect(await repo.getClientBySlug("a")).toBeNull();
  });

  it("returns null when updating an unknown client", async () => {
    expect(
      await repo.updateClient("missing", { name: "X" }),
    ).toBeNull();
  });

  it("deletes a client with no tasks or services", async () => {
    const c = await repo.createClient({
      name: "A",
      slug: "a",
      packThresholdCents: 100_000_00,
    });
    expect(await repo.deleteClient(c.id)).toBe(true);
    expect(await repo.getClient(c.id)).toBeNull();
  });

  it("refuses to delete a client that still has tasks", async () => {
    const { clientId } = await setupClientAndService(repo);
    await repo.createTask(sampleTask());
    expect(await repo.deleteClient(clientId)).toBe(false);
    expect(await repo.getClient(clientId)).not.toBeNull();
  });

  it("refuses to delete a client that still has services", async () => {
    const client = await repo.createClient({
      name: "A",
      slug: "a",
      packThresholdCents: 100_000_00,
    });
    await repo.createService({
      name: "svc",
      defaultCostArs: 10_000_00,
      clientId: client.id,
    });
    expect(await repo.deleteClient(client.id)).toBe(false);
  });

  it("returns credentials for a client with a username, and null otherwise", async () => {
    const withCreds = await repo.createClient({
      name: "Cliente 1",
      slug: "cliente-1",
      packThresholdCents: 150_000_00,
      username: "cliente1",
      passwordHash: "salt:hash",
    });
    const creds = await repo.getClientByUsername("cliente1");
    expect(creds).not.toBeNull();
    expect(creds?.clientId).toBe(withCreds.id);
    expect(creds?.slug).toBe("cliente-1");
    expect(creds?.username).toBe("cliente1");
    expect(creds?.passwordHash).toBe("salt:hash");

    await expect(repo.getClientByUsername("no-existe")).resolves.toBeNull();

    // A client without credentials must not be returned.
    await repo.createClient({
      name: "Sin Usuario",
      slug: "sin-usuario",
      packThresholdCents: 150_000_00,
    });
    await expect(repo.getClientByUsername("cliente1")).resolves.toMatchObject({
      username: "cliente1",
    });
    await expect(repo.getClientByUsername("sin-usuario")).resolves.toBeNull();
  });
});

describe("MemoryRepository", () => {
  let repo: MemoryRepository;
  let clientId: string;

  beforeEach(async () => {
    repo = new MemoryRepository();
    const setup = await setupClientAndService(repo);
    clientId = setup.clientId;
  });

  it("creates a task with pending status and auto-filled amount from its service", async () => {
    const task = await repo.createTask(sampleTask());
    expect(task.id).toBeTruthy();
    expect(task.status).toBe("pending");
    expect(task.clientMoveCount).toBe(0);
    expect(task.amountArs).toBe(50_000_00);
    expect(task.serviceId).toBe(sampleTask.defaultServiceId);
    expect(task.clientId).toBe(clientId);
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
    const svc = await repo.createService({
      name: "dev web",
      defaultCostArs: 90_000_00,
      clientId,
    });
    const task = await repo.createTask(sampleTask({ serviceId: svc.id }));
    expect(task.serviceId).toBe(svc.id);
    expect(task.amountArs).toBe(90_000_00);
  });

  it("updateTask sets a service and auto-fills the default cost on a zero-amount task", async () => {
    const svc = await repo.createService({
      name: "soporte",
      defaultCostArs: 70_000_00,
      clientId,
    });
    const task = await repo.createTask(sampleTask({ serviceId: null }));
    expect(task.amountArs).toBe(0);

    const updated = await repo.updateTask(task.id, { serviceId: svc.id });
    expect(updated?.serviceId).toBe(svc.id);
    expect(updated?.amountArs).toBe(70_000_00);
  });

  it("updateTask does not auto-fill when the task already has a nonzero amount", async () => {
    const svc = await repo.createService({
      name: "soporte",
      defaultCostArs: 70_000_00,
      clientId,
    });
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

  it("lists tasks for a client newest first, ignoring other clients", async () => {
    const other = await repo.createClient({
      name: "Otro",
      slug: "otro",
      packThresholdCents: 100_000_00,
    });
    await repo.createTask(sampleTask({ title: "A" }));
    await repo.createTask(sampleTask({ title: "B" }));
    await repo.createTask(
      sampleTask({ title: "C", clientId: other.id }),
    );

    const tasks = await repo.listTasksByClient(clientId);
    expect(tasks).toHaveLength(2);
    // Newest (B) should be first.
    expect(tasks[0].title).toBe("B");
    expect(tasks[1].title).toBe("A");

    const otherTasks = await repo.listTasksByClient(other.id);
    expect(otherTasks).toHaveLength(1);
    expect(otherTasks[0].title).toBe("C");
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
    const listed = await repo.listTasksByClient(clientId);
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

    const listed = await repo.listTasksByClient(clientId);
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
    const tasks = await repo.listTasksByClient(clientId);
    expect(tasks).toHaveLength(0);
  });
});

describe("MemoryRepository comments", () => {
  let repo: MemoryRepository;
  let clientId: string;

  beforeEach(async () => {
    repo = new MemoryRepository();
    const setup = await setupClientAndService(repo);
    clientId = setup.clientId;
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
    const [withTask] = await repo.listTasksByClient(clientId);
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

  it("returns comments attached to tasks loaded via listTasksByClient", async () => {
    const task = await repo.createTask(sampleTask());
    await repo.addComment({ taskId: task.id, body: "hola", author: "client" });
    const [listed] = await repo.listTasksByClient(clientId);
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
    const tasks = await repo.listTasksByClient(clientId);
    expect(tasks).toHaveLength(0);
  });
});

describe("MemoryRepository services", () => {
  let repo: MemoryRepository;
  let clientId: string;

  beforeEach(async () => {
    repo = new MemoryRepository();
    const client = await repo.createClient({
      name: "Cliente 1",
      slug: "cliente-1",
      packThresholdCents: 150_000_00,
    });
    clientId = client.id;
  });

  it("creates and lists services scoped to the client", async () => {
    const s = await repo.createService({
      name: "integración de terceros",
      defaultCostArs: 80_000_00,
      clientId,
    });
    const other = await repo.createClient({
      name: "Otro",
      slug: "otro",
      packThresholdCents: 100_000_00,
    });
    await repo.createService({
      name: "otro svc",
      defaultCostArs: 10_000_00,
      clientId: other.id,
    });

    const list = await repo.listServicesByClient(clientId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(s.id);
    expect(list[0].name).toBe("integración de terceros");
    expect(list[0].defaultCostArs).toBe(80_000_00);
    expect(s.clientId).toBe(clientId);

    const otherList = await repo.listServicesByClient(other.id);
    expect(otherList).toHaveLength(1);
    expect(otherList[0].name).toBe("otro svc");
  });

  it("updates a service name and default cost", async () => {
    const s = await repo.createService({
      name: "A",
      defaultCostArs: 10_000_00,
      clientId,
    });
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
    const s = await repo.createService({
      name: "A",
      defaultCostArs: 10_000_00,
      clientId,
    });
    await repo.deleteService(s.id);
    expect(await repo.listServicesByClient(clientId)).toHaveLength(0);
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
describe("MemoryRepository hourly rate", () => {
  it("defaults hourlyRateCents to null and stores it on create", async () => {
    const repo = new MemoryRepository();
    const plain = await repo.createClient({
      name: "A",
      slug: "a",
      packThresholdCents: 1,
    });
    expect(plain.hourlyRateCents).toBeNull();
    const hourly = await repo.createClient({
      name: "Oslo",
      slug: "oslo",
      packThresholdCents: 1,
      hourlyRateCents: 8_000_00,
    });
    expect(hourly.hourlyRateCents).toBe(8_000_00);
  });

  it("updates, keeps and clears hourlyRateCents", async () => {
    const repo = new MemoryRepository();
    const c = await repo.createClient({
      name: "A",
      slug: "a",
      packThresholdCents: 1,
    });
    const set = await repo.updateClient(c.id, { hourlyRateCents: 5_000_00 });
    expect(set?.hourlyRateCents).toBe(5_000_00);
    const kept = await repo.updateClient(c.id, { name: "B" });
    expect(kept?.hourlyRateCents).toBe(5_000_00);
    const cleared = await repo.updateClient(c.id, { hourlyRateCents: null });
    expect(cleared?.hourlyRateCents).toBeNull();
  });
});

describe("MemoryRepository work sessions", () => {
  let repo: MemoryRepository;
  let taskId: string;
  const t0 = new Date("2026-03-01T10:00:00Z");
  const t1 = new Date("2026-03-01T11:30:00Z");
  const t2 = new Date("2026-03-02T09:00:00Z");
  const t3 = new Date("2026-03-02T10:00:00Z");

  beforeEach(async () => {
    repo = new MemoryRepository();
    await setupClientAndService(repo);
    taskId = (await repo.createTask(sampleTask())).id;
  });

  it("creates tasks with no work sessions", async () => {
    expect((await repo.getTask(taskId))?.workSessions).toEqual([]);
  });

  it("starts a session with the given time and no end", async () => {
    const s = await repo.startWorkSession(taskId, t0);
    expect(s).toMatchObject({ taskId, startedAt: t0, endedAt: null });
    expect(s?.id).toBeTruthy();
    expect((await repo.getTask(taskId))?.workSessions).toHaveLength(1);
  });

  it("returns null when starting a session on a missing task", async () => {
    expect(await repo.startWorkSession("missing", t0)).toBeNull();
  });

  it("returns the already running session instead of opening a second one", async () => {
    const first = await repo.startWorkSession(taskId, t0);
    const again = await repo.startWorkSession(taskId, t1);
    expect(again?.id).toBe(first?.id);
    expect(again?.startedAt).toEqual(t0);
    expect((await repo.getTask(taskId))?.workSessions).toHaveLength(1);
  });

  it("refuses to start a session on a done task", async () => {
    await repo.updateTask(taskId, { status: "done" });
    expect(await repo.startWorkSession(taskId, t0)).toBeNull();
  });

  it("stops the open session and returns it closed", async () => {
    await repo.startWorkSession(taskId, t0);
    const stopped = await repo.stopWorkSession(taskId, t1);
    expect(stopped).toMatchObject({ startedAt: t0, endedAt: t1 });
    expect((await repo.getTask(taskId))?.workSessions[0].endedAt).toEqual(t1);
  });

  it("returns null when stopping with no open session or missing task", async () => {
    expect(await repo.stopWorkSession(taskId, t1)).toBeNull();
    expect(await repo.stopWorkSession("missing", t1)).toBeNull();
  });

  it("lists sessions oldest first via listTasksByClient and getTask", async () => {
    await repo.startWorkSession(taskId, t2);
    await repo.stopWorkSession(taskId, t3);
    // Insert an earlier session after the later one.
    const task = await repo.getTask(taskId);
    task!.workSessions.unshift({
      id: "early",
      taskId,
      startedAt: t0,
      endedAt: t1,
    });
    const viaList = (await repo.listTasksByClient(sampleTask.defaultClientId))[0];
    expect(viaList.workSessions.map((s) => s.startedAt)).toEqual([t0, t2]);
    expect(
      (await repo.getTask(taskId))?.workSessions.map((s) => s.startedAt),
    ).toEqual([t0, t2]);
  });

  it("auto-stops a running session when the task moves to done, using completedAt", async () => {
    await repo.startWorkSession(taskId, t0);
    const done = await repo.updateTask(taskId, { status: "done" });
    expect(done?.completedAt).toBeInstanceOf(Date);
    expect(done?.workSessions).toHaveLength(1);
    expect(done?.workSessions[0].endedAt).toEqual(done?.completedAt);
  });

  it("keeps closed sessions untouched and running ones open for non-done updates", async () => {
    await repo.startWorkSession(taskId, t0);
    await repo.stopWorkSession(taskId, t1);
    await repo.startWorkSession(taskId, t2);
    const moved = await repo.updateTask(taskId, { status: "in_progress" });
    expect(moved?.workSessions[0].endedAt).toEqual(t1);
    expect(moved?.workSessions[1].endedAt).toBeNull();
    const done = await repo.updateTask(taskId, { status: "done" });
    expect(done?.workSessions[0].endedAt).toEqual(t1);
    expect(done?.workSessions[1].endedAt).toEqual(done?.completedAt);
  });

  it("drops sessions together with the task", async () => {
    await repo.startWorkSession(taskId, t0);
    await repo.deleteTask(taskId);
    expect(await repo.getTask(taskId)).toBeNull();
    expect(await repo.stopWorkSession(taskId, t1)).toBeNull();
  });
});
