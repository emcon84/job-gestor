"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, COOKIE_VALUE, verifyPassphrase } from "@/lib/auth";
import { getUploadUrl, MAX_ATTACHMENT_BYTES, resolveImageType } from "@/lib/r2";
import type {
  Attachment,
  PaymentState,
  Priority,
  ServiceOption,
  TaskStatus,
} from "@/lib/domain";
import { PRIORITIES, STATUSES } from "@/lib/domain";
import { parsePesosToCents } from "@/lib/format";
import { getRepository } from "@/lib/store";
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

  const repo = await getRepository();
  const updated = await repo.updateTask(id, {
    status: statusRaw ? (statusRaw as TaskStatus) : undefined,
    amountArs: amountArs ?? undefined,
    paymentState: paymentRaw ? (paymentRaw as PaymentState) : undefined,
  });

  if (!updated) {
    return { ok: false, error: "No se encontró la tarea." };
  }

  revalidatePath("/owner");
  revalidatePath("/");
  return { ok: true, message: "Tarea actualizada." };
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
