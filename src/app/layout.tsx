import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { SITE_URL } from "@/lib/site";
import {
  SITE_BACKGROUND_COLOR,
  SITE_DESCRIPTION,
  SITE_NAME,
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

export const metadata: Metadata = buildDefaultMetadata();
export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
  colorScheme: "dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      author: {
        "@type": "Person",
        name: "Tiago Silva",
        url: "https://www.tsilva.eu",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "BrowserApplication",
      operatingSystem: "Any",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      applicationSubCategory: "AI Debate Simulator",
      browserRequirements: "Requires JavaScript. Requires a modern browser.",
      image: `${SITE_URL}/social-card.png`,
      author: {
        "@type": "Person",
        name: "Tiago Silva",
        url: "https://www.tsilva.eu",
      },
    },
    {
      "@type": "WebPage",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${SITE_URL}/social-card.png`,
        width: 1200,
        height: 630,
      },
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
      },
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${displayFont.variable} ${monoFont.variable} antialiased`}>
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
