import { describe, expect, it } from "vitest";
import { isSameRuntimeTurn, shouldDisplayRuntimeWarning, type RuntimeWarningNotice } from "@/lib/runtime-warning";

describe("runtime warning helpers", () => {
  const warning: RuntimeWarningNotice = {
    message: "Anderson Cooper could not use deepseek/deepseek-v3.2.",
    speakerId: "speaker-1",
    kind: "opening",
  };

  it("matches warnings to the same runtime turn only", () => {
    expect(isSameRuntimeTurn(warning, { speakerId: "speaker-1", kind: "opening" })).toBe(true);
    expect(isSameRuntimeTurn(warning, { speakerId: "speaker-1", kind: "intervention" })).toBe(false);
    expect(isSameRuntimeTurn(warning, { speakerId: "speaker-2", kind: "opening" })).toBe(false);
  });

  it("hides warnings after the runtime turn has moved on", () => {
    expect(shouldDisplayRuntimeWarning(warning, { speakerId: "speaker-1", kind: "opening" })).toBe(true);
    expect(shouldDisplayRuntimeWarning(warning, { speakerId: "speaker-1", kind: "consensus" })).toBe(false);
    expect(shouldDisplayRuntimeWarning(warning, null)).toBe(false);
  });
});
