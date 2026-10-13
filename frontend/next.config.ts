import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone: server.js plus ONLY the node_modules files the
  // app actually imports, traced from the build. This is what lets the
  // Dockerfile ship a runtime image without node_modules or source in it.
  // Changing or removing this will silently re-bloat the image, because
  // the Dockerfile's runtime stage copies .next/standalone and nothing else.
  output: "standalone",

  // Plan-phone Phase 5: the service worker scripts must never be served
  // stale (41.14 rule 11 relies on the browser re-checking them). Each
  // registration is already bypassed by updateViaCache "none"
  // (lib/service-worker.ts), but a CDN or the phone's own HTTP cache sits
  // in front of that; no-cache forces a revalidation on every fetch.
  // sw-push.js does not exist yet (Phase 6), but a header rule for a
  // route that 404s is harmless.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        source: "/sw-push.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
