"use client";

import {
  hasTelemetryPermission,
  readTelemetryConsent,
  readTelemetryConsentRequirement,
} from "@/lib/telemetry-consent";

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

type AnalyticsValue = string | number;
type AnalyticsParams = Record<string, AnalyticsValue | undefined>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export function analyticsEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    GA_MEASUREMENT_ID.length > 0 &&
    hasTelemetryPermission({
      consent: readTelemetryConsent("analytics"),
      requireConsent: readTelemetryConsentRequirement(),
    }) &&
    typeof window.gtag === "function"
  );
}

function normalizeParams(params: AnalyticsParams): Record<string, AnalyticsValue> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, AnalyticsValue] => entry[1] !== undefined),
  );
}

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (!analyticsEnabled()) {
    return;
  }

  window.gtag?.("event", name, normalizeParams(params));
}
