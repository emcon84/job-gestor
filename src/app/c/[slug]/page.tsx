import { notFound } from "next/navigation";
import Link from "next/link";
import { FileDown, Info } from "lucide-react";
import SubmitForm from "@/components/SubmitForm";
import TaskList from "@/components/TaskList";
import ProgressBar from "@/components/ProgressBar";
import RefreshOnMount from "@/components/RefreshOnMount";
import { getRepository } from "@/lib/store";
import { computePacks } from "@/lib/packs";

export const dynamic = "force-dynamic";

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const repo = await getRepository();
  const client = await repo.getClientBySlug(slug);
  if (!client) {
    notFound();
  }

  const [tasks, services] = await Promise.all([
    repo.listTasksByClient(client.id),
    repo.listServicesByClient(client.id),
  ]);
  const packSummary = computePacks(tasks, client.packThresholdCents);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28">
      <RefreshOnMount />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            Tareas de Mantenimiento y Desarrollo — {client.name}
          </h1>
          <p className="text-sm text-secondary">
            Enviá una tarea y seguí su estado acá.
          </p>
        </div>
        <a
          href={`/api/report?clientId=${client.id}`}
          download
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary transition-colors hover:border-accent hover:text-primary"
        >
          <FileDown className="h-4 w-4" aria-hidden />
          Descargar reporte PDF
        </a>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-primary">Nueva tarea</h2>
        <SubmitForm services={services} clientId={client.id} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-primary">Tu abono</h2>
        <div
          role="note"
          className="mb-3 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4"
        >
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="space-y-1 text-sm text-secondary">
            <p>
              El abono es el acuerdo de costo mensual por mantenimiento. No es
              estricto: puede sobrepasarse si es necesario.
            </p>
            <p>
              En los meses donde no se realizan tareas no se cobra — solo se
              cobra lo que se ve en este listado.
            </p>
          </div>
        </div>
        {tasks.length > 0 && (
          <ProgressBar
            summary={packSummary}
            threshold={client.packThresholdCents}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-primary">
          Tareas enviadas
        </h2>
        <TaskList tasks={tasks} />
      </section>

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