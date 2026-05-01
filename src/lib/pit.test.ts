import { describe, expect, it, vi } from "vitest";
import { filterParticipantCharacterPresets } from "@/lib/character-presets";
import {
  compactParticipantForSerialization,
  createRandomLineup,
  createRandomStarterInput,
  hydrateParticipantFromPreset,
  listStarterBundles,
} from "@/lib/pit";
import { createCharacterProfile } from "@/lib/character-profile";

describe("unbiased starter selection", () => {
  it("selects random starter topics from the requested audience pool", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const starter = createRandomStarterInput(undefined, "global");
      const firstBundle = listStarterBundles("global")[0];

      expect(starter.bundle.id).toBe(firstBundle?.id);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("excludes Portuguese personalities from non-Portugal random starter lineups", () => {
    const starter = createRandomStarterInput(undefined, "global");
    const lineup = [starter.input.coordinator, ...starter.input.members];

    expect(lineup.every((participant) => participant.characterProfile.nationality !== "Portuguese")).toBe(true);
  });

  it("excludes Portuguese personalities from non-Portugal debater shuffles", () => {
    const lineup = createRandomLineup("global");
    const participants = [lineup.coordinator, ...lineup.members];

    expect(participants.every((participant) => participant.characterProfile.nationality !== "Portuguese")).toBe(true);
  });

  it("allows Portuguese personalities in random lineups for Portugal clients", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const lineup = createRandomLineup("portugal");
      const participants = [lineup.coordinator, ...lineup.members];

      expect(participants.some((participant) => participant.characterProfile.nationality === "Portuguese")).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("rerolls topics within the requested audience pool when excluding the current bundle", () => {
    const bundles = listStarterBundles("global");
    const current = bundles[0];

    expect(current).toBeDefined();

    const starter = createRandomStarterInput(current?.id, "global");

    expect(starter.bundle.id).not.toBe(current?.id);
  });

  it("keeps compatibility with explicitly unrestricted rerolls", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.2);

    try {
      const starter = createRandomStarterInput("portugal-housing-war", "portugal", { ignoreAudience: true });

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
    const accentedPortugalResults = filterParticipantCharacterPresets("louca", "portugal");
    const marioResults = filterParticipantCharacterPresets("amorim", "portugal");
    const miguelResults = filterParticipantCharacterPresets("milhao", "portugal");

    expect(portugalResults.map((preset) => preset.id)).toEqual(["luis-montenegro"]);
    expect(globalResults.map((preset) => preset.id)).toEqual(["joe-rogan"]);
    expect(accentedPortugalResults.map((preset) => preset.id)).toEqual(["francisco-louca"]);
    expect(marioResults.map((preset) => preset.id)).toEqual(["mario-amorim-lopes"]);
    expect(miguelResults.map((preset) => preset.id)).toEqual(["miguel-milhao"]);
  });
});

describe("participant media metadata", () => {
  it("preserves speaking avatar URLs through compact and hydrate flows", () => {
    const participant = {
      id: "member-1",
      name: "Demo Speaker",
      model: "openrouter/demo",
      presetId: "missing-preset",
      avatarUrl: "/avatars/presets/demo.webp",
      speakingAvatarUrl: "/avatars/presets/speaking/demo.mp4",
      characterProfile: createCharacterProfile({
        role: "Demo debater",
        personality: "Focused and sharp",
        perspective: "Cares about media metadata consistency.",
        debateStyle: "Stay concrete and concise.",
      }),
    };

    expect(compactParticipantForSerialization(participant).speakingAvatarUrl).toBe(participant.speakingAvatarUrl);
    expect(hydrateParticipantFromPreset(participant).speakingAvatarUrl).toBe(participant.speakingAvatarUrl);
  });
});
