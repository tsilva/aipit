import { describe, expect, it } from "vitest";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as termsMetadata } from "@/app/terms/page";

describe("legal page metadata", () => {
  it("sets an explicit canonical and noindex policy for privacy", () => {
    expect(privacyMetadata.alternates?.canonical).toBe("/privacy");
    expect(privacyMetadata.robots).toEqual(
      expect.objectContaining({
        index: false,
        follow: true,
      }),
    );
  });

  it("sets an explicit canonical and noindex policy for terms", () => {
    expect(termsMetadata.alternates?.canonical).toBe("/terms");
    expect(termsMetadata.robots).toEqual(
      expect.objectContaining({
        index: false,
        follow: true,
      }),
    );
  });
});
