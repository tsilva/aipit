import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import PrivacyPage from "@/app/privacy/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import TermsPage from "@/app/terms/page";

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

  it("documents public replay removal requests in privacy and terms", () => {
    const privacyMarkup = renderToStaticMarkup(React.createElement(PrivacyPage));
    const termsMarkup = renderToStaticMarkup(React.createElement(TermsPage));

    expect(privacyMarkup).toContain("request removal of a public replay");
    expect(privacyMarkup).toContain("copyright, image-rights, privacy, defamation");
    expect(termsMarkup).toContain("non-commercial experimental parody");
    expect(termsMarkup).toContain("Shared replays may contain fictionalized AI-generated speech");
    expect(termsMarkup).toContain("request removal of a public replay");
  });
});
