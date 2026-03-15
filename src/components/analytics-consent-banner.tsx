"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  type AnalyticsConsentState,
  hasAnalyticsPermission,
  readAnalyticsConsentRequirement,
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";
import { GA_MEASUREMENT_ID } from "@/lib/google-analytics";

function subscribeToHydration() {
  return () => {};
}

export function AnalyticsConsentBanner() {
  const hasMounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const consent: AnalyticsConsentState = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    (): AnalyticsConsentState => "unset",
  );

  if (!hasMounted || !GA_MEASUREMENT_ID) {
    return null;
  }

  if (hasAnalyticsPermission({ consent, requireConsent: readAnalyticsConsentRequirement() })) {
    return null;
  }

  if (consent !== "unset") {
    return null;
  }

  return (
    <aside className="consent-banner" role="dialog" aria-live="polite" aria-label="Analytics consent">
      <div className="consent-banner-copy">
        <strong>Analytics consent</strong>
        <p>
          aipit uses Google Analytics only after consent to understand usage and failures. Read the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </div>
      <div className="consent-banner-actions">
        <button type="button" className="action-button" onClick={() => writeAnalyticsConsent("denied")}>
          Decline
        </button>
        <button
          type="button"
          className="action-button action-button-primary"
          onClick={() => writeAnalyticsConsent("granted")}
        >
          Accept
        </button>
      </div>
    </aside>
  );
}
