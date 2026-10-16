/**
 * Pack (abono/retainer) computation — pure, no DB state.
 *
 * Task amounts accumulate in chronological order (by `createdAt`). When the
 * cumulative total reaches `PACK_THRESHOLD_ARS_CENTS` (150.000 ARS), the current
 * pack closes and a new pack starts automatically. Any amount exceeding the
 * threshold rolls over and counts toward the next pack.
 *
 * Because pack boundaries are computed on every read (never stored), any cost
 * edit always produces a correct, up-to-date summary.
 */
import type { Task } from "./domain";
import { effectiveAmountCents } from "./hours";

/** 150.000 ARS, in integer cents. */
export const PACK_THRESHOLD_ARS_CENTS = 150_000_00;

export interface PackSummary {
  /** 1-based index of the current (still-open) pack. */
  currentPack: number;
  /** Amount accumulated in the current pack (includes carried overflow). Range [0, threshold). */
  packAccumulatedCents: number;
  /** Total unpaid task amounts across ALL packs — the client's real outstanding debt. */
  pendingPackCents: number;
  /** Amount that rolled over into the current pack when the previous one closed. */
  overflowCents: number;
  /** Number of packs already closed. */
  closedPacks: number;
}

export interface PackOptions {
  /** Client hourly rate in cents. null/omitted = pack mode (stored amounts). */
  hourlyRateCents?: number | null;
  /** Clock used to count running sessions. Defaults to the current time. */
  now?: Date;
}

/**
 * Computes pack boundaries from a list of tasks.
 *
 * Tasks are ordered chronologically by `createdAt` (stable tie-break), then a
 * running cumulative sum is taken; each time the running total reaches the
 * threshold, a pack closes and the remainder carries into the next one.
 *
 * `pendingPackCents` is the client's true outstanding debt: the sum of every
 * task not marked "paid", regardless of which pack it falls into. Closing a
 * pack never hides an unpaid task from the pending bar.
 */
export function computePacks(
  tasks: Task[],
  threshold: number = PACK_THRESHOLD_ARS_CENTS,
  options: PackOptions = {},
): PackSummary {
  const hourlyRateCents = options.hourlyRateCents ?? null;
  const now = options.now ?? new Date();
  // Hourly clients are billed on tracked time; pack clients on the stored amount.
  const amountOf = (task: Task): number | null | undefined =>
    hourlyRateCents === null
      ? task.amountArs
      : effectiveAmountCents(task, { hourlyRateCents }, now);

  // Order chronologically (oldest first). Array.prototype.sort is stable, so
  // tasks with identical timestamps keep their input order as a tie-break.
  const ordered = [...tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  let closedPacks = 0;
  let accumulated = 0;
  let currentPackStart = 0;

  for (const task of ordered) {
    const amount = amountOf(task);
    if (amount === null || amount === undefined) {
      continue;
    }
    accumulated += amount;
    while (accumulated >= threshold) {
      accumulated -= threshold;
      closedPacks += 1;
      // Whatever remains after the close is the carried overflow that starts
      // the next pack.
      currentPackStart = accumulated;
    }
  }

  // The client owes the full amount of every task not marked "paid", summed
  // across ALL packs. A task whose cost fell into a closed pack is still unpaid
  // debt — it must not vanish from the bar just because a pack boundary was
  // crossed. Paid tasks are always excluded.
  let pendingPackCents = 0;
  for (const task of ordered) {
    const amount = amountOf(task) ?? 0;
    if (amount > 0 && task.paymentState !== "paid") {
      pendingPackCents += amount;
    }
  }

  return {
    currentPack: closedPacks + 1,
    packAccumulatedCents: accumulated,
    pendingPackCents,
    overflowCents: currentPackStart,
    closedPacks,
  };
}
