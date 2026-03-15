"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import {
  type AnalyticsConsentState,
  hasAnalyticsPermission,
  readAnalyticsConsent,
  readAnalyticsConsentRequirement,
  subscribeToAnalyticsConsent,
} from "@/lib/analytics-consent";
import { GA_MEASUREMENT_ID } from "@/lib/google-analytics";

function subscribeToHydration() {
  return () => {};
}

export function GoogleAnalytics() {
  const hasMounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const consent: AnalyticsConsentState = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    (): AnalyticsConsentState => "unset",
  );

  if (
    !hasMounted ||
    !GA_MEASUREMENT_ID ||
    !hasAnalyticsPermission({ consent, requireConsent: readAnalyticsConsentRequirement() })
  ) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
