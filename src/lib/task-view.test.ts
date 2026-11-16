import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/domain";
import { filterTasks, paginate, sortRecentlyCompleted } from "@/lib/task-view";

function task(overrides: Partial<Task>): Task {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id: "t",
    title: "Title",
    description: "",
    area: "",
    priority: "medium",
    status: "pending",
    clientMoveCount: 0,
    amountArs: 0,
    fixedAmount: false,
    paymentState: null,
    paymentDueDate: null,
    serviceId: null,
    clientId: "c",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    attachments: [],
    comments: [],
    workSessions: [],
    ...overrides,
  };
}

describe("filterTasks", () => {
  const tasks = [
    task({ id: "a", title: "Arreglar menú", area: "Web", priority: "high" }),
    task({ id: "b", title: "Banner", area: "Diseño", priority: "low" }),
    task({ id: "c", title: "Otro", description: "revisar el MENU móvil", priority: "low" }),
  ];

  it("returns every task with an empty query and all priorities", () => {
    expect(filterTasks(tasks, { query: "  ", priority: "all" })).toEqual(tasks);
  });

  it("matches title, area and description ignoring case and accents", () => {
    expect(filterTasks(tasks, { query: "menu", priority: "all" }).map((t) => t.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterTasks(tasks, { query: "diseno", priority: "all" }).map((t) => t.id)).toEqual([
      "b",
    ]);
  });

  it("filters by priority combined with the query", () => {
    expect(filterTasks(tasks, { query: "menu", priority: "low" }).map((t) => t.id)).toEqual([
      "c",
    ]);
  });
});

describe("sortRecentlyCompleted", () => {
  it("orders by completedAt (fallback updatedAt) newest first without mutating", () => {
    const tasks = [
      task({ id: "old", completedAt: new Date("2026-01-01") }),
      task({ id: "new", completedAt: new Date("2026-03-01") }),
      task({ id: "mid", completedAt: null, updatedAt: new Date("2026-02-01") }),
    ];
    expect(sortRecentlyCompleted(tasks).map((t) => t.id)).toEqual(["new", "mid", "old"]);
    expect(tasks.map((t) => t.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it("returns the requested page slice and total pages", () => {
    expect(paginate(items, 2, 10)).toEqual({
      items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      page: 2,
      totalPages: 3,
    });
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(items, 9, 10).page).toBe(3);
    expect(paginate(items, 9, 10).items).toEqual([20, 21, 22]);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it("reports one page for an empty list", () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1 });
  });
});
