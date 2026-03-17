import { describe, expect, it } from "vitest";
import { buildReplayInitialStudioState, resolveShareNotice, SHARE_STATUS_UNSUPPORTED } from "@/lib/share-replay";
import { createCompletedShareFixture } from "@/lib/share-test-fixture";
import { createSharedConversationSnapshot } from "@/lib/share-snapshot";

describe("shared replay studio state", () => {
  it("boots the studio in read-only simulation mode", () => {
    const { input, result } = createCompletedShareFixture();
    const snapshot = createSharedConversationSnapshot({ input, result });
    const initialState = buildReplayInitialStudioState(snapshot, "https://aipit.example/s/mock-slug");

    expect(initialState.initialStudioView).toBe("simulation");
    expect(initialState.isReplayOnly).toBe(true);
    expect(initialState.shareUrl).toBe("https://aipit.example/s/mock-slug");
    expect(initialState.initialResult?.prompt).toBe(result.prompt);
  });

  it("maps the unsupported share status to a user-facing notice", () => {
    expect(resolveShareNotice(SHARE_STATUS_UNSUPPORTED)).toContain("no longer supported");
  });
});
