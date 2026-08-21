import { describe, expect, it } from "vitest";
import {
  MAX_CLIENT_MOVES,
  canClientMove,
  groupByStatus,
  isDueDateOverdue,
  parseDueDate,
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
    clientMoveCount: 0,
    amountArs: 0,
    paymentState: null,
    paymentDueDate: null,
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

describe("canClientMove", () => {
  it("returns true while the task is not done and below the limit", () => {
    expect(canClientMove({ status: "pending", clientMoveCount: 0 })).toBe(true);
    expect(
      canClientMove({ status: "in_progress", clientMoveCount: MAX_CLIENT_MOVES - 1 }),
    ).toBe(true);
  });

  it("blocks moving a done task", () => {
    expect(canClientMove({ status: "done", clientMoveCount: 0 })).toBe(false);
  });

  it("blocks when the client has reached the move limit", () => {
    expect(
      canClientMove({ status: "pending", clientMoveCount: MAX_CLIENT_MOVES }),
    ).toBe(false);
  });

  it("exposes the max constant", () => {
    expect(MAX_CLIENT_MOVES).toBe(5);
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

describe("parseDueDate", () => {
  it("parses a valid YYYY-MM-DD into a local-midnight Date", () => {
    const d = parseDueDate("2026-08-21");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7); // August is 0-indexed
    expect(d!.getDate()).toBe(21);
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
  });

  it("handles single-digit month and day", () => {
    const d = parseDueDate("2026-03-05");
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(5);
  });

  it("returns null for empty input", () => {
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate("   ")).toBeNull();
  });

  it("returns null for non-YYYY-MM-DD formats", () => {
    expect(parseDueDate("21/08/2026")).toBeNull();
    expect(parseDueDate("2026-8-21")).toBeNull();
    expect(parseDueDate("20260821")).toBeNull();
  });

  it("returns null for an invalid calendar date", () => {
    expect(parseDueDate("2026-02-31")).toBeNull();
    expect(parseDueDate("2026-13-01")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseDueDate("abcdef")).toBeNull();
    expect(parseDueDate("2026-aa-bb")).toBeNull();
  });
});

describe("isDueDateOverdue", () => {
  const today = new Date(2026, 7, 21); // 2026-08-21 local

  it("is false when the due date is today", () => {
    const due = new Date(2026, 7, 21);
    expect(isDueDateOverdue(due, today)).toBe(false);
  });

  it("is false when the due date is in the future", () => {
    const due = new Date(2026, 7, 25);
    expect(isDueDateOverdue(due, today)).toBe(false);
  });

  it("is true when the due date is before today", () => {
    const due = new Date(2026, 7, 20);
    expect(isDueDateOverdue(due, today)).toBe(true);
  });
});
