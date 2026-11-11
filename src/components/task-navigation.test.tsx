import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Task, TaskStatus } from "@/lib/domain";
import { groupByStatus } from "@/lib/domain";
import KanbanBoard from "@/components/KanbanBoard";
import PortalTaskList from "@/components/PortalTaskList";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  updateTask: vi.fn(),
  moveTaskStatusClient: vi.fn(),
  addComment: vi.fn(),
}));

// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = vi.fn();

function makeTasks(count: number, status: TaskStatus, prefix: string): Task[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(2026, 0, i + 1);
    return {
      id: `${prefix}-${i + 1}`,
      title: `${prefix} ${i + 1}`,
      description: "",
      area: "Web",
      priority: "medium",
      status,
      clientMoveCount: 0,
      amountArs: 0,
      paymentState: null,
      paymentDueDate: null,
      serviceId: "s",
      clientId: "c",
      createdAt: date,
      updatedAt: date,
      completedAt: status === "done" ? date : null,
      attachments: [],
      comments: [],
      workSessions: [],
    };
  });
}

describe("KanbanBoard navigation", () => {
  it("shows only the 10 most recent done tasks until 'Ver todas' is pressed", async () => {
    const tasks = [...makeTasks(2, "pending", "Pend"), ...makeTasks(14, "done", "Done")];
    render(
      <KanbanBoard columns={groupByStatus(tasks)} services={[]} hourlyRateCents={null} />,
    );

    const done = screen.getByRole("heading", { name: /Hecho/ }).closest("section")!;
    expect(within(done).getAllByRole("article")).toHaveLength(10);
    // Most recently completed first.
    expect(within(done).getAllByRole("article")[0]).toHaveTextContent("Done 14");
    expect(within(done).queryByText("Done 1")).toBeNull();

    await userEvent.click(within(done).getByRole("button", { name: "Ver todas (14)" }));
    expect(within(done).getAllByRole("article")).toHaveLength(14);
  });

  it("filters every column by the search query", async () => {
    const tasks = [...makeTasks(3, "pending", "Pend"), ...makeTasks(3, "done", "Done")];
    render(
      <KanbanBoard columns={groupByStatus(tasks)} services={[]} hourlyRateCents={null} />,
    );

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar tareas" }), "pend 2");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Pend 2")).toBeInTheDocument();
  });
});

describe("PortalTaskList navigation", () => {
  it("paginates 10 tasks per page", async () => {
    render(<PortalTaskList tasks={makeTasks(23, "pending", "Task")} hourlyRateCents={null} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(10);
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("Página 3 de 3")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("filters by task status and resets to the first page", async () => {
    const tasks = [...makeTasks(12, "pending", "Pend"), ...makeTasks(2, "done", "Done")];
    render(<PortalTaskList tasks={tasks} hourlyRateCents={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await userEvent.click(screen.getByRole("button", { name: "Hecho (2)" }));

    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Done 1",
      "Done 2",
    ]);
    expect(screen.queryByRole("navigation", { name: "Paginación" })).toBeNull();
  });
});
