import SubmitForm from "@/components/SubmitForm";
import TaskList from "@/components/TaskList";
import ProgressBar from "@/components/ProgressBar";
import RefreshOnMount from "@/components/RefreshOnMount";
import { getRepository } from "@/lib/store";
import { computePacks } from "@/lib/packs";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repo = await getRepository();
  const tasks = await repo.listTasks();
  const services = await repo.listServices();
  const packSummary = computePacks(tasks);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28">
      <RefreshOnMount />
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary">
          Tareas de Mantenimiento y Desarrollo
        </h1>
        <p className="text-sm text-secondary">
          Enviá una tarea y seguí su estado acá.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-primary">Nueva tarea</h2>
        <SubmitForm services={services} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-primary">Tu abono</h2>
        <div className="mb-3 rounded-2xl border border-card-border bg-card p-5 space-y-2">
          <p className="text-sm text-secondary">
            El abono es el acuerdo de costo mensual por mantenimiento. No es
            estricto: puede sobrepasarse si es necesario.
          </p>
          <p className="text-sm text-secondary">
            En los meses donde no se realizan tareas no se cobra — solo se cobra
            lo que se ve en este listado.
          </p>
        </div>
        {tasks.length > 0 && <ProgressBar summary={packSummary} />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-primary">
          Tareas enviadas
        </h2>
        <TaskList tasks={tasks} />
      </section>
    </main>
  );
}
