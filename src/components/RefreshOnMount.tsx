"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

/**
 * Keeps the current route fresh:
 *  - re-fetches server data on mount and on bfcache restore (back/forward),
 *  - polls every 5s so changes made from ANOTHER device/tab (e.g. the client
 *    submitting a task from their phone while the owner watches /owner)
 *    appear without a manual reload.
 *
 * This is the lightweight equivalent of TanStack Query's refetchInterval for a
 * server-rendered App Router app: router.refresh() re-runs the server
 * components for the current route and swaps in fresh data.
 */
export default function RefreshOnMount() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();

    function onPageshow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    window.addEventListener("pageshow", onPageshow);
    return () => {
      window.removeEventListener("pageshow", onPageshow);
      window.clearInterval(interval);
    };
  }, [router]);

  return null;
}
