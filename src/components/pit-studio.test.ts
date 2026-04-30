import { describe, expect, it } from "vitest";
import { isSameRuntimePlaybackTurn } from "@/components/pit-studio";

describe("pit studio pending playback", () => {
  it("recognizes when a pending speaker turn is already present in playback frames", () => {
    expect(
      isSameRuntimePlaybackTurn(
        {
          speakerId: "henrique",
          kind: "member_turn",
          round: 1,
        },
        {
          speakerId: "henrique",
          kind: "member_turn",
          round: 1,
        },
      ),
    ).toBe(true);
  });

  it("does not match a previous moderator or speaker turn", () => {
    expect(
      isSameRuntimePlaybackTurn(
        {
          speakerId: "christiane",
          kind: "opening",
        },
        {
          speakerId: "henrique",
          kind: "member_turn",
          round: 1,
        },
      ),
    ).toBe(false);

    expect(
      isSameRuntimePlaybackTurn(
        {
          speakerId: "henrique",
          kind: "member_turn",
          round: 1,
        },
        {
          speakerId: "henrique",
          kind: "member_turn",
          round: 2,
        },
      ),
    ).toBe(false);
  });
});
