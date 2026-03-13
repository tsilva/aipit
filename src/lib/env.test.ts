import { describe, expect, it } from "vitest";
import { resolveAppEnv } from "@/lib/env";

describe("resolveAppEnv", () => {
  it("uses NEXT_PUBLIC_SITE_URL when configured", () => {
    const resolved = resolveAppEnv({
      NEXT_PUBLIC_SITE_URL: "https://aipit.example",
    });

    expect(resolved.siteUrl).toBe("https://aipit.example");
  });

  it("falls back to Vercel preview URL outside production", () => {
    const resolved = resolveAppEnv({
      VERCEL_ENV: "preview",
      VERCEL_URL: "preview-aipit.vercel.app",
    });

    expect(resolved.siteUrl).toBe("https://preview-aipit.vercel.app");
  });

  it("requires NEXT_PUBLIC_SITE_URL in Vercel production", () => {
    expect(() =>
      resolveAppEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toThrow(
      "NEXT_PUBLIC_SITE_URL is required when VERCEL_ENV=production and no Vercel canonical URL env is available.",
    );
  });

  it("accepts Vercel production when a platform canonical URL is available", () => {
    const resolved = resolveAppEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "aipit.vercel.app",
    });

    expect(resolved.siteUrl).toBe("https://aipit.vercel.app");
  });
});
