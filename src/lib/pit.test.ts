import { describe, expect, it, vi } from "vitest";
import { filterParticipantCharacterPresets } from "@/lib/character-presets";
import {
  createRandomStarterInput,
  listStarterBundles,
} from "@/lib/pit";

describe("audience-aware starter selection", () => {
  it("keeps random global starters inside the global bundle pool", () => {
    const starter = createRandomStarterInput(undefined, "global");

    expect(starter.bundle.audience).toBe("global");
  });

  it("rerolls within the same audience pool when excluding the current bundle", () => {
    const globalBundles = listStarterBundles("global");
    const current = globalBundles[0];

    expect(current).toBeDefined();

    const starter = createRandomStarterInput(current?.id, "global");

    expect(starter.bundle.audience).toBe("global");
    expect(starter.bundle.id).not.toBe(current?.id);
  });

  it("can reroll across all audiences when explicitly unrestricted", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.2);

    try {
      const starter = createRandomStarterInput("portugal-housing-war", "portugal", { ignoreAudience: true });

      expect(starter.bundle.audience).toBe("global");
      expect(starter.bundle.id).not.toBe("portugal-housing-war");
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("audience-aware preset filtering", () => {
  it("scopes the preset picker to the selected audience", () => {
    const portugalPresets = filterParticipantCharacterPresets("", "portugal");
    const globalPresets = filterParticipantCharacterPresets("", "global");

    expect(portugalPresets.every((preset) => preset.audience === "portugal")).toBe(true);
    expect(globalPresets.every((preset) => preset.audience === "global")).toBe(true);
    expect(portugalPresets.some((preset) => preset.name === "Luís Montenegro")).toBe(true);
    expect(globalPresets.some((preset) => preset.name === "Joe Rogan")).toBe(true);
  });

  it("still supports search within the chosen audience", () => {
    const portugalResults = filterParticipantCharacterPresets("montenegro", "portugal");
    const globalResults = filterParticipantCharacterPresets("rogan", "global");

    expect(portugalResults.map((preset) => preset.id)).toEqual(["luis-montenegro"]);
    expect(globalResults.map((preset) => preset.id)).toEqual(["joe-rogan"]);
  });
});
