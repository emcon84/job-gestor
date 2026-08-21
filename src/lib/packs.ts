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

/** 150.000 ARS, in integer cents. */
export const PACK_THRESHOLD_ARS_CENTS = 150_000_00;

export interface PackSummary {
  /** 1-based index of the current (still-open) pack. */
  currentPack: number;
  /** Amount accumulated in the current pack (includes carried overflow). Range [0, threshold). */
  packAccumulatedCents: number;
  /** Unpaid portion of the current pack — what the client still owes toward the next close. */
  pendingPackCents: number;
  /** Amount that rolled over into the current pack when the previous one closed. */
  overflowCents: number;
  /** Number of packs already closed. */
  closedPacks: number;
}

/**
 * Computes pack boundaries from a list of tasks.
 *
 * Tasks are ordered chronologically by `createdAt` (stable tie-break), then a
 * running cumulative sum is taken; each time the running total reaches the
 * threshold, a pack closes and the remainder carries into the next one.
 */
export function computePacks(
  tasks: Task[],
  threshold: number = PACK_THRESHOLD_ARS_CENTS,
): PackSummary {
  // Order chronologically (oldest first). Array.prototype.sort is stable, so
  // tasks with identical timestamps keep their input order as a tie-break.
  const ordered = [...tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  let closedPacks = 0;
  let accumulated = 0;
  let currentPackStart = 0;

  for (const task of ordered) {
    if (task.amountArs === null || task.amountArs === undefined) {
      continue;
    }
    accumulated += task.amountArs;
    while (accumulated >= threshold) {
      accumulated -= threshold;
      closedPacks += 1;
      // Whatever remains after the close is the carried overflow that starts
      // the next pack.
      currentPackStart = accumulated;
    }
  }

  // The current (partial) pack is the tail of the chronological total: the
  // most recent portions that sum to `accumulated`. Walk it backwards and sum
  // only the UNPAID portions — paid tasks subtract from what the client owes.
  let pendingPackCents = 0;
  let remaining = accumulated;
  for (const task of [...ordered].reverse()) {
    if (remaining <= 0) {
      break;
    }
    const amount = task.amountArs ?? 0;
    if (amount <= 0) {
      continue;
    }
    const portion = Math.min(amount, remaining);
    if (task.paymentState !== "paid") {
      pendingPackCents += portion;
    }
    remaining -= portion;
  }

  return {
    currentPack: closedPacks + 1,
    packAccumulatedCents: accumulated,
    pendingPackCents,
    overflowCents: currentPackStart,
    closedPacks,
  };
}
