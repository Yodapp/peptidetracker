import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function appVersion() {
  const fromEnv = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv;
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev"; } catch { return "dev"; }
}

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Versions the service worker and lets open apps notice a new deploy.
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
      ],
    }];
  },
};

export default nextConfig;
