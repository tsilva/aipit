import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { resolveAppEnv } from "./src/lib/env";

const isProduction = process.env.NODE_ENV === "production";
const appEnv = resolveAppEnv();

function getAllowedConnectSources(): string {
  const connectSources = new Set([
    "'self'",
    "https://openrouter.ai",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://stats.g.doubleclick.net",
  ]);

  for (const dsn of [appEnv.publicSentryDsn, appEnv.sentryDsn]) {
    if (!dsn) {
      continue;
    }

    try {
      connectSources.add(new URL(dsn).origin);
    } catch {
      // Ignore malformed DSNs and keep the rest of the policy intact.
    }
  }

  return Array.from(connectSources).join(" ");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
  `connect-src ${getAllowedConnectSources()}`,
  "frame-src 'self'",
  "worker-src 'self' blob:",
  isProduction ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  experimental: {
    inlineCss: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
