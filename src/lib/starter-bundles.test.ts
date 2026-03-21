import { describe, expect, it } from "vitest";
import { PARTICIPANT_CHARACTER_PRESETS } from "@/lib/character-presets";
import {
  STARTER_BUNDLES,
  US_COORDINATOR_PRESET_ID,
} from "@/lib/starter-bundles";

describe("starter bundle participant coverage", () => {
  it("includes every built-in participant preset in at least one starter debate", () => {
    const coveredPresetIds = new Set(STARTER_BUNDLES.flatMap((bundle) => bundle.memberPresetIds));
    const missingPresetIds = PARTICIPANT_CHARACTER_PRESETS.map((preset) => preset.id).filter(
      (presetId) => !coveredPresetIds.has(presetId),
    );

    expect(missingPresetIds).toEqual([]);
  });

  it("keeps each starter debate lineup free of duplicate participants", () => {
    for (const bundle of STARTER_BUNDLES) {
      expect(new Set(bundle.memberPresetIds).size).toBe(bundle.memberPresetIds.length);
    }
  });
});

describe("starter bundle moderator balance", () => {
  it("does not let Anderson Cooper dominate the global starter pool", () => {
    const globalBundles = STARTER_BUNDLES.filter((bundle) => bundle.audience === "global");
    const countByModerator = new Map<string, number>();

    for (const bundle of globalBundles) {
      countByModerator.set(bundle.moderatorPresetId, (countByModerator.get(bundle.moderatorPresetId) ?? 0) + 1);
    }

    expect(countByModerator.get(US_COORDINATOR_PRESET_ID) ?? 0).toBeLessThanOrEqual(3);

    const nonAndersonModeratorsWithMultipleBundles = [...countByModerator.entries()].filter(
      ([moderatorId, count]) => moderatorId !== US_COORDINATOR_PRESET_ID && count >= 2,
    );

    expect(nonAndersonModeratorsWithMultipleBundles.length).toBeGreaterThanOrEqual(5);
  });
});
