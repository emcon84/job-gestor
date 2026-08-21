import SubmitForm from "@/components/SubmitForm";
import TaskList from "@/components/TaskList";
import ProgressBar from "@/components/ProgressBar";
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
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Mis tareas</h1>
        <p className="text-sm text-secondary">
          Enviá una tarea de mantenimiento y seguí su estado acá.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-primary">Nueva tarea</h2>
        <SubmitForm services={services} />
      </section>

      {tasks.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-primary">Tu abono</h2>
          <ProgressBar summary={packSummary} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-primary">
          Tareas enviadas
        </h2>
        <TaskList tasks={tasks} />
      </section>
    </main>
  );
}
