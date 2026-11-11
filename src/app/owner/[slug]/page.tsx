import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { FileDown } from "lucide-react";
import KanbanBoard from "@/components/KanbanBoard";
import ProgressBar from "@/components/ProgressBar";
import RefreshOnMount from "@/components/RefreshOnMount";
import SectionNav from "@/components/SectionNav";
import ServiceAdmin from "@/components/ServiceAdmin";
import ClientEdit from "@/components/ClientEdit";
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

export default async function OwnerClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await readCookie())) {
    redirect("/owner");
  }

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
  const columns = groupByStatus(tasks);
  const packSummary = computePacks(tasks, client.packThresholdCents, {
    hourlyRateCents: client.hourlyRateCents,
  });
  const r2Issue = r2PublicBaseUrlIssue();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <RefreshOnMount />
      <SectionNav
        links={[
          { href: "#tablero", label: "Tablero" },
          { href: "#cliente", label: "Cliente" },
          { href: "#servicios", label: "Servicios" },
        ]}
        trailing={
          <Link
            href={`/c/${client.slug}`}
            className="rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:bg-surface hover:text-primary"
          >
            Ver portal
          </Link>
        }
      />

      {r2Issue && (
        <div
          role="alert"
          className="mb-6 rounded border border-status-urgent/40 bg-error/10 p-3 text-sm text-error"
        >
          {r2Issue}
        </div>
      )}

      <header className="mb-6">
        <Link
          href="/owner"
          className="text-xs text-muted transition-colors hover:text-primary"
        >
          ← Volver al listado
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">{client.name}</h1>
            <p className="text-sm text-secondary">
              Slug: /c/{client.slug} · Abono: {client.packThresholdCents / 100} ARS
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/c/${client.slug}`}
              className="min-h-11 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary transition-colors hover:border-accent hover:text-primary"
            >
              Ver portal del cliente
            </Link>
            <a
              href={`/api/report?clientId=${client.id}`}
              download
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary transition-colors hover:border-accent hover:text-primary"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              Descargar reporte PDF
            </a>
            <a
              href={`/api/report?clientId=${client.id}&filter=unpaid`}
              download
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-secondary transition-colors hover:border-accent hover:text-primary"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              PDF solo impagas
            </a>
          </div>
        </div>
      </header>

      {tasks.length > 0 && (
        <section className="mb-6">
          <ProgressBar
            summary={packSummary}
            threshold={client.packThresholdCents}
          />
        </section>
      )}

      <section id="tablero" className="mb-6 scroll-mt-20">
        <KanbanBoard
          columns={columns}
          services={services}
          hourlyRateCents={client.hourlyRateCents}
        />
      </section>

      <section id="cliente" className="mb-6 scroll-mt-20">
        <ClientEdit client={client} />
      </section>

      <section id="servicios" className="mb-6 scroll-mt-20">
        <ServiceAdmin clientId={client.id} services={services} />
      </section>
    </main>
  );
}