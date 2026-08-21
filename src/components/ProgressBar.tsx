import type { PackSummary } from "@/lib/packs";
import { PACK_THRESHOLD_ARS_CENTS } from "@/lib/packs";
import { formatArs } from "@/lib/format";

/**
 * Progress toward the next 150.000 ARS pack close.
 *
 * `summary.packAccumulatedCents` includes any carried overflow, so the bar fills
 * from 0 to the threshold. Shows the accumulated total and how many packs have
 * already closed.
 */
export default function ProgressBar({ summary }: { summary: PackSummary }) {
  const accumulated = summary.packAccumulatedCents;
  const pct = Math.min(100, Math.max(0, (accumulated / PACK_THRESHOLD_ARS_CENTS) * 100));

  return (
    <div className="rounded-2xl border border-card-border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">
          Abono hacia el próximo pack
        </h2>
        <span className="text-xs text-muted">
          Pack {summary.currentPack}
          {summary.closedPacks > 0 ? ` · ${summary.closedPacks} cerrados` : ""}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={PACK_THRESHOLD_ARS_CENTS}
        aria-valuenow={Math.round(accumulated)}
        className="h-3 w-full overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-secondary">
        <span className="font-medium text-primary">{formatArs(accumulated)}</span>
        <span>de {formatArs(PACK_THRESHOLD_ARS_CENTS)}</span>
      </div>

      {summary.overflowCents > 0 && (
        <p className="text-xs text-muted">
          {formatArs(summary.overflowCents)} arrastrados del pack anterior.
        </p>
      )}
    </div>
  );
}
