import { describe, expect, it } from "vitest";
import { computePacks } from "./packs";
import type { Task } from "./domain";

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
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    completedAt: null,
    attachments: [],
    comments: [],
    ...overrides,
  };
}

describe("computePacks", () => {
  it("reports zero accumulation for no tasks", () => {
    const s = computePacks([]);
    expect(s.closedPacks).toBe(0);
    expect(s.currentPack).toBe(1);
    expect(s.packAccumulatedCents).toBe(0);
    expect(s.overflowCents).toBe(0);
  });

  it("accumulates amounts below the threshold into a single open pack", () => {
    const tasks = [
      makeTask({ id: "a", amountArs: 60_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 40_000_00, createdAt: new Date("2026-01-02") }),
    ];
    const s = computePacks(tasks);
    expect(s.closedPacks).toBe(0);
    expect(s.currentPack).toBe(1);
    expect(s.packAccumulatedCents).toBe(100_000_00);
    expect(s.overflowCents).toBe(0);
  });

  it("closes a pack and carries overflow into the next (120k + 40k)", () => {
    const tasks = [
      makeTask({ id: "a", amountArs: 120_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 40_000_00, createdAt: new Date("2026-01-02") }),
    ];
    const s = computePacks(tasks);
    // Total 160k -> pack 1 closes at 150k, 10k carries into pack 2.
    expect(s.closedPacks).toBe(1);
    expect(s.currentPack).toBe(2);
    expect(s.packAccumulatedCents).toBe(10_000_00);
    expect(s.overflowCents).toBe(10_000_00);
  });

  it("rolls overflow across a close (140k + 30k -> pack 2 starts with 20k)", () => {
    const tasks = [
      makeTask({ id: "a", amountArs: 140_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 30_000_00, createdAt: new Date("2026-01-02") }),
    ];
    const s = computePacks(tasks);
    expect(s.closedPacks).toBe(1);
    expect(s.currentPack).toBe(2);
    expect(s.packAccumulatedCents).toBe(20_000_00);
    expect(s.overflowCents).toBe(20_000_00);
  });

  it("accounts for multiple sequential closes", () => {
    const tasks = [
      makeTask({ id: "a", amountArs: 150_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 150_000_00, createdAt: new Date("2026-01-02") }),
      makeTask({ id: "c", amountArs: 25_000_00, createdAt: new Date("2026-01-03") }),
    ];
    const s = computePacks(tasks);
    expect(s.closedPacks).toBe(2);
    expect(s.currentPack).toBe(3);
    expect(s.packAccumulatedCents).toBe(25_000_00);
    expect(s.overflowCents).toBe(0);
  });

  it("handles a single task that spans several packs (overflow rollover chain)", () => {
    const tasks = [
      makeTask({ id: "a", amountArs: 400_000_00, createdAt: new Date("2026-01-01") }),
    ];
    const s = computePacks(tasks);
    // 400k -> closes at 150 (250 left), 300 (100 left) -> 2 closed, 100k in pack 3.
    expect(s.closedPacks).toBe(2);
    expect(s.currentPack).toBe(3);
    expect(s.packAccumulatedCents).toBe(100_000_00);
    expect(s.overflowCents).toBe(100_000_00);
  });

  it("orders by createdAt chronologically regardless of input order", () => {
    const tasks = [
      makeTask({ id: "new", amountArs: 30_000_00, createdAt: new Date("2026-01-05") }),
      makeTask({ id: "mid", amountArs: 140_000_00, createdAt: new Date("2026-01-03") }),
    ];
    const s = computePacks(tasks);
    // Chronological: mid (140k) then new (30k) = 170k -> pack1 150k, overflow 20k.
    expect(s.closedPacks).toBe(1);
    expect(s.currentPack).toBe(2);
    expect(s.packAccumulatedCents).toBe(20_000_00);
  });

  it("recomputes correctly when a cost edit lowers a task below the threshold", () => {
    const base = [
      makeTask({ id: "a", amountArs: 120_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 40_000_00, createdAt: new Date("2026-01-02") }),
    ];
    // Original: 160k -> pack 2 with 10k.
    expect(computePacks(base).closedPacks).toBe(1);
    // Edit task b down to 20k -> total 140k -> no pack closes.
    const edited = [
      makeTask({ id: "a", amountArs: 120_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 20_000_00, createdAt: new Date("2026-01-02") }),
    ];
    const s = computePacks(edited);
    expect(s.closedPacks).toBe(0);
    expect(s.currentPack).toBe(1);
    expect(s.packAccumulatedCents).toBe(140_000_00);
  });

  it("accumulates tasks regardless of order, threshold not yet reached", () => {
    const tasks = [
      makeTask({ id: "a", amountArs: 40_000_00, createdAt: new Date("2026-01-01") }),
      makeTask({ id: "b", amountArs: 60_000_00, createdAt: new Date("2026-01-02") }),
    ];
    const s = computePacks(tasks);
    expect(s.packAccumulatedCents).toBe(100_000_00);
    expect(s.closedPacks).toBe(0);
  });
});
