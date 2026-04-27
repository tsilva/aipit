"use client";

import {
  type TelemetryConsentState,
  hasTelemetryPermission,
  readTelemetryConsent,
  readTelemetryConsentRequirement,
  requiresTelemetryConsent,
  subscribeToTelemetryConsent,
  writeTelemetryConsent,
} from "@/lib/telemetry-consent";

export type AnalyticsConsentState = TelemetryConsentState;

export const requiresAnalyticsConsent = requiresTelemetryConsent;
export const hasAnalyticsPermission = hasTelemetryPermission;

export function readAnalyticsConsent(): AnalyticsConsentState {
  return readTelemetryConsent("analytics");
}

export function writeAnalyticsConsent(value: Exclude<AnalyticsConsentState, "unset">): void {
  writeTelemetryConsent("analytics", value);
}

export const readAnalyticsConsentRequirement = readTelemetryConsentRequirement;
export const subscribeToAnalyticsConsent = subscribeToTelemetryConsent;
