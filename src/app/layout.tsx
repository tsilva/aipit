import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { AnalyticsConsentBanner } from "@/components/analytics-consent-banner";
import { GoogleAnalytics } from "@/components/google-analytics";
import { SimulationAcknowledgementGate } from "@/components/simulation-acknowledgement-gate";
import {
  SITE_BACKGROUND_COLOR,
  SITE_THEME_COLOR,
  buildDefaultMetadata,
} from "@/lib/seo";
import "./globals.css";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});
const hasGoogleAnalytics = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim());

export const metadata: Metadata = buildDefaultMetadata();
export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content={SITE_THEME_COLOR} />
        <meta name="msapplication-TileColor" content={SITE_BACKGROUND_COLOR} />
      </head>
      <body className={`${displayFont.variable} ${monoFont.variable} antialiased`}>
        {hasGoogleAnalytics ? (
          <>
            <Suspense fallback={null}>
              <GoogleAnalytics />
            </Suspense>
            <AnalyticsConsentBanner />
          </>
        ) : null}
        <SimulationAcknowledgementGate />
        {children}
      </body>
    </html>
  );
}
