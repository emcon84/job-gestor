"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { subscribePush, unsubscribePush } from "@/app/actions";

/**
 * Converts a base64url VAPID public key into a Uint8Array, which the
 * Push API requires for `applicationServerKey`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Floating button that lets the user enable/disable Web Push notifications.
 * Hidden when VAPID is not configured (no public key) or when the browser
 * lacks the needed APIs. Renders fixed bottom-left (the theme toggle is
 * bottom-right).
 */
export default function PushSubscribeButton() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const readState = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setActive(Notification.permission === "granted" && Boolean(sub));
        setSupported(true);
      }
    } catch {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    readState();
  }, [publicKey, readState]);

  if (!publicKey) {
    return null;
  }

  async function toggle() {
    setBusy(true);
    try {
      if (active) {
        // Disable: unsubscribe locally and from the server.
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint ?? "";
        await sub?.unsubscribe();
        if (endpoint) {
          const formData = new FormData();
          formData.append("subscription", JSON.stringify({ endpoint }));
          await unsubscribePush(formData);
        }
        setActive(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });
      const json = sub.toJSON();
      const endpoint = sub.endpoint;
      const p256dh = (json as { keys?: { p256dh?: string } }).keys?.p256dh ?? "";
      const auth = (json as { keys?: { auth?: string } }).keys?.auth ?? "";
      const formData = new FormData();
      formData.append(
        "subscription",
        JSON.stringify({ endpoint, p256dh, auth }),
      );
      await subscribePush(formData);
      setActive(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported || busy}
      aria-label={
        active ? "Desactivar notificaciones" : "Activar notificaciones"
      }
      title={
        active ? "Desactivar notificaciones" : "Activar notificaciones"
      }
      className="fixed bottom-5 left-5 z-50 flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-card-border bg-surface px-3 text-primary shadow-lg transition-colors hover:border-accent disabled:opacity-60"
    >
      <Bell
        aria-hidden="true"
        width="20"
        height="20"
        className={active ? "text-accent" : ""}
      />
      <span className="hidden text-sm sm:inline">
        {active ? "Notificaciones activadas" : "Activar notificaciones"}
      </span>
    </button>
  );
}
