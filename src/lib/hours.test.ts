import { describe, expect, it } from "vitest";
import type { Task, WorkSession } from "./domain";
import {
  effectiveAmountCents,
  formatHours,
  sessionDurationMs,
  totalWorkedMs,
  workedByDay,
} from "./hours";

const HOUR = 3_600_000;

function session(
  start: string,
  end: string | null,
  id = "s",
): WorkSession {
  return {
    id,
    taskId: "t1",
    startedAt: new Date(start),
    endedAt: end ? new Date(end) : null,
  };
}

function taskWith(sessions: WorkSession[], amountArs = 1_000_00): Task {
  return {
    id: "t1",
    title: "T",
    description: "",
    area: "",
    priority: "medium",
    status: "in_progress",
    clientMoveCount: 0,
    amountArs,
    fixedAmount: false,
    paymentState: null,
    paymentDueDate: null,
    serviceId: null,
    clientId: "c1",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-03-01T00:00:00Z"),
    completedAt: null,
    attachments: [],
    comments: [],
    workSessions: sessions,
  };
}

const NOW = new Date("2026-03-05T12:00:00Z");

describe("sessionDurationMs", () => {
  it("measures a closed session", () => {
    expect(
      sessionDurationMs(session("2026-03-01T10:00:00Z", "2026-03-01T11:30:00Z"), NOW),
    ).toBe(1.5 * HOUR);
  });

  it("counts a running session up to now", () => {
    expect(
      sessionDurationMs(session("2026-03-05T10:00:00Z", null), NOW),
    ).toBe(2 * HOUR);
  });

  it("never returns a negative duration", () => {
    expect(
      sessionDurationMs(session("2026-03-06T10:00:00Z", null), NOW),
    ).toBe(0);
  });
});

describe("totalWorkedMs", () => {
  it("sums closed and running sessions", () => {
    const task = taskWith([
      session("2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z", "a"),
      session("2026-03-05T11:00:00Z", null, "b"),
    ]);
    expect(totalWorkedMs(task, NOW)).toBe(2 * HOUR);
  });

  it("is zero without sessions", () => {
    expect(totalWorkedMs(taskWith([]), NOW)).toBe(0);
  });
});

describe("workedByDay", () => {
  it("groups sessions by Buenos Aires local day, oldest day first", () => {
    const task = taskWith([
      // 2026-03-02 09:00-10:00 local (UTC-3)
      session("2026-03-02T12:00:00Z", "2026-03-02T13:00:00Z", "b"),
      session("2026-03-01T13:00:00Z", "2026-03-01T14:30:00Z", "a"),
      session("2026-03-01T17:00:00Z", "2026-03-01T18:00:00Z", "c"),
    ]);
    const days = workedByDay(task, NOW);
    expect(days.map((d) => d.dayKey)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(days[0].ms).toBe(2.5 * HOUR);
    expect(days[0].sessions).toEqual([
      { start: new Date("2026-03-01T13:00:00Z"), end: new Date("2026-03-01T14:30:00Z") },
      { start: new Date("2026-03-01T17:00:00Z"), end: new Date("2026-03-01T18:00:00Z") },
    ]);
    expect(days[1].ms).toBe(HOUR);
  });

  it("uses the local day, not the UTC day, for late-evening work", () => {
    // 22:00-23:00 local on 03-01 is 01:00-02:00 UTC on 03-02.
    const task = taskWith([session("2026-03-02T01:00:00Z", "2026-03-02T02:00:00Z")]);
    expect(workedByDay(task, NOW)[0].dayKey).toBe("2026-03-01");
  });

  it("splits a session crossing local midnight across both days", () => {
    // 23:00 local 03-01 to 01:00 local 03-02.
    const task = taskWith([session("2026-03-02T02:00:00Z", "2026-03-02T04:00:00Z")]);
    const days = workedByDay(task, NOW);
    expect(days.map((d) => [d.dayKey, d.ms])).toEqual([
      ["2026-03-01", HOUR],
      ["2026-03-02", HOUR],
    ]);
    expect(days[0].sessions[0].end).toEqual(new Date("2026-03-02T03:00:00Z"));
    expect(days[1].sessions[0].start).toEqual(new Date("2026-03-02T03:00:00Z"));
    expect(days[1].sessions[0].end).toEqual(new Date("2026-03-02T04:00:00Z"));
  });

  it("keeps a running session open-ended and counts it up to now", () => {
    const task = taskWith([session("2026-03-05T10:00:00Z", null)]);
    const days = workedByDay(task, NOW);
    expect(days).toHaveLength(1);
    expect(days[0].ms).toBe(2 * HOUR);
    expect(days[0].sessions[0]).toEqual({
      start: new Date("2026-03-05T10:00:00Z"),
      end: null,
    });
  });

  it("is empty without sessions", () => {
    expect(workedByDay(taskWith([]), NOW)).toEqual([]);
  });
});

describe("effectiveAmountCents", () => {
  it("keeps the stored amount for pack clients", () => {
    const task = taskWith([session("2026-03-01T10:00:00Z", "2026-03-01T12:00:00Z")], 777);
    expect(effectiveAmountCents(task, { hourlyRateCents: null }, NOW)).toBe(777);
  });

  it("bills tracked hours times the rate for hourly clients", () => {
    const task = taskWith([session("2026-03-01T10:00:00Z", "2026-03-01T11:30:00Z")], 777);
    expect(effectiveAmountCents(task, { hourlyRateCents: 10_000_00 }, NOW)).toBe(
      15_000_00,
    );
  });

  it("counts a running session up to now and rounds to whole cents", () => {
    const task = taskWith([session("2026-03-05T11:00:00Z", null)]);
    expect(effectiveAmountCents(task, { hourlyRateCents: 10_000_00 }, NOW)).toBe(
      10_000_00,
    );
    const odd = taskWith([session("2026-03-01T10:00:00Z", "2026-03-01T10:00:01Z")]);
    expect(effectiveAmountCents(odd, { hourlyRateCents: 1_00 }, NOW)).toBe(0);
  });

  it("keeps the stored amount of a fixed-amount task for hourly clients", () => {
    const task = {
      ...taskWith([session("2026-03-01T10:00:00Z", "2026-03-01T12:00:00Z")], 50_000_00),
      fixedAmount: true,
    };
    expect(effectiveAmountCents(task, { hourlyRateCents: 10_000_00 }, NOW)).toBe(
      50_000_00,
    );
  });

  it("is zero for an hourly client with no sessions", () => {
    expect(
      effectiveAmountCents(taskWith([], 999), { hourlyRateCents: 5_000_00 }, NOW),
    ).toBe(0);
  });
});

describe("formatHours", () => {
  it("formats hours and zero-padded minutes", () => {
    expect(formatHours(2 * HOUR + 5 * 60_000)).toBe("2h 05m");
    expect(formatHours(0)).toBe("0h 00m");
    expect(formatHours(59 * 60_000 + 59_999)).toBe("0h 59m");
    expect(formatHours(26 * HOUR + 30 * 60_000)).toBe("26h 30m");
  });
});
