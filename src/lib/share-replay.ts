import type { InitialStudioState } from "@/lib/pit-studio-state";
import type { SharedConversationSnapshot } from "@/lib/share-snapshot";

export const SHARE_STATUS_QUERY_KEY = "share";
export const SHARE_STATUS_UNSUPPORTED = "unsupported";
export const UNSUPPORTED_SHARE_NOTICE =
  "This shared conversation is no longer supported by the current version of aipit.";

export function resolveShareNotice(value: string | string[] | undefined): string | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === SHARE_STATUS_UNSUPPORTED ? UNSUPPORTED_SHARE_NOTICE : null;
}

export function buildReplayInitialStudioState(
  snapshot: SharedConversationSnapshot,
  shareUrl: string,
): InitialStudioState {
  return {
    config: snapshot.input,
    audience: "global",
    lineupOrder: snapshot.result.roster.map((participant) => participant.id),
    starterBundleId: undefined,
    apiKey: "",
    apiKeyStatus: "valid",
    apiKeyStatusMessage: "Replay mode loaded from a shared snapshot. OpenRouter is disabled.",
    draftApiKey: "",
    initialResult: snapshot.result,
    initialStudioView: "simulation",
    isReplayOnly: true,
    shareUrl,
    shareNotice: null,
  };
}
