import type { Metadata } from "next";

const payload: Omit<Metadata, "metadataBase"> = {
  "title": "The AI Pit | Next.js AI Debate Simulator",
  "description": "A Next.js-based AI debate simulator using OpenRouter to orchestrate structured, moderator-led discussions between customizable AI characters on any topic.",
  "keywords": [
    "next.js",
    "openrouter",
    "ai-debate",
    "llm-orchestration",
    "react",
    "typescript",
    "ai-simulator",
    "streaming-responses",
    "ai-agents"
  ],
  "openGraph": {
    "title": "The AI Pit | Next.js AI Debate Simulator",
    "description": "A Next.js-based AI debate simulator using OpenRouter to orchestrate structured, moderator-led discussions between customizable AI characters on any topic.",
    "images": [
      {
        "url": "/brand/web-seo/og-image-1200x630.png",
        "width": 1200,
        "height": 630,
        "alt": "The AI Pit brand card"
      }
    ]
  },
  "twitter": {
    "card": "summary_large_image",
    "title": "The AI Pit | Next.js AI Debate Simulator",
    "description": "A Next.js-based AI debate simulator using OpenRouter to orchestrate structured, moderator-led discussions between customizable AI characters on any topic.",
    "images": [
      "/brand/web-seo/og-image-1200x630.png"
    ]
  },
  "icons": {
    "icon": [
      {
        "url": "/brand/web-seo/favicon/favicon-32.png",
        "sizes": "32x32",
        "type": "image/png"
      },
      {
        "url": "/brand/web-seo/favicon/favicon-48.png",
        "sizes": "48x48",
        "type": "image/png"
      }
    ],
    "apple": [
      {
        "url": "/brand/web-seo/apple-touch-icon.png",
        "sizes": "180x180",
        "type": "image/png"
      }
    ],
    "shortcut": [
      "/brand/web-seo/favicon/favicon.ico"
    ]
  },
  "manifest": "/brand/web-seo/site.webmanifest"
};

export function createMetadata(metadataBase: URL): Metadata {
  return {
    metadataBase,
    ...payload,
  };
}

export default createMetadata;
