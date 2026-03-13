"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { readAnalyticsConsent, subscribeToAnalyticsConsent } from "@/lib/analytics-consent";
import { GA_MEASUREMENT_ID } from "@/lib/google-analytics";

export function GoogleAnalytics() {
  const consent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    () => "unset",
  );

  if (!GA_MEASUREMENT_ID || consent !== "granted") {
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
