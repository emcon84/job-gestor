import { describe, expect, it } from "vitest";
import type { Client, Task } from "./domain";
import { buildReportDefinition, paymentLabel } from "./report";
import { computePacks } from "./packs";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "Acme SA",
    slug: "acme-sa",
    packThresholdCents: 150_000_00,
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
    expect(texts).toContain("Pendiente del abono actual: AR$ 10.000,00");
    expect(texts).toContain("Abono actual: 2");
    expect(texts).toContain("Abonos cerrados: 1");
  });

  it("renders the overflow line only when the summary has overflow", () => {
    const client = makeClient();
    const noOverflow = buildReportDefinition({
      client,
      tasks: [makeTask({ amountArs: 40_000_00 })],
      summary: computePacks([makeTask({ amountArs: 40_000_00 })], 150_000_00),
    });
    const noOverflowTexts = noOverflow.content
      .filter((c) => "text" in c)
      .map((c) => c.text);
    expect(noOverflowTexts.some((t) => t.startsWith("Excedente"))).toBe(false);

    const tasks = [
      makeTask({ amountArs: 140_000_00 }),
      makeTask({ id: "t2", amountArs: 30_000_00 }),
    ];
    const overflow = buildReportDefinition({
      client,
      tasks,
      summary: computePacks(tasks, 150_000_00),
    });
    const overflowTexts = overflow.content
      .filter((c) => "text" in c)
      .map((c) => c.text);
    expect(overflowTexts).toContain("Excedente acumulado: AR$ 20.000,00");
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

describe("paymentLabel", () => {
  it("maps paid, pending, and null states to Spanish labels", () => {
    expect(paymentLabel("paid")).toBe("Pagado");
    expect(paymentLabel("pending")).toBe("Pendiente");
    expect(paymentLabel(null)).toBe("Sin pago");
  });
});