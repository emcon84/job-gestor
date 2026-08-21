"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so Web Push and PWA install work. Only runs in
 * the browser, guarded against environments without service worker support.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("Notification" in window)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures (e.g. unsupported browsers) are non-fatal.
    });
  }, []);

  return null;
}
