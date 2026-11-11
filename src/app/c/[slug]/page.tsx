import { notFound } from "next/navigation";
import Link from "next/link";
import { FileDown, Info, KeyRound } from "lucide-react";
import SectionNav from "@/components/SectionNav";
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
  const packSummary = computePacks(tasks, client.packThresholdCents, {
    hourlyRateCents: client.hourlyRateCents,
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28">
      <RefreshOnMount />
      <SectionNav
        links={[
          { href: "#tareas", label: "Tareas" },
          { href: "#nueva-tarea", label: "Nueva tarea" },
          { href: "#abono", label: "Tu abono" },
        ]}
        trailing={
          <Link
            href="/owner"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:bg-surface hover:text-primary"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Propietario
          </Link>
        }
      />
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

      <section id="nueva-tarea" className="mb-10 scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-primary">Nueva tarea</h2>
        <SubmitForm services={services} clientId={client.id} />
      </section>

      <section id="abono" className="mb-10 scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-primary">Tu abono</h2>
        <div
          role="note"
          className="mb-3 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4"
        >
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          {client.portalMessage ? (
            <p className="whitespace-pre-line text-sm text-secondary">
              {client.portalMessage}
            </p>
          ) : (
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
          )}
        </div>
        {client.showPackProgress && tasks.length > 0 && (
          <ProgressBar
            summary={packSummary}
            threshold={client.packThresholdCents}
          />
        )}
      </section>

      <section id="tareas" className="scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-primary">
          Tareas enviadas
        </h2>
        <TaskList tasks={tasks} hourlyRateCents={client.hourlyRateCents} />
      </section>
    </main>
  );
}