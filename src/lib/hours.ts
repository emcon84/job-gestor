/**
 * Hourly billing helpers — pure functions over a task's work sessions.
 *
 * Running sessions (no `endedAt`) are counted up to a caller-supplied `now`, so
 * every function is deterministic and unit-testable. Days are bucketed in the
 * business time zone (Buenos Aires), not UTC or the server's zone.
 */
import type { Client, Task, WorkSession } from "./domain";

export const BILLING_TIME_ZONE = "America/Argentina/Buenos_Aires";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

export interface DaySessionSpan {
  start: Date;
  /** null = the session is still running. */
  end: Date | null;
}

export interface DayWork {
  /** Local calendar day, 'YYYY-MM-DD'. */
  dayKey: string;
  /** Milliseconds worked on that day. */
  ms: number;
  sessions: DaySessionSpan[];
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BILLING_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Local wall-clock parts of an instant in the billing time zone. */
function localParts(date: Date) {
  const get: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") {
      get[p.type] = Number(p.value);
    }
  }
  return get;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BILLING_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

/** Local clock time in the billing zone, 'HH:mm'. */
export function formatLocalTime(date: Date): string {
  return timeFormatter.format(date);
}

function dayKeyOf(date: Date): string {
  const p = localParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** First instant of the local day following the one containing `date`. */
function nextLocalMidnight(date: Date): Date {
  const p = localParts(date);
  // Offset = local wall clock read as UTC minus the real instant.
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMs = wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - offsetMs);
}

/** Duration of one session in ms; a running session counts up to `now`. */
export function sessionDurationMs(session: WorkSession, now: Date): number {
  const end = session.endedAt ?? now;
  return Math.max(0, end.getTime() - session.startedAt.getTime());
}

/** Total tracked time of a task in ms (running session counted up to `now`). */
export function totalWorkedMs(
  task: Pick<Task, "workSessions">,
  now: Date,
): number {
  return task.workSessions.reduce((sum, s) => sum + sessionDurationMs(s, now), 0);
}

/**
 * Tracked time per local day, oldest day first. A session crossing local
 * midnight is split so each day carries only its own portion.
 */
export function workedByDay(
  task: Pick<Task, "workSessions">,
  now: Date,
): DayWork[] {
  const byDay = new Map<string, DayWork>();
  const sessions = [...task.workSessions].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );

  for (const session of sessions) {
    const sessionEnd = session.endedAt ?? now;
    let cursor = session.startedAt;
    if (sessionEnd.getTime() <= cursor.getTime()) {
      continue;
    }
    while (cursor.getTime() < sessionEnd.getTime()) {
      const boundary = nextLocalMidnight(cursor);
      const crossesMidnight = boundary.getTime() < sessionEnd.getTime();
      const pieceEnd = crossesMidnight ? boundary : sessionEnd;
      const key = dayKeyOf(cursor);
      const day = byDay.get(key) ?? { dayKey: key, ms: 0, sessions: [] };
      day.ms += pieceEnd.getTime() - cursor.getTime();
      day.sessions.push({
        start: cursor,
        // The final piece of a still-running session stays open-ended.
        end: !crossesMidnight && session.endedAt === null ? null : pieceEnd,
      });
      byDay.set(key, day);
      cursor = pieceEnd;
    }
  }

  return [...byDay.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/**
 * The amount a task is worth for its client: the stored amount in pack mode, or
 * tracked hours x hourly rate (rounded to whole cents) in hourly mode. A
 * fixed-amount task always bills its stored amount.
 */
export function effectiveAmountCents(
  task: Pick<Task, "amountArs" | "workSessions"> & { fixedAmount?: boolean },
  client: Pick<Client, "hourlyRateCents">,
  now: Date = new Date(),
): number {
  if (client.hourlyRateCents === null || task.fixedAmount) {
    return task.amountArs;
  }
  return Math.round(
    (totalWorkedMs(task, now) / MS_PER_HOUR) * client.hourlyRateCents,
  );
}

/** Formats a duration as e.g. "2h 05m" (minutes floored). */
export function formatHours(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / MS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
