import type { RunProgressEvent } from "@/lib/pit-engine";
import type { PitTurn } from "@/lib/pit-core";

export type PlaybackFrame = {
  id: string;
  turnId: string;
  speakerId: string;
  speakerName: string;
  kind: PitTurn["kind"];
  round?: number;
  model: string;
  character: string;
  bubbleId: string;
  bubbleContent: string;
  bubbleIndex: number;
  bubbleCount: number;
  chapterLabel: string;
  rawPrompt: string;
  timestampMs: number;
  durationMs: number;
};

export type TimelineChapter = {
  id: string;
  frameIndex: number;
  label: string;
  timestampMs: number;
};

export type PendingTurnPreview = Extract<RunProgressEvent, { type: "thinking" }>;
type RuntimePlaybackTurnIdentity = {
  speakerId: string;
  kind: PitTurn["kind"];
  round?: number;
};

export type StagePanelMode = "conversation" | "transcript";

export function isSameRuntimePlaybackTurn(
  frame: RuntimePlaybackTurnIdentity,
  pendingTurn: RuntimePlaybackTurnIdentity,
): boolean {
  return (
    frame.speakerId === pendingTurn.speakerId &&
    frame.kind === pendingTurn.kind &&
    frame.round === pendingTurn.round
  );
}

export function kindLabel(kind: PitTurn["kind"]): string {
  return kind.replace(/_/g, " ");
}
