import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { metadata as legalMetadata } from "@/app/legal/page";
import LegalPage from "@/app/legal/page";

describe("legal page metadata", () => {
  it("sets an explicit canonical and noindex policy for legal", () => {
    expect(legalMetadata.alternates?.canonical).toBe("/legal");
    expect(legalMetadata.robots).toEqual(
      expect.objectContaining({
        index: false,
        follow: true,
      }),
    );
  });

  it("documents privacy and terms on the combined legal page", () => {
    const legalMarkup = renderToStaticMarkup(React.createElement(LegalPage));

    expect(legalMarkup).toContain("Terms of use");
    expect(legalMarkup).toContain("Privacy policy");
    expect(legalMarkup).toContain("request removal of a public replay");
    expect(legalMarkup).toContain("copyright, image-rights, privacy");
    expect(legalMarkup).toContain("defamation");
    expect(legalMarkup).toContain("your OpenRouter account");
    expect(legalMarkup).toContain("Privacy preferences");
    expect(legalMarkup).toContain("non-commercial experimental AI");
    expect(legalMarkup).toContain("not directed to children under 13");
    expect(legalMarkup).toContain("AI-generated");
    expect(legalMarkup).toContain("artificially generated or manipulated");
    expect(legalMarkup).toContain("synthetic media");
    expect(legalMarkup).toContain("transit the proxy");
    expect(legalMarkup).toContain("unlisted, not private");
    expect(legalMarkup).toContain("does not grant clearance");
  });
});
