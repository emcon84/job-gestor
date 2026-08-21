"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Forces the current route to re-fetch fresh server data when it mounts and
 * when the page is restored from the back/forward cache (bfcache).
 *
 * Navigating between / and /owner shares the client router cache; a plain mount
 * can serve the stale cached page. bfcache restores the previous DOM snapshot
 * without firing a mount, so we also listen for `pageshow` with `e.persisted`.
 */
export default function RefreshOnMount() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();

    function onPageshow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }

    window.addEventListener("pageshow", onPageshow);
    return () => window.removeEventListener("pageshow", onPageshow);
  }, [router]);

  return null;
}
