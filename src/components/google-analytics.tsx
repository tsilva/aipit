"use client";

import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import {
  type TelemetryConsentState,
  hasTelemetryPermission,
  readTelemetryConsent,
  readTelemetryConsentRequirement,
  subscribeToTelemetryConsent,
} from "@/lib/telemetry-consent";
import { GA_MEASUREMENT_ID } from "@/lib/google-analytics";

function subscribeToHydration() {
  return () => {};
}

export function GoogleAnalytics() {
  const hasMounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const consent: TelemetryConsentState = useSyncExternalStore(
    subscribeToTelemetryConsent,
    () => readTelemetryConsent("analytics"),
    (): TelemetryConsentState => "unset",
  );
  const hasPermission = hasTelemetryPermission({
    consent,
    requireConsent: readTelemetryConsentRequirement(),
  });

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window === "undefined") {
      return;
    }

    window[`ga-disable-${GA_MEASUREMENT_ID}`] = !hasPermission;
  }, [hasPermission]);

  if (
    !hasMounted ||
    !GA_MEASUREMENT_ID ||
    !hasPermission
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
