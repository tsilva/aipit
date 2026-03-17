import type { Metadata } from "next";

const payload: Omit<Metadata, "metadataBase"> = {
  title: "aipit | Orchestrated AI Character Debates",
  description:
    "A Next.js platform that runs moderator-led debates between AI characters. Built with OpenRouter, it features automated failover, cost tracking, and shareable replay snapshots.",
  keywords: [
    "nextjs",
    "openrouter",
    "ai-debates",
    "llm-orchestration",
    "prompt-engineering",
    "ai-characters",
    "automated-moderation",
    "typescript",
  ],
  openGraph: {
    title: "aipit | Orchestrated AI Character Debates",
    description:
      "A Next.js platform that runs moderator-led debates between AI characters. Built with OpenRouter, it features automated failover, cost tracking, and shareable replay snapshots.",
    images: [
      {
        url: "/brand/web-seo/og-image-1200x630.png",
        width: 1200,
        height: 630,
        alt: "aipit brand card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "aipit | Orchestrated AI Character Debates",
    description:
      "A Next.js platform that runs moderator-led debates between AI characters. Built with OpenRouter, it features automated failover, cost tracking, and shareable replay snapshots.",
    images: ["/brand/web-seo/og-image-1200x630.png"],
  },
  icons: {
    icon: [
      {
        url: "/brand/web-seo/favicon/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/brand/web-seo/favicon/favicon-48.png",
        sizes: "48x48",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/brand/web-seo/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: ["/brand/web-seo/favicon/favicon.ico"],
  },
  manifest: "/brand/web-seo/site.webmanifest",
};

export function createMetadata(metadataBase: URL): Metadata {
  return {
    metadataBase,
    ...payload,
  };
}

export default createMetadata;
