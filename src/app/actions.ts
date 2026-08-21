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
  TaskStatus,
} from "@/lib/domain";
import {
  PRIORITIES,
  STATUSES,
  STATUS_LABELS,
  canClientMove,
  isValidSlug,
  parseDueDate,
  slugify,
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

/**
 * Revalidates every route that can display this client's data: the public
 * portal (`/c/{slug}`), the owner panel (`/owner/{slug}`), and the index pages
 * (`/` client list, `/owner` owner list). Unknown/missing slugs degrade to a
 * broad revalidate so no stale route survives a failed lookup.
 */
function revalidateClient(slug?: string | null): void {
  if (slug) {
    revalidatePath(`/c/${slug}`);
    revalidatePath(`/owner/${slug}`);
    revalidatePath("/");
    revalidatePath("/owner");
  } else {
    revalidatePath("/", "layout");
  }
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
 * Creates a task for a specific client (the portal page passes its own
 * `clientId`). Client submits title/description/area/priority, an optional
 * catalog `serviceId` (null = unclassified, the owner classifies later), plus a
 * JSON array of already-uploaded attachment records (name, url, contentType,
 * sizeBytes). The task amount is auto-filled from the service default when one
 * is assigned (server-resolved, authoritative); the owner may edit it later.
 */
export async function createTask(formData: FormData): Promise<ActionResult> {
  const clientId = (formData.get("clientId") as string | null)?.trim() ?? "";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const area = (formData.get("area") as string | null)?.trim() ?? "";
  const priority = (formData.get("priority") as string | null) ?? "medium";
  const serviceId =
    (formData.get("serviceId") as string | null)?.trim() || null;
  const attachmentsRaw = (formData.get("attachments") as string | null) ?? "[]";

  if (!clientId) {
    return { ok: false, error: "Falta el cliente." };
  }
  if (!title) {
    return { ok: false, error: "El título es obligatorio." };
  }
  if (!description) {
    return { ok: false, error: "La descripción es obligatoria." };
  }
  if (!area) {
    return { ok: false, error: "El área o sistema es obligatorio." };
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
  // The task must belong to a real client (portal passes its own id).
  const client = await repo.getClient(clientId);
  if (!client) {
    return { ok: false, error: "El cliente no existe." };
  }
  // When a service was chosen, it must exist in the catalog (server-resolved,
  // authoritative). Unclassified tasks (null) skip this check.
  if (serviceId && (await repo.resolveServiceCost(serviceId)) === null) {
    return { ok: false, error: "El servicio seleccionado no existe." };
  }
  await repo.createTask({
    title,
    description,
    area,
    priority: validPriority,
    serviceId,
    clientId,
    attachments,
  });

  await sendPushNotifications({ type: "task_created", body: title });

  revalidateClient(client.slug);
  return { ok: true, message: "Tarea enviada correctamente." };
}

/** Unlocks the owner session with the passphrase. Issues an httpOnly cookie on
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
    // Session cookie (no maxAge): expires when the browser closes, so the
    // owner is asked for the passphrase again on the next visit.
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
  const serviceRaw = formData.get("serviceId") as string | null;

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

  // Optional service classification: empty string -> null (unclassified);
  // otherwise must be a valid catalog service.
  let serviceId: string | null | undefined;
  if (serviceRaw !== null && serviceRaw !== undefined && serviceRaw.trim() !== "") {
    serviceId = serviceRaw.trim();
    if ((await repo.resolveServiceCost(serviceId)) === null) {
      return { ok: false, error: "Servicio inválido." };
    }
  } else if (serviceRaw !== null && serviceRaw !== undefined) {
    serviceId = null;
  }

  const updated = await repo.updateTask(id, {
    status: statusRaw ? (statusRaw as TaskStatus) : undefined,
    amountArs: amountArs ?? undefined,
    paymentState: paymentRaw ? (paymentRaw as PaymentState) : undefined,
    paymentDueDate,
    serviceId,
  });

  if (!updated) {
    return { ok: false, error: "No se encontró la tarea." };
  }

  await sendPushNotifications({
    type: "task_status",
    body: `${updated.title}: ${STATUS_LABELS[updated.status]}`,
  });

  const client = await repo.getClient(updated.clientId);
  revalidateClient(client?.slug);
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
    const client = await repo.getClient(task.clientId);
    revalidateClient(client?.slug);
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
  const client = await repo.getClient(task.clientId);
  revalidateClient(client?.slug);
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

  const task = await repo.getTask(taskId);
  const client = task ? await repo.getClient(task.clientId) : null;
  await sendPushNotifications({ type: "task_comment", body });
  revalidateClient(client?.slug);
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
  const task = await repo.getTask(id);
  await repo.deleteTask(id);
  const client = task ? await repo.getClient(task.clientId) : null;
  revalidateClient(client?.slug);
  return { ok: true, message: "Tarea eliminada." };
}

/** Sample n8n-automation services (name + default cost in cents) for quick catalog seeding. */
const SAMPLE_N8N_SERVICES: { name: string; cents: number }[] = [
  { name: "Automatización lectura de mails + asignación de cuentas", cents: 25_000_00 },
  { name: "Integración Formulario → Planilla (Google Forms → Sheets)", cents: 20_000_00 },
  { name: "Avisos automáticos por vencimiento (WhatsApp/Email)", cents: 20_000_00 },
  { name: "Conciliación bancaria automática", cents: 35_000_00 },
  { name: "Integración con sistema contable (AFIP / Tango / CMD)", cents: 35_000_00 },
  { name: "Reporte automático programado", cents: 20_000_00 },
  { name: "Envío automático de documentación (comprobantes/resúmenes)", cents: 25_000_00 },
  { name: "Nueva automatización a medida (cotización base)", cents: 30_000_00 },
  { name: "Mantenimiento y ajuste de flujos existentes", cents: 15_000_00 },
  { name: "Configuración y soporte de workflows", cents: 15_000_00 },
];

/** Owner-only: seeds the sample n8n services for a client (skips existing names). */
export async function seedSampleServices(
  formData: FormData,
): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const clientId = (formData.get("clientId") as string | null)?.trim() ?? "";
  if (!clientId) {
    return { ok: false, error: "Falta el cliente." };
  }
  const repo = await getRepository();
  const client = await repo.getClient(clientId);
  if (!client) {
    return { ok: false, error: "El cliente no existe." };
  }
  const existing = await repo.listServicesByClient(clientId);
  const existingNames = new Set(existing.map((s) => s.name));
  let added = 0;
  for (const s of SAMPLE_N8N_SERVICES) {
    if (existingNames.has(s.name)) {
      continue;
    }
    await repo.createService({ name: s.name, defaultCostArs: s.cents, clientId });
    added += 1;
  }
  revalidateClient(client.slug);
  return added > 0
    ? { ok: true, message: `Servicios de ejemplo cargados (${added}).` }
    : { ok: true, message: "Los servicios de ejemplo ya estaban cargados." };
}

/** Owner-only: creates a catalog service for a client with a fixed default cost (pesos -> cents). */
export async function createService(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const clientId = (formData.get("clientId") as string | null)?.trim() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const costRaw = (formData.get("defaultCostArs") as string | null) ?? "";
  if (!clientId) {
    return { ok: false, error: "Falta el cliente." };
  }
  if (!name) {
    return { ok: false, error: "El nombre del servicio es obligatorio." };
  }
  const cents = parsePesosToCents(costRaw);
  if (cents === null) {
    return { ok: false, error: "Costo inválido." };
  }
  const repo = await getRepository();
  const client = await repo.getClient(clientId);
  if (!client) {
    return { ok: false, error: "El cliente no existe." };
  }
  await repo.createService({ name, defaultCostArs: cents, clientId });
  revalidateClient(client.slug);
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
  const client = await repo.getClient(updated.clientId);
  revalidateClient(client?.slug);
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
  revalidatePath("/owner", "layout");
  return { ok: true, message: "Servicio eliminado." };
}

/**
 * Owner-only: creates a client. The slug defaults from the name via `slugify`
 * but can be overridden by the owner. The pack threshold is parsed from pesos.
 */
export async function createClient(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (formData.get("slug") as string | null)?.trim() ?? "";
  const thresholdRaw = (formData.get("packThresholdArs") as string | null) ?? "";

  if (!name) {
    return { ok: false, error: "El nombre del cliente es obligatorio." };
  }
  const slug = slugRaw || slugify(name);
  if (!slug) {
    return { ok: false, error: "El slug del cliente es inválido." };
  }
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error:
        "El slug solo puede contener minúsculas, números y guiones simples (ej: mi-cliente).",
    };
  }
  const cents = parsePesosToCents(thresholdRaw);
  if (cents === null) {
    return { ok: false, error: "Monto de abono inválido." };
  }

  const repo = await getRepository();
  const existing = await repo.getClientBySlug(slug);
  if (existing) {
    return { ok: false, error: "Ya existe un cliente con ese slug." };
  }
  await repo.createClient({ name, slug, packThresholdCents: cents });
  revalidatePath("/");
  revalidatePath("/owner");
  return { ok: true, message: "Cliente creado." };
}

/** Owner-only: updates a client's name / slug / pack threshold. */
export async function updateClient(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const id = (formData.get("id") as string | null) ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (formData.get("slug") as string | null)?.trim() ?? "";
  const thresholdRaw = (formData.get("packThresholdArs") as string | null) ?? "";

  if (!id) {
    return { ok: false, error: "Falta el id del cliente." };
  }
  if (!name) {
    return { ok: false, error: "El nombre del cliente es obligatorio." };
  }
  const slug = slugRaw || slugify(name);
  if (!slug) {
    return { ok: false, error: "El slug del cliente es inválido." };
  }
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error:
        "El slug solo puede contener minúsculas, números y guiones simples (ej: mi-cliente).",
    };
  }
  const cents = parsePesosToCents(thresholdRaw);
  if (cents === null) {
    return { ok: false, error: "Monto de abono inválido." };
  }

  const repo = await getRepository();
  const current = await repo.getClient(id);
  if (!current) {
    return { ok: false, error: "No se encontró el cliente." };
  }
  if (slug !== current.slug) {
    const existing = await repo.getClientBySlug(slug);
    if (existing && existing.id !== id) {
      return { ok: false, error: "Ya existe un cliente con ese slug." };
    }
  }
  const updated = await repo.updateClient(id, {
    name,
    slug,
    packThresholdCents: cents,
  });
  if (!updated) {
    return { ok: false, error: "No se encontró el cliente." };
  }
  revalidateClient(updated.slug);
  return { ok: true, message: "Cliente actualizado." };
}

/** Owner-only: deletes a client. Refused while it still has tasks or services. */
export async function deleteClient(formData: FormData): Promise<ActionResult> {
  if (!(await isOwner())) {
    return { ok: false, error: "No autorizado." };
  }
  const id = (formData.get("id") as string | null) ?? "";
  if (!id) {
    return { ok: false, error: "Falta el id del cliente." };
  }
  const repo = await getRepository();
  const deleted = await repo.deleteClient(id);
  if (!deleted) {
    return {
      ok: false,
      error:
        "No se puede eliminar: el cliente tiene tareas o servicios. Eliminá o reasigná todo primero.",
    };
  }
  revalidatePath("/");
  revalidatePath("/owner");
  return { ok: true, message: "Cliente eliminado." };
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
