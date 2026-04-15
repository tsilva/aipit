import type { PresetAudience } from "@/lib/audience";
import type { RunInput, RunResult } from "@/lib/pit";

export type ApiKeyStatus = "empty" | "checking" | "valid" | "invalid" | "unresolved";

export type InitialStudioState = {
  config: RunInput;
  audience: PresetAudience;
  lineupOrder: string[];
  starterBundleId?: string;
  apiKey: string;
  apiKeyStatus: ApiKeyStatus;
  apiKeyStatusMessage: string;
  draftApiKey: string;
  initialResult: RunResult | null;
  initialStudioView: "setup" | "simulation";
  isReplayOnly: boolean;
  shareUrl: string | null;
  shareNotice: string | null;
};
