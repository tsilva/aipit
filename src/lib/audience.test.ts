import { describe, expect, it } from "vitest";
import {
  detectAudienceFromAcceptLanguage,
  resolveInitialAudience,
} from "@/lib/audience";

describe("audience helpers", () => {
  it("defaults Portuguese locales to the Portugal audience", () => {
    expect(detectAudienceFromAcceptLanguage("pt-PT,pt;q=0.9,en;q=0.8")).toBe("portugal");
    expect(detectAudienceFromAcceptLanguage("pt-BR")).toBe("portugal");
  });

  it("defaults non-Portuguese or missing locales to the global audience", () => {
    expect(detectAudienceFromAcceptLanguage("en-US,en;q=0.9")).toBe("global");
    expect(detectAudienceFromAcceptLanguage(undefined)).toBe("global");
  });

  it("prefers the explicit starter bundle audience over locale", () => {
    expect(
      resolveInitialAudience({
        acceptLanguage: "en-US,en;q=0.9",
        starterBundleAudience: "portugal",
      }),
    ).toBe("portugal");

    expect(
      resolveInitialAudience({
        acceptLanguage: "pt-PT,pt;q=0.9",
        starterBundleAudience: "global",
      }),
    ).toBe("global");
  });
});
