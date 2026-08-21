import { describe, expect, it } from "vitest";
import {
  groupByStatus,
  resolveCompletedAt,
  validateCommentAuthorName,
  validateCommentBody,
  type Task,
} from "./domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "T",
    description: "D",
    area: "A",
    priority: "medium",
    status: "pending",
    amountArs: 0,
    paymentState: null,
    serviceId: "s1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    completedAt: null,
    attachments: [],
    comments: [],
    ...overrides,
  };
}

describe("groupByStatus", () => {
  it("groups tasks into the three kanban columns", () => {
    const pending = makeTask({ id: "p", status: "pending" });
    const inProgress = makeTask({ id: "i", status: "in_progress" });
    const done = makeTask({ id: "d", status: "done" });
    const columns = groupByStatus([pending, inProgress, done]);
    expect(columns.pending).toHaveLength(1);
    expect(columns.in_progress).toHaveLength(1);
    expect(columns.done).toHaveLength(1);
    expect(columns.pending[0].id).toBe("p");
    expect(columns.in_progress[0].id).toBe("i");
    expect(columns.done[0].id).toBe("d");
  });

  it("preserves order within each column", () => {
    const t1 = makeTask({ id: "a", status: "pending" });
    const t2 = makeTask({ id: "b", status: "pending" });
    const columns = groupByStatus([t1, t2]);
    expect(columns.pending.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("returns empty arrays for columns with no tasks", () => {
    const columns = groupByStatus([]);
    expect(columns.pending).toEqual([]);
    expect(columns.in_progress).toEqual([]);
    expect(columns.done).toEqual([]);
  });
});

describe("resolveCompletedAt", () => {
  const now = new Date("2026-01-02");

  it("sets completedAt when moving into done", () => {
    expect(resolveCompletedAt("done", now, null)).toBe(now);
  });

  it("clears completedAt when moving out of done (reopen)", () => {
    expect(resolveCompletedAt("pending", now, new Date("2026-01-01"))).toBeNull();
  });

  it("keeps completedAt null when moving between non-done statuses", () => {
    expect(resolveCompletedAt("in_progress", now, null)).toBeNull();
  });

  it("keeps an existing completedAt when staying done", () => {
    const existing = new Date("2026-01-01");
    expect(resolveCompletedAt("done", now, existing)).toBe(now);
  });
});

describe("validateCommentBody", () => {
  it("accepts a valid non-empty body", () => {
    expect(validateCommentBody("  Buen trabajo  ")).toBeNull();
  });

  it("rejects an empty or whitespace-only body", () => {
    expect(validateCommentBody("")).toBe("El comentario no puede estar vacío.");
    expect(validateCommentBody("   ")).toBe("El comentario no puede estar vacío.");
  });

  it("rejects a body over the max length", () => {
    const long = "a".repeat(2001);
    expect(validateCommentBody(long)).toContain("demasiado largo");
  });

  it("accepts a body exactly at the max length", () => {
    expect(validateCommentBody("a".repeat(2000))).toBeNull();
  });
});

describe("validateCommentAuthorName", () => {
  it("accepts a name within the max length", () => {
    expect(validateCommentAuthorName("Juan")).toBeNull();
  });

  it("accepts an empty name (caller falls back to a default label)", () => {
    expect(validateCommentAuthorName("")).toBeNull();
  });

  it("rejects a name over the max length", () => {
    const long = "a".repeat(61);
    expect(validateCommentAuthorName(long)).toContain("demasiado largo");
  });

  it("accepts a name exactly at the max length", () => {
    expect(validateCommentAuthorName("a".repeat(60))).toBeNull();
  });
});
