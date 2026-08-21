import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable the client router cache for dynamic routes so navigating between
  // / and /owner after a mutation always re-fetches fresh data instead of
  // serving the stale cached page (reactive UI across routes).
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
};

export default nextConfig;
