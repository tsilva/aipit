"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  type TelemetryConsentState,
  type TelemetryPurpose,
  readTelemetryConsent,
  readTelemetryConsentRequirement,
  subscribeToTelemetryConsent,
  writeTelemetryConsentForPurposes,
} from "@/lib/telemetry-consent";
import { GA_MEASUREMENT_ID } from "@/lib/google-analytics";

const SENTRY_CLIENT_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";

function subscribeToHydration() {
  return () => {};
}

export function AnalyticsConsentBanner() {
  const hasMounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const analyticsConsent: TelemetryConsentState = useSyncExternalStore(
    subscribeToTelemetryConsent,
    () => readTelemetryConsent("analytics"),
    (): TelemetryConsentState => "unset",
  );
  const errorReportingConsent: TelemetryConsentState = useSyncExternalStore(
    subscribeToTelemetryConsent,
    () => readTelemetryConsent("errorReporting"),
    (): TelemetryConsentState => "unset",
  );
  const configuredPurposes: TelemetryPurpose[] = [
    ...(GA_MEASUREMENT_ID ? (["analytics"] as const) : []),
    ...(SENTRY_CLIENT_DSN ? (["errorReporting"] as const) : []),
  ];

  if (!hasMounted || configuredPurposes.length === 0) {
    return null;
  }

  if (!readTelemetryConsentRequirement()) {
    return null;
  }

  if (
    (configuredPurposes.includes("analytics") ? analyticsConsent !== "unset" : true) &&
    (configuredPurposes.includes("errorReporting") ? errorReportingConsent !== "unset" : true)
  ) {
    return null;
  }

  return (
    <aside className="consent-banner" role="dialog" aria-live="polite" aria-label="Telemetry consent">
      <div className="consent-banner-copy">
        <strong>Privacy preferences</strong>
        <p>
          aipit uses Google Analytics and app-level Sentry reporting only after consent in your region. Read the{" "}
          <Link href="/legal#privacy">privacy policy</Link>.
        </p>
      </div>
      <div className="consent-banner-actions">
        <button
          type="button"
          className="action-button"
          onClick={() => writeTelemetryConsentForPurposes(configuredPurposes, "denied")}
        >
          Decline
        </button>
        <button
          type="button"
          className="action-button action-button-primary"
          onClick={() => writeTelemetryConsentForPurposes(configuredPurposes, "granted")}
        >
          Accept
        </button>
      </div>
    </aside>
  );
}
