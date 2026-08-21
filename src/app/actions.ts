"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, COOKIE_VALUE, verifyPassphrase } from "@/lib/auth";
import { getUploadUrl, MAX_ATTACHMENT_BYTES, resolveImageType } from "@/lib/r2";
import type {
  Attachment,
  CommentAuthor,
  PaymentState,
  Priority,
  ServiceOption,
  TaskStatus,
} from "@/lib/domain";
import {
  PRIORITIES,
  STATUSES,
  STATUS_LABELS,
  canClientMove,
  parseDueDate,
  validateCommentAuthorName,
  validateCommentBody,
} from "@/lib/domain";
import { parsePesosToCents } from "@/lib/format";
import { getRepository } from "@/lib/store";
import { sendPushNotifications } from "@/lib/push";
import type { ActionResult, UnlockState, UploadUrlResult } from "@/lib/action-types";

/** Reads whether the current request carries a valid owner cookie. */
export async function isOwner(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value === COOKIE_VALUE;
}

/** Derives a rate-limit key from the request. */
async function rateLimitKey(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : "local";
  return `unlock:${ip}`;
}

/**
 * Returns a presigned PUT URL for a direct-to-R2 image upload.
 * Safe for unauthenticated clients (the client portal is shared-link).
 */
export async function getUploadUrlAction(
  filename: string,
  contentType: string,
): Promise<UploadUrlResult> {
  if (!filename) {
    return { ok: false, error: "Falta el nombre del archivo." };
  }
  const mime = resolveImageType(contentType, filename);
  if (!mime) {
    return { ok: false, error: "Solo se permiten archivos de imagen." };
  }
  const { uploadUrl, objectKey, publicUrl } = await getUploadUrl({
    filename,
    contentType: mime,
  });
  return { ok: true, uploadUrl, objectKey, publicUrl, maxSizeBytes: MAX_ATTACHMENT_BYTES };
}

/**
 * Creates a task. Client submits title/description/area/priority, an assigned
 * catalog `serviceId`, plus a JSON array of already-uploaded attachment records
 * (name, url, contentType, sizeBytes). The task amount is auto-filled from the
 * service default (server-resolved, authoritative); the owner may edit it later.
 */
export async function createTask(formData: FormData): Promise<ActionResult> {
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const area = (formData.get("area") as string | null)?.trim() ?? "";
  const priority = (formData.get("priority") as string | null) ?? "medium";
  const serviceId = (formData.get("serviceId") as string | null) ?? "";
  const attachmentsRaw = (formData.get("attachments") as string | null) ?? "[]";

  if (!title) {
    return { ok: false, error: "El título es obligatorio." };
  }
  if (!description) {
    return { ok: false, error: "La descripción es obligatoria." };
  }
  if (!area) {
    return { ok: false, error: "El área o sistema es obligatorio." };
  }
  if (!serviceId) {
    return { ok: false, error: "Seleccioná un servicio." };
  }
  const validPriority: Priority = PRIORITIES.includes(priority as Priority)
    ? (priority as Priority)
    : "medium";

  let attachments: Attachment[] = [];
  try {
    attachments = JSON.parse(attachmentsRaw) as Attachment[];
  } catch {
    return { ok: false, error: "Archivos adjuntos inválidos." };
  }
  for (const a of attachments) {
    if (
      !a ||
      typeof a.name !== "string" ||
      typeof a.url !== "string" ||
      typeof a.contentType !== "string" ||
      typeof a.sizeBytes !== "number"
    ) {
      return { ok: false, error: "Archivos adjuntos inválidos." };
    }
    // Server-side re-validation: images only, within the size cap (authoritative,
    // not just the client/Blob token).
    if (!resolveImageType(a.contentType, a.name)) {
      return { ok: false, error: "Solo se permiten archivos de imagen." };
    }
    if (a.sizeBytes > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "Un archivo supera el tamaño máximo permitido." };
    }
  }

  const repo = await getRepository();
  // The service must exist in the catalog (server-resolved, authoritative).
  if ((await repo.resolveServiceCost(serviceId)) === null) {
    return { ok: false, error: "El servicio seleccionado no existe." };
  }
  await repo.createTask({
    title,
    description,
    area,
    priority: validPriority,
    serviceId,
    attachments,
  });

  await sendPushNotifications({ type: "task_created", body: title });

  revalidatePath("/");
  return { ok: true, message: "Tarea enviada correctamente." };
}

/** Returns the service catalog options for the submit form (client selector). */
export async function getServices(): Promise<ServiceOption[]> {
  const repo = await getRepository();
  return repo.listServices();
}

/**
 * Unlocks the owner session with the passphrase. Issues an httpOnly cookie on
 * success; failed attempts are rate-limited. Compatible with React's
 * `useActionState` so the unlock form can surface errors.
 */
export async function unlockOwner(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const passphrase = (formData.get("passphrase") as string | null) ?? "";
  const secret = process.env.OWNER_PASSPHRASE ?? "";
  const key = await rateLimitKey();

  const result = verifyPassphrase(passphrase, secret, key);
  if (!result.ok) {
    if (result.error === "locked") {
      return {
        error: "Demasiados intentos. Volvé a intentar en unos minutos.",
      };
    }
    return { error: "Contraseña incorrecta." };
  }

  const store = await cookies();
  store.set(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  revalidatePath("/");
  redirect("/owner");
}

/** Locks the owner session by clearing the cookie. */
export async function lockOwner(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  revalidatePath("/owner");
  revalidatePath("/");
}

function isStatus(v: string): v is TaskStatus {
  return STATUSES.includes(v as TaskStatus);
}

function isPaymentState(v: string): v is PaymentState {
  return v === "paid" || v === "pending";
}

/**
 * Owner-only: updates a task's status, amount (ARS pesos -> cents), and/or
 * payment state. Requires the owner cookie. Overwrites current values.
 */
export async function updateTask(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const id = (formData.get("id") as string | null) ?? "";
  if (!id) {
    return { ok: false, error: "Falta el id de la tarea." };
  }

  const statusRaw = formData.get("status") as string | null;
  const amountRaw = formData.get("amountArs") as string | null;
  const paymentRaw = formData.get("paymentState") as string | null;
  const dueDateRaw = formData.get("paymentDueDate") as string | null;

  if (statusRaw && !isStatus(statusRaw)) {
    return { ok: false, error: "Estado inválido." };
  }
  if (paymentRaw && !isPaymentState(paymentRaw)) {
    return { ok: false, error: "Estado de pago inválido." };
  }

  let amountArs: number | null | undefined;
  if (amountRaw !== null && amountRaw !== undefined && amountRaw.trim() !== "") {
    const cents = parsePesosToCents(amountRaw);
    if (cents === null) {
      return { ok: false, error: "Monto inválido." };
    }
    amountArs = cents;
  }

  // Payment due date: empty string -> null (clears); otherwise must parse.
  let paymentDueDate: Date | null | undefined;
  if (dueDateRaw !== null && dueDateRaw !== undefined && dueDateRaw.trim() !== "") {
    const parsed = parseDueDate(dueDateRaw);
    if (parsed === null) {
      return { ok: false, error: "Fecha de vencimiento inválida." };
    }
    paymentDueDate = parsed;
  } else if (dueDateRaw !== null && dueDateRaw !== undefined) {
    paymentDueDate = null;
  }

  const repo = await getRepository();
  const updated = await repo.updateTask(id, {
    status: statusRaw ? (statusRaw as TaskStatus) : undefined,
    amountArs: amountArs ?? undefined,
    paymentState: paymentRaw ? (paymentRaw as PaymentState) : undefined,
    paymentDueDate,
  });

  if (!updated) {
    return { ok: false, error: "No se encontró la tarea." };
  }

  await sendPushNotifications({
    type: "task_status",
    body: `${updated.title}: ${STATUS_LABELS[updated.status]}`,
  });

  revalidatePath("/owner");
  revalidatePath("/");
  return { ok: true, message: "Tarea actualizada." };
}

/**
 * Moves a task's status. When the request carries the owner cookie it behaves
 * like a normal status update (no counter, no limit). For a client (portal),
 * the move is only allowed while the task is not done and the client still has
 * moves remaining; on success the status is set and the client move counter is
 * incremented.
 */
export async function moveTaskStatusClient(
  formData: FormData,
): Promise<ActionResult> {
  const id = (formData.get("id") as string | null) ?? "";
  const statusRaw = formData.get("status") as string | null;

  if (!id) {
    return { ok: false, error: "Falta el id de la tarea." };
  }
  if (!statusRaw || !isStatus(statusRaw)) {
    return { ok: false, error: "Estado inválido." };
  }

  const repo = await getRepository();
  const task = await repo.getTask(id);
  if (!task) {
    return { ok: false, error: "No se encontró la tarea." };
  }

  if (await isOwner()) {
    await repo.updateTask(id, { status: statusRaw });
    await sendPushNotifications({
      type: "task_status",
      body: `${task.title}: ${STATUS_LABELS[statusRaw]}`,
    });
    revalidatePath("/");
    revalidatePath("/owner");
    return { ok: true, message: "Estado actualizado." };
  }

  if (task.status === "done") {
    return { ok: false, error: "La tarea ya está completada." };
  }
  if (!canClientMove(task)) {
    return {
      ok: false,
      error: "Se alcanzó el límite de movimientos para esta tarea.",
    };
  }

  await repo.updateTask(id, {
    status: statusRaw,
    clientMoveCount: task.clientMoveCount + 1,
  });
  await sendPushNotifications({
    type: "task_status",
    body: `${task.title}: ${STATUS_LABELS[statusRaw]}`,
  });
  revalidatePath("/");
  revalidatePath("/owner");
  return { ok: true, message: "Estado actualizado." };
}

/**
 * Adds a comment to a task thread. Works for BOTH the owner (unlocked cookie)
 * and the client portal (shared link, no auth). The author is derived from the
 * owner cookie, so a portal visitor posting is the normal client flow. Clients
 * provide their own display name; the owner is always shown as "Propietario".
 */
export async function addComment(formData: FormData): Promise<ActionResult> {
  const taskId = (formData.get("taskId") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  const authorName = (formData.get("authorName") as string | null)?.trim() ?? "";

  if (!taskId) {
    return { ok: false, error: "Falta la tarea." };
  }
  const bodyError = validateCommentBody(body);
  if (bodyError) {
    return { ok: false, error: bodyError };
  }

  let author: CommentAuthor;
  let name: string;
  if (await isOwner()) {
    // Owner comments never trust a client-submitted name.
    author = "owner";
    name = "Propietario";
  } else {
    const nameError = validateCommentAuthorName(authorName);
    if (nameError) {
      return { ok: false, error: nameError };
    }
    author = "client";
    name = authorName || "Cliente";
  }

  const repo = await getRepository();
  const created = await repo.addComment({ taskId, body, author, authorName: name });
  if (!created) {
    return { ok: false, error: "No se encontró la tarea." };
  }

  await sendPushNotifications({ type: "task_comment", body });

  revalidatePath("/");
  revalidatePath("/owner");
  return { ok: true, message: "Comentario agregado." };
}

/**
 * Owner-only: deletes a task, its attachments (cascade), and any blobs.
 * Requires the owner cookie.
 */
export async function deleteTask(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const id = (formData.get("id") as string | null) ?? "";
  if (!id) {
    return { ok: false, error: "Falta el id de la tarea." };
  }
  const repo = await getRepository();
  await repo.deleteTask(id);
  revalidatePath("/owner");
  revalidatePath("/");
  return { ok: true, message: "Tarea eliminada." };
}

/** Owner-only: creates a catalog service with a fixed default cost (pesos -> cents). */
export async function createService(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const costRaw = (formData.get("defaultCostArs") as string | null) ?? "";
  if (!name) {
    return { ok: false, error: "El nombre del servicio es obligatorio." };
  }
  const cents = parsePesosToCents(costRaw);
  if (cents === null) {
    return { ok: false, error: "Costo inválido." };
  }
  const repo = await getRepository();
  await repo.createService({ name, defaultCostArs: cents });
  revalidatePath("/owner");
  revalidatePath("/");
  return { ok: true, message: "Servicio creado." };
}

/** Owner-only: updates a service name / default cost. */
export async function updateService(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const id = (formData.get("id") as string | null) ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const costRaw = (formData.get("defaultCostArs") as string | null) ?? "";
  if (!id) {
    return { ok: false, error: "Falta el id del servicio." };
  }
  if (!name) {
    return { ok: false, error: "El nombre del servicio es obligatorio." };
  }
  const cents = parsePesosToCents(costRaw);
  if (cents === null) {
    return { ok: false, error: "Costo inválido." };
  }
  const repo = await getRepository();
  const updated = await repo.updateService(id, {
    name,
    defaultCostArs: cents,
  });
  if (!updated) {
    return { ok: false, error: "No se encontró el servicio." };
  }
  revalidatePath("/owner");
  revalidatePath("/");
  return { ok: true, message: "Servicio actualizado." };
}

/** Owner-only: deletes a catalog service. */
export async function deleteService(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const id = (formData.get("id") as string | null) ?? "";
  if (!id) {
    return { ok: false, error: "Falta el id del servicio." };
  }
  const repo = await getRepository();
  const deleted = await repo.deleteService(id);
  if (!deleted) {
    return {
      ok: false,
      error:
        "No se puede eliminar: el servicio tiene tareas asignadas. Reasigná o eliminá esas tareas primero.",
    };
  }
  revalidatePath("/owner");
  revalidatePath("/");
  return { ok: true, message: "Servicio eliminado." };
}

/**
 * Stores a browser Web Push subscription for this device. Safe for any caller
 * (the portal is shared-link). Expects a JSON body:
 * `{ "endpoint": string, "p256dh": string, "auth": string }`.
 */
export async function subscribePush(formData: FormData): Promise<ActionResult> {
  const raw = (formData.get("subscription") as string | null) ?? "";
  let parsed: { endpoint?: unknown; p256dh?: unknown; auth?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Suscripción inválida." };
  }
  const { endpoint, p256dh, auth } = parsed;
  if (
    typeof endpoint !== "string" ||
    !endpoint ||
    typeof p256dh !== "string" ||
    !p256dh ||
    typeof auth !== "string" ||
    !auth
  ) {
    return { ok: false, error: "Suscripción inválida." };
  }
  const repo = await getRepository();
  await repo.addPushSubscription({ endpoint, p256dh, auth });
  return { ok: true, message: "Notificaciones activadas." };
}

/**
 * Removes a stored Web Push subscription by endpoint.
 * Safe for any caller. Expects a JSON body: `{ "endpoint": string }`.
 */
export async function unsubscribePush(formData: FormData): Promise<ActionResult> {
  const raw = (formData.get("subscription") as string | null) ?? "";
  let parsed: { endpoint?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Suscripción inválida." };
  }
  const { endpoint } = parsed;
  if (typeof endpoint !== "string" || !endpoint) {
    return { ok: false, error: "Suscripción inválida." };
  }
  const repo = await getRepository();
  await repo.deletePushSubscriptionByEndpoint(endpoint);
  return { ok: true, message: "Notificaciones desactivadas." };
}
