import type { Metadata } from "next";
import { PARTICIPANT_PERSONA_PRESETS } from "@/lib/persona-presets";
import { SITE_URL } from "@/lib/site";
import type { StarterBundleDefinition } from "@/lib/starter-bundles";

export const SITE_NAME = "The AI Pit";
export const SITE_TITLE = "The AI Pit | Watch AI Personas Debate Anything";
export const SITE_DESCRIPTION =
  "Pit AI personas against each other in live, moderator-led debates. Launch hot-button scenarios, remix the roster, and share the chaos.";
export const SITE_THEME_COLOR = "#d87a3b";
export const SITE_BACKGROUND_COLOR = "#0c1118";

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const DEFAULT_SOCIAL_IMAGE_PATH = "/social-card.png";
const personaNameById = new Map(PARTICIPANT_PERSONA_PRESETS.map((preset) => [preset.id, preset.name] as const));

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const candidate = value.slice(0, maxLength - 1).trimEnd();
  const lastSpaceIndex = candidate.lastIndexOf(" ");

  if (lastSpaceIndex >= Math.floor(maxLength * 0.6)) {
    return `${candidate.slice(0, lastSpaceIndex).trimEnd()}…`;
  }

  return `${candidate}…`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function getBundleParticipantNames(bundle: StarterBundleDefinition): string[] {
  return bundle.memberPresetIds
    .map((presetId) => personaNameById.get(presetId))
    .filter((name): name is string => Boolean(name));
}

export function buildOgImageUrl(title: string, subtitle: string): string {
  const params = new URLSearchParams({
    title: truncate(title, 90),
    subtitle: truncate(subtitle, 140),
  });

  return `${SITE_URL}/api/og?${params.toString()}`;
}

export function getBundleUrl(bundleId: string): string {
  return `${SITE_URL}/?id=${encodeURIComponent(bundleId)}`;
}

export function buildBundleDescription(bundle: StarterBundleDefinition): string {
  const names = getBundleParticipantNames(bundle);
  const cast = names.length > 0 ? joinNames(names) : "three AI personas";
  const suffix = ` Debate it with ${cast} in The AI Pit.`;
  const promptMaxLength = Math.max(48, 160 - suffix.length);
  const prompt = truncate(bundle.prompt, promptMaxLength);

  return `${prompt}${suffix}`;
}

function createImageDescriptor(title: string, subtitle: string, alt: string) {
  return {
    url: buildOgImageUrl(title, subtitle),
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt,
  };
}

export function buildDefaultMetadata(): Metadata {
  const image = {
    url: `${SITE_URL}${DEFAULT_SOCIAL_IMAGE_PATH}`,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: "The AI Pit share preview",
  };

  return {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    manifest: "/manifest.webmanifest",
    keywords: [
      "AI debate simulator",
      "AI personas",
      "AI debate",
      "persona debate",
      "LLM debate",
      "OpenRouter",
      "AI roleplay",
      "AI conversation simulator",
      "debate generator",
      "viral debate prompts",
      "AI discourse",
      "interactive AI",
    ],
    authors: [{ name: "Tiago Silva" }],
    creator: "Tiago Silva",
    publisher: "Tiago Silva",
    category: "technology",
    metadataBase: new URL(SITE_URL),
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
        { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
        { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
      shortcut: ["/favicon.ico"],
    },
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      type: "website",
      url: SITE_URL,
      siteName: SITE_NAME,
      locale: "en_US",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      creator: "@tiagosilva",
      images: [image.url],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export function buildStarterBundleMetadata(bundle: StarterBundleDefinition): Metadata {
  const title = `${bundle.name} | The AI Pit`;
  const description = buildBundleDescription(bundle);
  const url = getBundleUrl(bundle.id);
  const image = createImageDescriptor(bundle.name, bundle.prompt, `${bundle.name} debate preview`);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@tiagosilva",
      images: [image.url],
    },
  };
}
