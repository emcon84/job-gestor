import type { Task } from "@/lib/domain";
import PortalTaskList from "@/components/PortalTaskList";

/**
 * Portal task list (server). Delegates rendering + the payment filter to the
 * client PortalTaskList so filtering works without a page reload.
 */
export default function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-card-border bg-card p-6 text-center text-muted">
        Todavía no hay tareas.
      </p>
    );
  }

  return <PortalTaskList tasks={tasks} />;
}