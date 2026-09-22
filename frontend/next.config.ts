import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone: server.js plus ONLY the node_modules files the
  // app actually imports, traced from the build. This is what lets the
  // Dockerfile ship a runtime image without node_modules or source in it.
  // Changing or removing this will silently re-bloat the image, because
  // the Dockerfile's runtime stage copies .next/standalone and nothing else.
  output: "standalone",
};

export default nextConfig;
