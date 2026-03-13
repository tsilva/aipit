"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";

export function AnalyticsConsentBanner() {
  const consent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    () => "unset",
  );

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
