import { describe, expect, it } from "vitest";
import {
  detectAudience,
  resolveInitialAudience,
} from "@/lib/audience";

describe("audience helpers", () => {
  it("defaults Portuguese locales to the Portugal audience", () => {
    expect(detectAudience({ acceptLanguage: "pt-PT,pt;q=0.9,en;q=0.8" })).toBe("portugal");
    expect(detectAudience({ acceptLanguage: "pt-BR" })).toBe("portugal");
  });

  it("defaults Portuguese geolocation to the Portugal audience", () => {
    expect(detectAudience({ acceptLanguage: "en-US,en;q=0.9", countryCode: "PT" })).toBe("portugal");
  });

  it("does not switch non-Portuguese country codes into the Portugal audience", () => {
    expect(detectAudience({ acceptLanguage: "en-US,en;q=0.9", countryCode: "US" })).toBe("global");
  });

  it("defaults non-Portuguese or missing signals to the global audience", () => {
    expect(detectAudience({ acceptLanguage: "en-US,en;q=0.9" })).toBe("global");
    expect(detectAudience({})).toBe("global");
  });

  it("prefers the explicit starter bundle audience over locale", () => {
    expect(
      resolveInitialAudience({
        acceptLanguage: "en-US,en;q=0.9",
        countryCode: "PT",
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
