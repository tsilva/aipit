import { describe, expect, it } from "vitest";
import { createCompletedShareFixture } from "@/lib/share-test-fixture";
import {
  CURRENT_SHARE_HISTORY_VERSION,
  createSharedConversationSnapshot,
  parseSharedConversationSnapshot,
  SharedConversationSnapshotError,
} from "@/lib/share-snapshot";

describe("shared conversation snapshots", () => {
  it("sanitizes raw prompts before persistence", () => {
    const { input, result } = createCompletedShareFixture();

    const snapshot = createSharedConversationSnapshot({ input, result });
    const sharedTurns = [
      snapshot.result.opening,
      ...(snapshot.result.rounds?.flatMap((round) => [...round.turns, round.intervention].filter(Boolean)) ?? []),
      snapshot.result.synthesis,
      snapshot.result.consensus,
    ].filter(Boolean);

    expect(sharedTurns.every((turn) => turn?.rawPrompt === "")).toBe(true);
  });

  it("rejects snapshots with the wrong kind", () => {
    expect(() =>
      parseSharedConversationSnapshot({
        kind: "not-aipit-share",
        historyVersion: CURRENT_SHARE_HISTORY_VERSION,
      }),
    ).toThrow(SharedConversationSnapshotError);
  });

  it("rejects snapshots from unsupported history versions", () => {
    const { input, result } = createCompletedShareFixture();
    const snapshot = createSharedConversationSnapshot({ input, result });

    try {
      parseSharedConversationSnapshot({
        ...snapshot,
        historyVersion: CURRENT_SHARE_HISTORY_VERSION + 1,
      });
      throw new Error("Expected the parser to reject an unsupported history version.");
    } catch (error) {
      expect(error).toBeInstanceOf(SharedConversationSnapshotError);
      expect((error as SharedConversationSnapshotError).reason).toBe("unsupported_version");
      expect((error as Error).message).toBe("Unsupported shared conversation version.");
    }
  });
});
