import { describe, expect, it } from "vitest";
import type { Client, Task } from "./domain";
import { buildReportDefinition, paymentLabel } from "./report";
import { computePacks } from "./packs";
import { formatArs } from "./format";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "Acme SA",
    slug: "acme-sa",
    packThresholdCents: 150_000_00,
    username: null,
    portalMessage: null,
    showPackProgress: true,
    hourlyRateCents: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Integrar formulario",
    description: "D",
    area: "Formularios",
    priority: "medium",
    status: "pending",
    clientMoveCount: 0,
    amountArs: 40_000_00,
    paymentState: null,
    paymentDueDate: null,
    serviceId: "s1",
    clientId: "c1",
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    completedAt: null,
    attachments: [],
    comments: [],
    workSessions: [],
    ...overrides,
  };
}

function findTable(doc: ReturnType<typeof buildReportDefinition>) {
  return doc.content.find((c) => "table" in c && "layout" in c);
}

function texts(doc: ReturnType<typeof buildReportDefinition>): string[] {
  return doc.content
    .filter((c) => "text" in c)
    .map((c) => (c as { text: string }).text);
}

describe("buildReportDefinition", () => {
  it("renders a header with the client name, generated date, and threshold", () => {
    const doc = buildReportDefinition({
      client: makeClient({ name: "Ferretería Ñandú" }),
      tasks: [],
      summary: computePacks([]),
    });

    const header = doc.content[0] as { text: string };
    expect(header.text).toContain("Reporte de tareas — Ferretería Ñandú");
    expect(texts(doc)[1]).toMatch(/^Generado el \d{2}\/\d{2}\/\d{4}$/);
    expect(texts(doc)[2]).toBe("Abono mensual: AR$ 150.000,00");
  });

  it("shows the abono summary: pending, current pack, and closed packs", () => {
    const tasks = [
      makeTask({ amountArs: 120_000_00 }),
      makeTask({ id: "t2", amountArs: 40_000_00 }),
    ];
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks,
      summary: computePacks(tasks, 150_000_00),
    });

    const texts = doc.content.filter((c) => "text" in c).map((c) => c.text);
    expect(texts).toContain("Total pendiente de pago: AR$ 160.000,00");
    expect(texts).toContain("Abono actual: 2");
    expect(texts).toContain("Abonos cerrados: 1");
  });

  it("never shows the accumulated overflow to the client", () => {
    const tasks = [
      makeTask({ amountArs: 140_000_00 }),
      makeTask({ id: "t2", amountArs: 30_000_00 }),
    ];
    const summary = computePacks(tasks, 150_000_00);
    expect(summary.overflowCents).toBeGreaterThan(0);

    const doc = buildReportDefinition({ client: makeClient(), tasks, summary });
    expect(texts(doc).some((t) => t.startsWith("Excedente"))).toBe(false);
  });

  it("builds a tasks table with a header row plus one row per task", () => {
    const tasks = [
      makeTask({ title: "Tarea A" }),
      makeTask({ id: "t2", title: "Tarea B" }),
    ];
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks,
      summary: computePacks(tasks),
    });

    const table = findTable(doc);
    expect(table).toBeDefined();
    const body = (table as { table: { body: unknown[][] } }).table.body;
    expect(body).toHaveLength(3); // header + 2 rows

    const header = body[0].map((c) => (c as { text: string }).text);
    expect(header).toEqual([
      "Título",
      "Área",
      "Estado",
      "Monto",
      "Pago",
      "Vencimiento",
    ]);
    expect(body[1][0]).toBe("Tarea A");
    expect(body[2][0]).toBe("Tarea B");
  });

  it("formats amounts with the AR$ prefix and decimal separator", () => {
    const task = makeTask({ amountArs: 123456, title: "Tarea con monto" });
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks: [task],
      summary: computePacks([task]),
    });

    const table = findTable(doc);
    const body = (table as { table: { body: unknown[][] } }).table.body;
    expect(body[1][3]).toBe("AR$ 1.234,56");
  });

  it("maps Spanish status labels for every task status", () => {
    const tasks = [
      makeTask({ id: "t1", title: "A", status: "pending" }),
      makeTask({ id: "t2", title: "B", status: "in_progress" }),
      makeTask({ id: "t3", title: "C", status: "revision" }),
      makeTask({ id: "t4", title: "D", status: "done" }),
    ];
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks,
      summary: computePacks(tasks),
    });

    const body = (findTable(doc) as { table: { body: unknown[][] } }).table
      .body;
    expect(body[1][2]).toBe("pendiente");
    expect(body[2][2]).toBe("en curso");
    expect(body[3][2]).toBe("en revisión");
    expect(body[4][2]).toBe("hecho");
  });

  it("renders payment and due-date columns from the task payment state", () => {
    const tasks = [
      makeTask({ id: "t1", paymentState: "paid", paymentDueDate: new Date(2026, 2, 5) }),
      makeTask({ id: "t2", paymentState: "pending" }),
      makeTask({ id: "t3", paymentState: null }),
    ];
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks,
      summary: computePacks(tasks),
    });

    const body = (findTable(doc) as { table: { body: unknown[][] } }).table
      .body;
    expect(body[1][4]).toBe("Pagado");
    expect(body[1][5]).toBe("05/03/2026");
    expect(body[2][4]).toBe("Pendiente");
    expect(body[2][5]).toBe("—");
    expect(body[3][4]).toBe("Sin pago");
  });

  it("shows a 'Sin tareas.' note when the client has no tasks", () => {
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks: [],
      summary: computePacks([]),
    });

    expect(findTable(doc)).toBeUndefined();
    const texts = doc.content.filter((c) => "text" in c).map((c) => c.text);
    expect(texts).toContain("Sin tareas.");
  });

  it("keeps a clean black-on-white default style with the Roboto font", () => {
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks: [],
      summary: computePacks([]),
    });

    expect(doc.defaultStyle).toEqual({
      font: "Roboto",
      fontSize: 9.5,
      color: "#111111",
    });
  });
});

describe("buildReportDefinition unpaid filter", () => {
  const tasks = [
    makeTask({ id: "t1", title: "Pagada", paymentState: "paid" }),
    makeTask({ id: "t2", title: "Pendiente", paymentState: "pending" }),
    makeTask({ id: "t3", title: "Sin estado", paymentState: null }),
    makeTask({ id: "t4", title: "Sin monto", amountArs: 0 }),
  ];

  function unpaidBody(list: Task[]) {
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks: list,
      summary: computePacks(list),
      filter: "unpaid",
    });
    return { doc, table: findTable(doc) as { table: { body: unknown[][] } } | undefined };
  }

  it("lists only tasks with an amount that are not paid", () => {
    const { table } = unpaidBody(tasks);
    const titles = table!.table.body.slice(1).map((row) => row[0]);
    expect(titles).toEqual(["Pendiente", "Sin estado"]);
  });

  it("marks the title as unpaid-only", () => {
    const { doc } = unpaidBody(tasks);
    expect((doc.content[0] as { text: string }).text).toBe(
      "Reporte de tareas pendientes de pago — Acme SA",
    );
  });

  it("shows a specific note when nothing is unpaid", () => {
    const { doc, table } = unpaidBody([tasks[0]]);
    expect(table).toBeUndefined();
    expect(texts(doc)).toContain("Sin tareas pendientes de pago.");
  });

  it("keeps every task when the filter is omitted", () => {
    const doc = buildReportDefinition({
      client: makeClient(),
      tasks,
      summary: computePacks(tasks),
    });
    const body = (findTable(doc) as { table: { body: unknown[][] } }).table.body;
    expect(body).toHaveLength(5);
  });
});

describe("paymentLabel", () => {
  it("maps paid, pending, and null states to Spanish labels", () => {
    expect(paymentLabel("paid")).toBe("Pagado");
    expect(paymentLabel("pending")).toBe("Pendiente");
    expect(paymentLabel(null)).toBe("Sin pago");
  });
});
describe("buildReportDefinition for hourly clients", () => {
  const now = new Date("2026-03-05T12:00:00Z");
  const hourlyClient = makeClient({ hourlyRateCents: 10_000_00 });
  const sessions = [
    {
      id: "s1",
      taskId: "t1",
      // 10:00-11:30 local on 2026-03-01
      startedAt: new Date("2026-03-01T13:00:00Z"),
      endedAt: new Date("2026-03-01T14:30:00Z"),
    },
    {
      id: "s2",
      taskId: "t1",
      // 09:00-10:00 local on 2026-03-02
      startedAt: new Date("2026-03-02T12:00:00Z"),
      endedAt: new Date("2026-03-02T13:00:00Z"),
    },
  ];
  const tasks = [makeTask({ title: "Landing", amountArs: 1, workSessions: sessions })];

  function build(overrides: Partial<Parameters<typeof buildReportDefinition>[0]> = {}) {
    return buildReportDefinition({
      client: hourlyClient,
      tasks,
      summary: computePacks(tasks, hourlyClient.packThresholdCents, {
        hourlyRateCents: 10_000_00,
        now,
      }),
      now,
      ...overrides,
    });
  }

  it("shows worked hours and the effective amount per task", () => {
    const doc = build();
    const table = findTable(doc) as { table: { body: unknown[][] } };
    const header = (table.table.body[0] as { text: string }[]).map((c) => c.text);
    expect(header).toContain("Horas");
    const row = table.table.body[1] as string[];
    expect(row).toContain("2h 30m");
    expect(row).toContain(formatArs(25_000_00));
  });

  it("states the hourly rate and the pending total", () => {
    const all = texts(build()).join("\n");
    expect(all).toContain(`Tarifa por hora: ${formatArs(10_000_00)}`);
    expect(all).toContain(`Total pendiente de pago: ${formatArs(25_000_00)}`);
    expect(all).not.toContain("Abono actual");
  });

  it("adds a per-day sessions section for each task", () => {
    const doc = build();
    const all = texts(doc).join("\n");
    expect(all).toContain("Detalle de horas");
    expect(all).toContain("Landing");
    const dayTable = doc.content.filter(
      (c) => "table" in c && c !== findTable(doc),
    )[0] as { table: { body: (string | { text: string })[][] } };
    const flat = dayTable.table.body.map((r) =>
      r.map((c) => (typeof c === "string" ? c : c.text)),
    );
    expect(flat[1]).toEqual(["01/03/2026", "10:00 – 11:30", "1h 30m"]);
    expect(flat[2]).toEqual(["02/03/2026", "09:00 – 10:00", "1h 00m"]);
  });

  it("shows a running session as in progress", () => {
    const running = [
      makeTask({
        workSessions: [
          {
            id: "r",
            taskId: "t1",
            startedAt: new Date("2026-03-05T13:00:00Z"),
            endedAt: null,
          },
        ],
      }),
    ];
    const doc = build({ tasks: running, now: new Date("2026-03-05T14:00:00Z") });
    const dayTable = doc.content.filter(
      (c) => "table" in c && c !== findTable(doc),
    )[0] as { table: { body: string[][] } };
    expect(dayTable.table.body[1][1]).toBe("10:00 – en curso");
  });

  it("filters unpaid tasks by their effective amount", () => {
    const idle = makeTask({ id: "x", title: "Idle", amountArs: 50_000_00, workSessions: [] });
    const doc = build({ tasks: [...tasks, idle], filter: "unpaid" });
    const table = findTable(doc) as { table: { body: unknown[][] } };
    // Only the task with tracked hours is billable; the idle one is 0 ARS.
    expect(table.table.body).toHaveLength(2);
  });

  it("leaves pack clients without the hourly columns or sessions section", () => {
    const packDoc = buildReportDefinition({
      client: makeClient(),
      tasks,
      summary: computePacks(tasks),
    });
    const all = texts(packDoc).join("\n");
    expect(all).not.toContain("Detalle de horas");
    expect(all).toContain("Abono mensual");
    const table = findTable(packDoc) as { table: { body: unknown[][] } };
    expect((table.table.body[0] as { text: string }[]).map((c) => c.text)).not.toContain("Horas");
  });
});
