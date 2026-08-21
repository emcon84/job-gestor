/**
 * Shared kanban presentation metadata: column definitions, status labels, and
 * the move-status icon/color maps used by both the compact cards and the
 * owner task detail drawer. Kept in one module so the two stay in sync.
 */
import { CircleCheck, Eye, Play, Undo2, type LucideIcon } from "lucide-react";
import type { TaskStatus } from "@/lib/domain";

export const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "pending", label: "Pendiente" },
  { status: "in_progress", label: "En curso" },
  { status: "revision", label: "Revisión" },
  { status: "done", label: "Hecho" },
];

export const STATUS_VALUE: Record<TaskStatus, string> = {
  pending: "pendiente",
  in_progress: "en curso",
  revision: "en revisión",
  done: "hecho",
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "text-status-pending",
  in_progress: "text-status-progress",
  revision: "text-sky-400",
  done: "text-status-done",
};

/** Icon per target status for the move-status buttons. */
export const STATUS_ICON: Record<TaskStatus, LucideIcon> = {
  pending: Undo2,
  in_progress: Play,
  revision: Eye,
  done: CircleCheck,
};

/** Accent color per target status for the move-status buttons. */
export const MOVE_BUTTON_COLOR: Record<TaskStatus, string> = {
  pending: "text-secondary hover:border-secondary",
  in_progress: "text-status-progress hover:border-status-progress",
  revision: "text-sky-400 hover:border-sky-400",
  done: "text-status-done hover:border-status-done",
};