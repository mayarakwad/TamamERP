import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Every page depends on who is signed in (language, theme, role), so pages
  // block on the session by design and show their loading.tsx skeleton.
  // Only validate instant navigation where a segment opts in explicitly.
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
  },
  // Native modules stay on the server and are not bundled.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2", "sharp", "playwright-core", "exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
