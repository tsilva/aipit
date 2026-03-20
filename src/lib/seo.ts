import type { Metadata } from "next";
import createGeneratedMetadata from "../../web-seo-metadata";
import { PARTICIPANT_CHARACTER_PRESETS } from "@/lib/character-presets";
import { SITE_TWITTER_HANDLE, SITE_URL } from "@/lib/site";
import type { StarterBundleDefinition } from "@/lib/starter-bundles";

export const SITE_NAME = "The AI Pit";
export const SITE_TITLE = "The AI Pit | Make AI Characters Debate Any Topic";
export const SITE_DESCRIPTION =
  "Turn any topic into a moderator-led AI debate. Mix custom characters, run multi-round clashes, and share the replay.";
export const SITE_THEME_COLOR = "#d87a3b";
export const SITE_BACKGROUND_COLOR = "#0c1118";

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const characterNameById = new Map(PARTICIPANT_CHARACTER_PRESETS.map((preset) => [preset.id, preset.name] as const));
const generatedMetadata = createGeneratedMetadata(new URL(SITE_URL));

function normalizeMetadataUrl(value: string | URL): string {
  return value instanceof URL ? value.toString() : value;
}

function getDefaultSocialImage() {
  const images = generatedMetadata.openGraph?.images;
  const firstImage = Array.isArray(images) ? images[0] : images;

  if (!firstImage) {
    return {
      url: "/brand/web-seo/og-image-1200x630.png",
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: "The AI Pit brand card",
    };
  }

  if (typeof firstImage === "string" || firstImage instanceof URL) {
    return {
      url: normalizeMetadataUrl(firstImage),
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: "The AI Pit brand card",
    };
  }

  return {
    url: normalizeMetadataUrl(firstImage.url),
    width: firstImage.width ?? OG_IMAGE_WIDTH,
    height: firstImage.height ?? OG_IMAGE_HEIGHT,
    alt: firstImage.alt ?? "The AI Pit brand card",
  };
}

const DEFAULT_SOCIAL_IMAGE = getDefaultSocialImage();
const DEFAULT_MANIFEST_PATH =
  typeof generatedMetadata.manifest === "string"
    ? generatedMetadata.manifest
    : generatedMetadata.manifest instanceof URL
      ? generatedMetadata.manifest.toString()
      : "/brand/web-seo/site.webmanifest";
const DEFAULT_ICONS = generatedMetadata.icons;

export const DEFAULT_SOCIAL_IMAGE_URL = DEFAULT_SOCIAL_IMAGE.url.startsWith("http")
  ? DEFAULT_SOCIAL_IMAGE.url
  : `${SITE_URL}${DEFAULT_SOCIAL_IMAGE.url}`;

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
    .map((presetId) => characterNameById.get(presetId))
    .filter((name): name is string => Boolean(name));
}

function buildOgImageUrl(title: string, subtitle: string): string {
  const params = new URLSearchParams({
    title: truncate(title, 90),
    subtitle: truncate(subtitle, 140),
  });

  return `${SITE_URL}/api/og?${params.toString()}`;
}

function getBundleUrl(bundleId: string): string {
  return `${SITE_URL}/?id=${encodeURIComponent(bundleId)}`;
}

function buildBundleDescription(bundle: StarterBundleDefinition): string {
  const names = getBundleParticipantNames(bundle);
  const cast = names.length > 0 ? joinNames(names) : "three AI characters";
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
    url: DEFAULT_SOCIAL_IMAGE_URL,
    width: DEFAULT_SOCIAL_IMAGE.width,
    height: DEFAULT_SOCIAL_IMAGE.height,
    alt: DEFAULT_SOCIAL_IMAGE.alt,
  };

  return {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    manifest: DEFAULT_MANIFEST_PATH,
    keywords: [
      "AI debate simulator",
      "AI character debate",
      "AI debate app",
      "AI characters",
      "AI debate",
      "AI debate generator",
      "character debate",
      "LLM debate",
      "moderated AI debate",
      "AI panel simulator",
      "AI versus generator",
      "AI argument simulator",
      "OpenRouter",
      "AI roleplay",
      "AI conversation simulator",
      "debate generator",
      "viral debate prompts",
      "shareable AI debates",
      "AI discourse",
      "interactive AI",
    ],
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "technology",
    metadataBase: new URL(SITE_URL),
    icons: DEFAULT_ICONS,
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
      site: SITE_TWITTER_HANDLE,
      creator: SITE_TWITTER_HANDLE,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
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
      site: SITE_TWITTER_HANDLE,
      creator: SITE_TWITTER_HANDLE,
      title,
      description,
      images: [image.url],
    },
  };
}
