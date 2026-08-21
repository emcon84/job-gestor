import type { PaymentState } from "@/lib/domain";

/**
 * Visual payment-state badge (pill). Green for paid, amber for pending,
 * neutral gray for not-yet-assigned.
 */
export default function PaymentBadge({ state }: { state: PaymentState | null }) {
  if (state === "paid") {
    return (
      <span className="inline-flex items-center rounded-full border border-success/40 bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
        Pagado
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="inline-flex items-center rounded-full border border-status-progress/40 bg-status-progress/15 px-2.5 py-0.5 text-xs font-semibold text-status-progress">
        Pendiente de pago
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-card-border bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
      Sin pago
    </span>
  );
}