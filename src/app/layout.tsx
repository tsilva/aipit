import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@/components/google-analytics";
import { SimulationAcknowledgementGate } from "@/components/simulation-acknowledgement-gate";
import { ARENA_AVIF_SRC_SET, ARENA_IMAGE_SIZES } from "@/lib/arena-image";
import {
  SITE_BACKGROUND_COLOR,
  SITE_THEME_COLOR,
  buildDefaultMetadata,
} from "@/lib/seo";
import {
  SIMULATION_ACKNOWLEDGEMENT_KEY,
  SIMULATION_ACKNOWLEDGEMENT_VALUE,
} from "@/lib/simulation-acknowledgement";
import "./globals.css";

const hasGoogleAnalytics = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim());
const simulationAcknowledgementScript = `
try {
  if (localStorage.getItem(${JSON.stringify(SIMULATION_ACKNOWLEDGEMENT_KEY)}) === ${JSON.stringify(SIMULATION_ACKNOWLEDGEMENT_VALUE)}) {
    document.documentElement.dataset.simulationAcknowledged = "true";
    if (location.pathname === "/") {
      const preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "image";
      preload.type = "image/avif";
      preload.imageSrcset = ${JSON.stringify(ARENA_AVIF_SRC_SET)};
      preload.imageSizes = ${JSON.stringify(ARENA_IMAGE_SIZES)};
      preload.fetchPriority = "high";
      document.head.append(preload);
    }
  }
} catch {}
`;

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
        <script dangerouslySetInnerHTML={{ __html: simulationAcknowledgementScript }} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content={SITE_THEME_COLOR} />
        <meta name="msapplication-TileColor" content={SITE_BACKGROUND_COLOR} />
      </head>
      <body className="antialiased">
        {hasGoogleAnalytics ? (
          <>
            <Suspense fallback={null}>
              <GoogleAnalytics />
            </Suspense>
          </>
        ) : null}
        <SimulationAcknowledgementGate />
        <Suspense fallback={null}>{children}</Suspense>
        <Analytics />
      </body>
    </html>
  );
}
