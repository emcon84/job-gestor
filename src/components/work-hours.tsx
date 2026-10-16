"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/domain";
import { formatHours, formatLocalTime, workedByDay } from "@/lib/hours";

/** True when the task has a work session without an end (timer running). */
export function hasRunningSession(task: Pick<Task, "workSessions">): boolean {
  return task.workSessions.some((s) => s.endedAt === null);
}

/**
 * Current time that re-renders every second while `active`. Purely client-side
 * (no server polling). Time-derived text rendered from it should carry
 * `suppressHydrationWarning`, since the server render happens at another instant.
 */
export function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** "2026-08-21" -> "21/08/2026" (the key is already a local calendar day). */
function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Read-only per-day list of tracked time: date, start-end of each session and
 * hours worked that day. A running session shows "en curso" as its end.
 */
export function WorkDayList({
  task,
  now,
}: {
  task: Pick<Task, "workSessions">;
  now: Date;
}) {
  const days = workedByDay(task, now);
  if (days.length === 0) {
    return <p className="text-xs text-muted">Todavía no hay horas registradas.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {days.map((day) => (
        <li
          key={day.dayKey}
          className="rounded-lg border border-card-border bg-surface px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-primary">
              {formatDayKey(day.dayKey)}
            </span>
            <span className="text-secondary" suppressHydrationWarning>
              {formatHours(day.ms)}
            </span>
          </div>
          <p className="mt-0.5 text-muted" suppressHydrationWarning>
            {day.sessions
              .map(
                (s) =>
                  `${formatLocalTime(s.start)}–${s.end ? formatLocalTime(s.end) : "en curso"}`,
              )
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
