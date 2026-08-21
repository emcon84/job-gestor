import Link from "next/link";
import RefreshOnMount from "@/components/RefreshOnMount";
import { getRepository } from "@/lib/store";
import { formatArs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repo = await getRepository();
  const clients = await repo.listClients();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28">
      <RefreshOnMount />
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary">
          Tareas de Mantenimiento y Desarrollo
        </h1>
        <p className="text-sm text-secondary">
          Elegí tu portal de cliente para enviar y seguir tareas.
        </p>
      </header>

      {clients.length === 0 ? (
        <p className="rounded-2xl border border-card-border bg-card p-6 text-center text-muted">
          Todavía no hay clientes.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/c/${client.slug}`}
                className="block rounded-2xl border border-card-border bg-card p-5 transition-colors hover:border-accent"
              >
                <h2 className="text-lg font-semibold text-primary">
                  {client.name}
                </h2>
                <p className="mt-1 text-sm text-secondary">
                  Abono: {formatArs(client.packThresholdCents)}
                </p>
                <span className="mt-3 inline-block text-sm font-medium text-accent">
                  Portal del cliente →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-10 border-t border-card-border pt-4 text-center">
        <Link
          href="/owner"
          className="text-xs text-muted transition-colors hover:text-primary"
        >
          Acceso del propietario
        </Link>
      </footer>
    </main>
  );
}