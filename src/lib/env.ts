type AppEnv = {
  gaMeasurementId?: string;
  nodeEnv: string;
  publicSentryDsn?: string;
  sentryDsn?: string;
  siteUrl: string;
  vercelEnv?: string;
};

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toHttps(host: string): string {
  return host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
}

export function resolveAppEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const nodeEnv = normalizeOptional(source.NODE_ENV) ?? "development";
  const vercelEnv = normalizeOptional(source.VERCEL_ENV);
  const explicitSiteUrl = normalizeOptional(source.NEXT_PUBLIC_SITE_URL);
  const previewUrl = normalizeOptional(source.VERCEL_URL);
  const productionUrl = normalizeOptional(source.VERCEL_PROJECT_PRODUCTION_URL);
  const fallbackSiteUrl = previewUrl ? toHttps(previewUrl) : productionUrl ? toHttps(productionUrl) : "http://localhost:3000";

  if (!explicitSiteUrl && vercelEnv === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required when VERCEL_ENV=production.");
  }

  return {
    gaMeasurementId: normalizeOptional(source.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    nodeEnv,
    publicSentryDsn: normalizeOptional(source.NEXT_PUBLIC_SENTRY_DSN),
    sentryDsn: normalizeOptional(source.SENTRY_DSN),
    siteUrl: explicitSiteUrl ? toHttps(explicitSiteUrl) : fallbackSiteUrl,
    vercelEnv,
  };
}

export const env = resolveAppEnv();
