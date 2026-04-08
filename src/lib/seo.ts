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
export const DEFAULT_SOCIAL_IMAGE_ALT =
  "Preview card for The AI Pit, showing a moderator-led AI debate experience.";

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const characterNameById = new Map(PARTICIPANT_CHARACTER_PRESETS.map((preset) => [preset.id, preset.name] as const));
const generatedMetadata = createGeneratedMetadata(new URL(SITE_URL));
type RoutePath = `/${string}`;
type StructuredData = Record<string, unknown>;
type StaticPageMetadataOptions = {
  title: string;
  description: string;
  path: RoutePath;
  index?: boolean;
  follow?: boolean;
};

function normalizeMetadataUrl(value: string | URL): string {
  return value instanceof URL ? value.toString() : value;
}

function normalizeImageDimension(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function getDefaultSocialImage() {
  const images = generatedMetadata.openGraph?.images;
  const firstImage = Array.isArray(images) ? images[0] : images;

  if (!firstImage) {
    return {
      url: "/brand/web-seo/og-image-1200x630.png",
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: DEFAULT_SOCIAL_IMAGE_ALT,
    };
  }

  if (typeof firstImage === "string" || firstImage instanceof URL) {
    return {
      url: normalizeMetadataUrl(firstImage),
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: DEFAULT_SOCIAL_IMAGE_ALT,
    };
  }

  return {
    url: normalizeMetadataUrl(firstImage.url),
    width: normalizeImageDimension(firstImage.width, OG_IMAGE_WIDTH),
    height: normalizeImageDimension(firstImage.height, OG_IMAGE_HEIGHT),
    alt: DEFAULT_SOCIAL_IMAGE_ALT,
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

function buildAbsoluteUrl(path: RoutePath): string {
  return new URL(path, SITE_URL).toString();
}

function getBundleUrl(bundleId: string): string {
  return `${SITE_URL}/?id=${encodeURIComponent(bundleId)}`;
}

function getBundlePath(bundleId: string): RoutePath {
  return `/?id=${encodeURIComponent(bundleId)}`;
}

function getBundleTitle(bundle: StarterBundleDefinition): string {
  return `${bundle.name} | The AI Pit`;
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

function createPrimaryImageOfPage(image: { url: string; width: number; height: number; alt: string }) {
  return {
    "@type": "ImageObject",
    url: image.url,
    width: image.width,
    height: image.height,
    description: image.alt,
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

export function buildStaticPageMetadata({
  title,
  description,
  path,
  index = true,
  follow = true,
}: StaticPageMetadataOptions): Metadata {
  const url = buildAbsoluteUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE_URL,
          width: DEFAULT_SOCIAL_IMAGE.width,
          height: DEFAULT_SOCIAL_IMAGE.height,
          alt: DEFAULT_SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: SITE_TWITTER_HANDLE,
      creator: SITE_TWITTER_HANDLE,
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE_URL],
    },
    robots: {
      index,
      follow,
      googleBot: {
        index,
        follow,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export function buildStarterBundleMetadata(bundle: StarterBundleDefinition): Metadata {
  const title = getBundleTitle(bundle);
  const description = buildBundleDescription(bundle);
  const url = getBundleUrl(bundle.id);
  const image = createImageDescriptor(
    bundle.name,
    bundle.prompt,
    `Preview card for the ${bundle.name} debate bundle in The AI Pit.`,
  );

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

export function buildHomeStructuredData(): StructuredData {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: "BrowserApplication",
        applicationSubCategory: "AI Debate Simulator",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript. Requires a modern browser.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        isAccessibleForFree: true,
        image: DEFAULT_SOCIAL_IMAGE_URL,
        featureList: [
          "Moderator-led AI debates",
          "Character presets and custom rosters",
          "OpenRouter model support",
          "Transcript playback and export",
        ],
      },
      {
        "@type": "WebPage",
        name: SITE_TITLE,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        primaryImageOfPage: createPrimaryImageOfPage({
          url: DEFAULT_SOCIAL_IMAGE_URL,
          width: DEFAULT_SOCIAL_IMAGE.width,
          height: DEFAULT_SOCIAL_IMAGE.height,
          alt: DEFAULT_SOCIAL_IMAGE_ALT,
        }),
        isPartOf: {
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
        },
      },
    ],
  };
}

export function buildStarterBundleStructuredData(bundle: StarterBundleDefinition): StructuredData {
  const title = getBundleTitle(bundle);
  const description = buildBundleDescription(bundle);
  const url = getBundleUrl(bundle.id);
  const image = createImageDescriptor(
    bundle.name,
    bundle.prompt,
    `Preview card for the ${bundle.name} debate bundle in The AI Pit.`,
  );

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url,
    description,
    primaryImageOfPage: createPrimaryImageOfPage(image),
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntity: {
      "@type": "CreativeWork",
      name: bundle.name,
      url,
      description,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: SITE_NAME,
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: bundle.name,
          item: buildAbsoluteUrl(getBundlePath(bundle.id)),
        },
      ],
    },
  };
}
