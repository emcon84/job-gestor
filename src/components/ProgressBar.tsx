import type { PackSummary } from "@/lib/packs";
import { PACK_THRESHOLD_ARS_CENTS } from "@/lib/packs";
import { formatArs } from "@/lib/format";

/**
 * Progress toward the next 150.000 ARS pack close, based on what the client
 * still OWES (pendingPackCents). Paid tasks subtract from the bar — the client
 * may pay tasks individually, so the bar shows the remaining debt, not the raw
 * accumulated total.
 */
export default function ProgressBar({
  summary,
  threshold = PACK_THRESHOLD_ARS_CENTS,
}: {
  summary: PackSummary;
  threshold?: number;
}) {
  const pending = summary.pendingPackCents;
  const pct = Math.min(100, Math.max(0, (pending / threshold) * 100));

  return (
    <div className="rounded-2xl border border-card-border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">
          Pendiente de pago del abono
        </h2>
        <span className="text-xs text-muted">
          Pack {summary.currentPack}
          {summary.closedPacks > 0 ? ` · ${summary.closedPacks} cerrados` : ""}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={threshold}
        aria-valuenow={Math.round(pending)}
        className="h-3 w-full overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-secondary">
        <span className="font-medium text-primary">{formatArs(pending)}</span>
        <span>de {formatArs(threshold)}</span>
      </div>

      {summary.overflowCents > 0 && (
        <p className="text-xs text-muted">
          {formatArs(summary.overflowCents)} arrastrados del pack anterior.
        </p>
      )}
    </div>
  );
}
