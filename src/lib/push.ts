/**
 * Web Push helpers.
 *
 * `buildNotificationPayload` is pure and unit-testable. `sendPushNotifications`
 * reads VAPID env vars and fans a notification out to every stored subscription,
 * degrading gracefully: it never throws to the caller, and it deletes
 * subscriptions the push service reports as gone (404/410).
 *
 * This module is only ever imported from server actions (`src/app/actions.ts`,
 * which is `"use server"`), so it runs on the server by usage. It deliberately
 * does NOT import `server-only` so its pure helpers stay unit-testable.
 */
import webpush from "web-push";
import type { PushSubscription } from "./domain";
import { getRepository } from "./store";

export type PushEventType = "task_created" | "task_status" | "task_comment";

export interface PushEvent {
  type: PushEventType;
  title?: string;
  body?: string;
  url?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
}

/** Whether all VAPID env vars are present so notifications can be sent. */
export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

/**
 * Builds the localized (Spanish) notification copy for each event type.
 * Pure and testable: no I/O.
 */
export function buildNotificationPayload(event: PushEvent): NotificationPayload {
  switch (event.type) {
    case "task_created":
      return {
        title: event.title ?? "Nueva tarea",
        body: event.body ?? "Se cargó una nueva tarea.",
        url: event.url ?? "/owner",
      };
    case "task_status":
      return {
        title: event.title ?? "Estado actualizado",
        body: event.body ?? "Una tarea cambió de estado.",
        url: event.url ?? "/",
      };
    case "task_comment":
      return {
        title: event.title ?? "Nuevo comentario",
        body: event.body ?? "Te dejaron un comentario.",
        url: event.url ?? "/owner",
      };
  }
}

/**
 * Sends a notification to every stored push subscription.
 *
 * Deliberately never throws: on 404/410 (subscription gone) it deletes the row;
 * on any other error it swallows the error and keeps going. When VAPID is not
 * configured it is a no-op.
 */
export async function sendPushNotifications(event: PushEvent): Promise<void> {
  if (!isVapidConfigured()) {
    return;
  }

  const repo = await getRepository();
  let subscriptions: PushSubscription[];
  try {
    subscriptions = await repo.listPushSubscriptions();
  } catch {
    return;
  }
  if (subscriptions.length === 0) {
    return;
  }

  const payload = buildNotificationPayload(event);
  const vapidDetails = {
    subject: process.env.VAPID_SUBJECT!,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };

  for (const sub of subscriptions) {
    const webPushSub: webpush.PushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(webPushSub, JSON.stringify(payload), {
        vapidDetails,
        TTL: 60 * 60 * 24,
      });
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        try {
          await repo.deletePushSubscriptionByEndpoint(sub.endpoint);
        } catch {
          // Ignore deletion errors; the row may already be gone.
        }
      }
      // Other errors (network, rate limit, push service issues) are swallowed.
    }
  }
}
