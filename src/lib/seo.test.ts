import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import { STARTER_BUNDLES } from "@/lib/starter-bundles";
import {
  DEFAULT_SOCIAL_IMAGE_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  buildDefaultMetadata,
  buildHomeStructuredData,
  buildStarterBundleMetadata,
  buildStarterBundleStructuredData,
} from "@/lib/seo";

const starterBundle = STARTER_BUNDLES[0];

describe("seo metadata", () => {
  it("builds default metadata with the homepage canonical", () => {
    const metadata = buildDefaultMetadata();

    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.openGraph?.title).toBe(SITE_TITLE);
    expect(metadata.twitter?.images).toEqual([DEFAULT_SOCIAL_IMAGE_URL]);
  });

  it("builds starter bundle metadata with a query canonical and og image route", () => {
    const metadata = buildStarterBundleMetadata(starterBundle);
    const expectedCanonical = `${SITE_URL}/?id=${starterBundle.id}`;

    expect(metadata.alternates?.canonical).toBe(expectedCanonical);
    expect(metadata.openGraph?.url).toBe(expectedCanonical);
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: expect.stringContaining(`${SITE_URL}/api/og?`),
      }),
    ]);
    expect(metadata.twitter?.images).toEqual([expect.stringContaining(`${SITE_URL}/api/og?`)]);
  });
});

describe("seo structured data", () => {
  it("builds homepage structured data with site and app entities", () => {
    const structuredData = buildHomeStructuredData();

    expect(structuredData).toEqual(
      expect.objectContaining({
        "@context": "https://schema.org",
        "@graph": expect.arrayContaining([
          expect.objectContaining({
            "@type": "WebSite",
            name: "The AI Pit",
            description: SITE_DESCRIPTION,
          }),
          expect.objectContaining({
            "@type": "SoftwareApplication",
            name: "The AI Pit",
          }),
          expect.objectContaining({
            "@type": "WebPage",
            name: SITE_TITLE,
          }),
        ]),
      }),
    );
  });

  it("builds bundle structured data aligned to the bundle-specific page", () => {
    const structuredData = buildStarterBundleStructuredData(starterBundle);

    expect(structuredData).toEqual(
      expect.objectContaining({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${starterBundle.name} | The AI Pit`,
        url: `${SITE_URL}/?id=${starterBundle.id}`,
        primaryImageOfPage: expect.objectContaining({
          url: expect.stringContaining(`${SITE_URL}/api/og?`),
        }),
      }),
    );
    expect(structuredData).not.toHaveProperty("@graph");
  });
});
