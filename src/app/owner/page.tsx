import { cookies } from "next/headers";
import KanbanBoard from "@/components/KanbanBoard";
import OwnerUnlockForm from "@/components/OwnerUnlockForm";
import ProgressBar from "@/components/ProgressBar";
import RefreshOnMount from "@/components/RefreshOnMount";
import ServiceAdmin from "@/components/ServiceAdmin";
import { lockOwner } from "@/app/actions";
import { COOKIE_VALUE } from "@/lib/auth";
import { groupByStatus } from "@/lib/domain";
import { computePacks } from "@/lib/packs";
import { r2PublicBaseUrlIssue } from "@/lib/r2";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

async function readCookie() {
  const store = await cookies();
  return store.get("owner")?.value === COOKIE_VALUE;
}

export default async function OwnerPage() {
  const isOwner = await readCookie();

  if (!isOwner) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold text-primary">Panel del propietario</h1>
        <p className="mb-6 text-sm text-secondary">
          Ingresá la contraseña para gestionar las tareas.
        </p>
        <OwnerUnlockForm />
      </main>
    );
  }

  const repo = await getRepository();
  const tasks = await repo.listTasks();
  const services = await repo.listServices();
  const columns = groupByStatus(tasks);
  const packSummary = computePacks(tasks);
  const r2Issue = r2PublicBaseUrlIssue();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <RefreshOnMount />

      {r2Issue && (
        <div
          role="alert"
          className="mb-6 rounded border border-status-urgent/40 bg-error/10 p-3 text-sm text-error"
        >
          {r2Issue}
        </div>
      )}

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tablero</h1>
          <p className="text-sm text-secondary">Gestioná el estado, monto y pago.</p>
        </div>
        <form action={lockOwner}>
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary"
          >
            Bloquear
          </button>
        </form>
      </header>

      {tasks.length > 0 && (
        <section className="mb-6">
          <ProgressBar summary={packSummary} />
        </section>
      )}

      <section className="mb-6">
        <ServiceAdmin services={services} />
      </section>

      <KanbanBoard columns={columns} />
    </main>
  );
}
