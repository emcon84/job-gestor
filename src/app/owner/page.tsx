import { cookies } from "next/headers";
import OwnerUnlockForm from "@/components/OwnerUnlockForm";
import RefreshOnMount from "@/components/RefreshOnMount";
import ClientsList from "@/components/ClientsList";
import { lockOwner } from "@/app/actions";
import { COOKIE_VALUE } from "@/lib/auth";
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
  const clients = await repo.listClients();
  const clientsWithCounts = await Promise.all(
    clients.map(async (client) => ({
      client,
      taskCount: (await repo.listTasksByClient(client.id)).length,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <RefreshOnMount />

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Clientes</h1>
          <p className="text-sm text-secondary">
            Elegí un cliente para gestionar su tablero.
          </p>
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

      <ClientsList clients={clientsWithCounts} />
    </main>
  );
}