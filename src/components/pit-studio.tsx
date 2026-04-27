"use client";

import {
  ArrowLeft as BackGlyph,
  CircleCheck as CheckGlyph,
  Copy as CopyGlyph,
  ExternalLink as ExternalLinkGlyph,
  FileText as PromptGlyph,
  Flame as FlameGlyph,
  Pause as PauseGlyph,
  Pencil as PencilGlyph,
  Play as PlayGlyph,
  Plus as PlusGlyph,
  Settings as SettingsGlyph,
  SkipBack as PreviousGlyph,
  SkipForward as NextGlyph,
  Shuffle as ShuffleGlyph,
  Trash2 as TrashGlyph,
  TriangleAlert as WarningGlyph,
  X as CloseGlyph,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getAudienceContextLabel,
  type PresetAudience,
} from "@/lib/audience";
import {
  AutoSizeTextarea,
  FieldShell,
  ParticipantAvatar,
  SpeakingParticipantAvatar,
} from "@/components/pit-studio-primitives";
import { SimulationNotice } from "@/components/simulation-notice";
import { TelemetryPreferencesButton } from "@/components/telemetry-preferences";
import {
  type PitTurn,
  type ParticipantConfig,
  type RunInput,
  type RunResult,
} from "@/lib/pit";
import { OPENROUTER_MODEL_COMBATIVE, SUPPORTED_OPENROUTER_MODELS } from "@/lib/openrouter-models";
import {
  buildCharacterProfilePreview,
  cloneCharacterProfile,
  createCharacterProfile,
} from "@/lib/character-profile";
import type { ParticipantCharacterPreset } from "@/lib/character-presets";
import type { RunProgressEvent } from "@/lib/pit-engine";
import type { ApiKeyStatus, InitialStudioState } from "@/lib/pit-studio-state";
import {
  shouldDisplayRuntimeWarning,
  type RuntimeTurnIdentity,
  type RuntimeWarningNotice,
} from "@/lib/runtime-warning";
import { isCompletedRunResult } from "@/lib/share-snapshot";
import { trackEvent } from "@/lib/google-analytics";

export type { ApiKeyStatus, InitialStudioState } from "@/lib/pit-studio-state";

const INVALID_OPENROUTER_KEY_MESSAGE = "This API key is invalid. Add a valid OpenRouter key to run debates.";
const HOSTED_OPENROUTER_KEY_MESSAGE = "Using this app's configured OpenRouter key. Usage may be limited.";
const INVALID_OPENROUTER_KEY_FORMAT_MESSAGE = "This API key is invalid. OpenRouter keys should start with sk-or-v1-.";
const OPENROUTER_API_KEY_STORAGE_KEY = "aipit.openrouter-api-key";
const OPENROUTER_API_KEY_PATTERN = /^sk-or-v1-[A-Za-z0-9_-]{32,}$/;
const OPENROUTER_API_KEY_VALIDATION_DEBOUNCE_MS = 450;
const DEFAULT_SHARED_DIRECTIVE = `Character-vs-character debate. Defend your character's instincts, style, and worldview with full conviction — let the character's natural temperament, cadence, verbal habits, and rhetorical flaws drive the delivery. Engage the strongest opposing points; respond to what was actually said, never repeat a stump speech. Hold your position but acknowledge stronger objections when they matter. Stay concrete, argumentative, conversational, and authentic to the assigned voice rather than essayistic or over-polished.`;
const PIT_RUN_DEFAULTS = {
  sharedDirective: DEFAULT_SHARED_DIRECTIVE,
  rounds: 2,
  temperature: 0.7,
  maxCompletionTokens: 700,
} as const;

const TranscriptMarkdownContent = dynamic(() => import("@/components/transcript-markdown"), {
  loading: () => <p className="transcript-markdown-p">Loading transcript...</p>,
  ssr: false,
});

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function orderParticipants(roster: ParticipantConfig[], lineupOrder: string[]): ParticipantConfig[] {
  const participantById = new Map(roster.map((participant) => [participant.id, participant]));
  const ordered = lineupOrder
    .map((participantId) => participantById.get(participantId) ?? null)
    .filter((participant): participant is ParticipantConfig => participant !== null);
  const missing = roster.filter((participant) => !lineupOrder.includes(participant.id));

  return [...ordered, ...missing];
}

function syncLineupOrder(lineupOrder: string[], roster: ParticipantConfig[]): string[] {
  const rosterIds = roster.map((participant) => participant.id);
  const nextOrder = [...lineupOrder.filter((participantId) => rosterIds.includes(participantId))];

  for (const participantId of rosterIds) {
    if (!nextOrder.includes(participantId)) {
      nextOrder.push(participantId);
    }
  }

  return arraysEqual(lineupOrder, nextOrder) ? lineupOrder : nextOrder;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createMember(index: number): ParticipantConfig {
  return {
    id: makeId(`member-${index}`),
    name: `Debater ${index}`,
    model: OPENROUTER_MODEL_COMBATIVE,
    characterProfile:
      index % 2 === 0
        ? createCharacterProfile({
            role: "Analytical pragmatist",
            personality: "Evidence-driven, practical, and focused on tradeoffs",
            perspective: "Evaluates proposals through tradeoffs, evidence, and practical execution.",
            debateStyle: "Prioritize concrete tradeoffs, operational constraints, and implementation realism.",
          })
        : createCharacterProfile({
            role: "Skeptical strategist",
            personality: "Critical, risk-aware, and focused on second-order effects",
            perspective: "Assumes incentives matter and looks for fragility, hidden costs, and downstream consequences.",
            debateStyle: "Stress-test assumptions, risks, and second-order effects before accepting a claim.",
          }),
  };
}

function createFallbackCoordinator(): ParticipantConfig {
  return {
    id: makeId("coordinator"),
    name: "Moderator",
    model: OPENROUTER_MODEL_COMBATIVE,
    characterProfile: createCharacterProfile({
      role: "Impartial moderator",
      personality: "Calm, neutral, and evidence-led",
      perspective: "Keeps the debate legible and presses participants to answer directly.",
      debateStyle: "Clarify stakes, surface tradeoffs, and ask concise follow-ups.",
      language: "English",
    }),
  };
}

function emptyUsage(): RunResult["usage"] {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
}

function addUsage(target: RunResult["usage"], delta?: Partial<RunResult["usage"]> | null): RunResult["usage"] {
  if (!delta) {
    return target;
  }

  return {
    promptTokens: target.promptTokens + (delta.promptTokens ?? 0),
    completionTokens: target.completionTokens + (delta.completionTokens ?? 0),
    totalTokens: target.totalTokens + (delta.totalTokens ?? 0),
    cost: target.cost + (delta.cost ?? 0),
  };
}

function createRosterSnapshot(input: RunInput): ParticipantConfig[] {
  return [input.coordinator, ...input.members].map((participant) => ({
    ...participant,
    characterProfile: cloneCharacterProfile(participant.characterProfile),
  }));
}

function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked || typeof document === "undefined") {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isLocked]);
}

function useModalFocusTrap(containerRef: React.RefObject<HTMLElement | null>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || typeof document === "undefined") {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const resolveFocusableElements = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

    const focusableElements = resolveFocusableElements();
    (focusableElements[0] ?? container).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const currentFocusableElements = resolveFocusableElements();
      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = currentFocusableElements[0];
      const lastElement = currentFocusableElements[currentFocusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement || !container.contains(document.activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [containerRef, isActive]);
}

async function validateApiKey({
  nextApiKey,
  requestIdRef,
  siteUrl,
  setApiKeyStatus,
  setApiKeyStatusMessage,
}: {
  nextApiKey: string;
  requestIdRef: { current: number };
  siteUrl: string;
  setApiKeyStatus: React.Dispatch<React.SetStateAction<ApiKeyStatus>>;
  setApiKeyStatusMessage: React.Dispatch<React.SetStateAction<string>>;
}): Promise<boolean> {
  const trimmed = nextApiKey.trim();

  const requestId = requestIdRef.current + 1;
  requestIdRef.current = requestId;
  setApiKeyStatus(trimmed ? "checking" : "empty");
  setApiKeyStatusMessage(trimmed ? "Validating API key with OpenRouter..." : HOSTED_OPENROUTER_KEY_MESSAGE);

  try {
    const { validateOpenRouterKey } = await import("@/lib/openrouter");
    const validation = await validateOpenRouterKey(nextApiKey, siteUrl);
    if (requestIdRef.current !== requestId) {
      return false;
    }

    setApiKeyStatus(validation.valid ? "valid" : "invalid");
    setApiKeyStatusMessage(validation.message);
    return validation.valid;
  } catch {
    if (requestIdRef.current !== requestId) {
      return false;
    }

    setApiKeyStatus("invalid");
    setApiKeyStatusMessage(INVALID_OPENROUTER_KEY_MESSAGE);
    return false;
  }
}

type PlaybackFrame = {
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

type TimelineChapter = {
  id: string;
  frameIndex: number;
  label: string;
  timestampMs: number;
};

type PlannedQueueTurn = {
  id: string;
  kind: PitTurn["kind"];
  round?: number;
  speakerId: string;
  speakerName: string;
  model: string;
  chapterLabel: string;
};

type QueueEntry = {
  id: string;
  kind: PitTurn["kind"];
  speakerName: string;
  model: string;
  chapterLabel: string;
  participant: ParticipantConfig | null;
  state: "speaking" | "ready" | "thinking" | "waiting";
  frameIndex: number | null;
};

type PendingTurnPreview = Extract<RunProgressEvent, { type: "thinking" }>;

type StagePanelMode = "conversation" | "transcript";
type StudioView = "setup" | "simulation";

function kindLabel(kind: PitTurn["kind"]): string {
  return kind.replace(/_/g, " ");
}

function chapterLabelForTurn(turn: PitTurn): string {
  if (turn.kind === "opening") {
    return "Opening";
  }

  if (turn.kind === "intervention") {
    return turn.round ? `Intervention after round ${turn.round}` : "Intervention";
  }

  if (turn.kind === "synthesis") {
    return "Synthesis";
  }

  if (turn.kind === "consensus") {
    return "Closing";
  }

  if (turn.round) {
    return `Round ${turn.round}`;
  }

  return kindLabel(turn.kind);
}

function frameDuration(content: string): number {
  return Math.min(4200, Math.max(1400, 900 + content.length * 22));
}

function bubbleRevealIncrement(content: string): number {
  return Math.max(2, Math.ceil(content.length / 42));
}

function bubbleHoldDuration(content: string): number {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(3200, wordCount * 280));
}

function flattenTurns(result: RunResult | null): PitTurn[] {
  if (!result) {
    return [];
  }

  const roundTurns =
    result.rounds?.reduce<PitTurn[]>((turns, round) => {
      turns.push(...round.turns);

      if (round.intervention) {
        turns.push(round.intervention);
      }

      return turns;
    }, []) ?? [];

  return [
    ...(result.opening ? [result.opening] : []),
    ...roundTurns,
    ...(result.synthesis ? [result.synthesis] : []),
    ...(result.consensus ? [result.consensus] : []),
  ];
}

function upsertRoundTurn(turns: PitTurn[], turn: PitTurn): PitTurn[] {
  const existingIndex = turns.findIndex((existingTurn) => existingTurn.id === turn.id);

  if (existingIndex === -1) {
    return [...turns, turn];
  }

  return turns.map((existingTurn, index) => (index === existingIndex ? turn : existingTurn));
}

function upsertTurnIntoResult(result: RunResult, turn: PitTurn): RunResult {
  switch (turn.kind) {
    case "opening":
      return { ...result, opening: turn };
    case "member_turn": {
      const existingRounds = result.rounds ?? [];
      const roundNumber = turn.round ?? 1;
      const roundIndex = existingRounds.findIndex((round) => round.round === roundNumber);

      if (roundIndex >= 0) {
        return {
          ...result,
          rounds: existingRounds.map((round, index) =>
            index === roundIndex ? { ...round, turns: upsertRoundTurn(round.turns, turn) } : round,
          ),
        };
      }

      return {
        ...result,
        rounds: [...existingRounds, { round: roundNumber, turns: [turn] }],
      };
    }
    case "intervention": {
      const existingRounds = result.rounds ?? [];
      const roundNumber = turn.round ?? 1;
      const roundIndex = existingRounds.findIndex((round) => round.round === roundNumber);

      if (roundIndex >= 0) {
        return {
          ...result,
          rounds: existingRounds.map((round, index) =>
            index === roundIndex ? { ...round, intervention: turn } : round,
          ),
        };
      }

      return {
        ...result,
        rounds: [...existingRounds, { round: roundNumber, turns: [], intervention: turn }],
      };
    }
    case "synthesis":
      return { ...result, synthesis: turn };
    case "consensus":
      return { ...result, consensus: turn };
  }
}

function buildPlaybackTimeline(result: RunResult | null): {
  chapters: TimelineChapter[];
  frames: PlaybackFrame[];
  totalDurationMs: number;
} {
  const turns = flattenTurns(result);
  const chapters: TimelineChapter[] = [];
  const frames: PlaybackFrame[] = [];
  let elapsedMs = 0;

  for (const turn of turns) {
    const chapterLabel = chapterLabelForTurn(turn);
    const bubbles = turn.bubbles.length > 0 ? turn.bubbles : [{ id: `${turn.id}-fallback`, content: turn.content }];
    chapters.push({
      id: turn.id,
      frameIndex: frames.length,
      label: `${chapterLabel} · ${turn.speakerName}`,
      timestampMs: elapsedMs,
    });

    bubbles.forEach((bubble, bubbleIndex) => {
      const durationMs = frameDuration(bubble.content);
      frames.push({
        id: `${turn.id}-${bubble.id}`,
        turnId: turn.id,
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        kind: turn.kind,
        round: turn.round,
        model: turn.model,
        character: turn.character,
        bubbleId: bubble.id,
        bubbleContent: bubble.content,
        bubbleIndex,
        bubbleCount: bubbles.length,
        chapterLabel,
        rawPrompt: turn.rawPrompt,
        timestampMs: elapsedMs,
        durationMs,
      });
      elapsedMs += durationMs;
    });
  }

  return {
    chapters,
    frames,
    totalDurationMs: elapsedMs,
  };
}

function buildPlaybackTurnIds(frames: PlaybackFrame[]): string[] {
  return frames.reduce<string[]>((turnIds, frame) => {
    if (turnIds[turnIds.length - 1] !== frame.turnId) {
      turnIds.push(frame.turnId);
    }

    return turnIds;
  }, []);
}

function buildPlannedQueueTurns({
  rounds,
  coordinator,
  members,
}: {
  rounds: number;
  coordinator: ParticipantConfig;
  members: ParticipantConfig[];
}): PlannedQueueTurn[] {
  const plannedTurns: PlannedQueueTurn[] = [
    {
      id: "planned-opening",
      kind: "opening",
      speakerId: coordinator.id,
      speakerName: coordinator.name,
      model: coordinator.model,
      chapterLabel: "Opening",
    },
  ];

  for (let round = 1; round <= rounds; round += 1) {
    members.forEach((member, memberIndex) => {
      plannedTurns.push({
        id: `planned-round-${round}-${memberIndex + 1}`,
        kind: "member_turn",
        round,
        speakerId: member.id,
        speakerName: member.name,
        model: member.model,
        chapterLabel: `Round ${round}`,
      });
    });

    if (round < rounds) {
      plannedTurns.push({
        id: `planned-intervention-${round}`,
        kind: "intervention",
        round,
        speakerId: coordinator.id,
        speakerName: coordinator.name,
        model: coordinator.model,
        chapterLabel: `Intervention after round ${round}`,
      });
    }
  }

  plannedTurns.push({
    id: "planned-consensus-debate",
    kind: "consensus",
    speakerId: coordinator.id,
    speakerName: coordinator.name,
    model: coordinator.model,
    chapterLabel: "Consensus",
  });

  return plannedTurns;
}

function shuffleParticipants(participants: ParticipantConfig[]): ParticipantConfig[] {
  const next = [...participants];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[swapIndex] ?? current;
    next[swapIndex] = current;
  }

  return next;
}

function buildQueueEntries({
  frames,
  roster,
  plannedTurns,
  currentFrame,
  hasPlaybackStarted,
  isAwaitingTurnResponse,
  isRunning,
  pendingTurn,
}: {
  frames: PlaybackFrame[];
  roster: ParticipantConfig[];
  plannedTurns: PlannedQueueTurn[];
  currentFrame?: PlaybackFrame;
  hasPlaybackStarted: boolean;
  isAwaitingTurnResponse: boolean;
  isRunning: boolean;
  pendingTurn: PendingTurnPreview | null;
}): QueueEntry[] {
  const participantById = new Map(roster.map((participant) => [participant.id, participant]));
  const actualTurnStarts = frames.reduce<Array<{ frame: PlaybackFrame; frameIndex: number }>>((entries, frame, frameIndex) => {
    if (entries[entries.length - 1]?.frame.turnId === frame.turnId) {
      return entries;
    }

    entries.push({ frame, frameIndex });
    return entries;
  }, []);
  const currentTurnId = currentFrame?.turnId ?? null;

  if (!hasPlaybackStarted) {
    return [];
  }

  return plannedTurns.map((plannedTurn, index) => {
    const actualTurn = actualTurnStarts[index] ?? null;
    const actualFrame = actualTurn?.frame ?? null;
    const speakerId = actualFrame?.speakerId ?? plannedTurn.speakerId;
    const isPendingTurn =
      pendingTurn !== null &&
      pendingTurn.speakerId === plannedTurn.speakerId &&
      pendingTurn.kind === plannedTurn.kind &&
      pendingTurn.round === plannedTurn.round &&
      index >= actualTurnStarts.length;
    const state =
      actualFrame?.turnId === currentTurnId
        ? ("speaking" as const)
        : (isRunning || isAwaitingTurnResponse) && isPendingTurn
          ? ("thinking" as const)
          : actualFrame !== null
            ? ("ready" as const)
            : ("waiting" as const);

    return {
      id: actualFrame?.turnId ?? plannedTurn.id,
      kind: actualFrame?.kind ?? plannedTurn.kind,
      speakerName: actualFrame?.speakerName ?? plannedTurn.speakerName,
      model: isPendingTurn ? pendingTurn.model : actualFrame?.model ?? plannedTurn.model,
      chapterLabel: actualFrame?.chapterLabel ?? plannedTurn.chapterLabel,
      participant: participantById.get(speakerId) ?? null,
      state,
      frameIndex: actualTurn?.frameIndex ?? null,
    };
  });
}

function queueStateLabel(state: QueueEntry["state"]): string {
  switch (state) {
    case "speaking":
      return "Speaking";
    case "thinking":
      return "Thinking";
    case "ready":
      return "Ready";
    case "waiting":
    default:
      return "Waiting";
  }
}

function isLocalRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

function subscribeToRuntime(): () => void {
  return () => {};
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function promptPlaceholder(): string {
  return "e.g., Should AI companies be liable for harm caused by their models?";
}

const SUGGESTED_TOPICS = [
  "Will AI replace more jobs than it creates?",
  "Should social media platforms censor content?",
  "Is AGI a threat to humanity?",
  "Should AI be used in healthcare decision-making?",
] as const;

const SUGGESTED_TOPIC_ICONS = ["🌍", "⚖️", "🤖", "💊"] as const;

function normalizeCardCopy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+•\s+/g, " • ")
    .trim();
}

function clipAtWord(value: string, maxLength: number): string {
  const normalizedValue = normalizeCardCopy(value);
  const cleanedValue = normalizedValue.replace(/[,\s;:.-]+$/g, "").trim();

  if (cleanedValue.length <= maxLength) {
    return cleanedValue;
  }

  const clipped = cleanedValue.slice(0, maxLength + 1);
  const wordBoundary = clipped.search(/\s+\S*$/);
  const candidate = wordBoundary > maxLength * 0.58 ? clipped.slice(0, wordBoundary) : cleanedValue.slice(0, maxLength);

  return `${candidate.replace(/[,\s;:.-]+$/g, "").trim()}...`;
}

function compactCharacterLabel(participant: ParticipantConfig): string {
  const source = normalizeCardCopy(participant.characterProfile.role || participant.characterProfile.personality || "AI Persona")
    .replace(/\btelevision\b/gi, "TV")
    .replace(/\bpublic-service\b/gi, "public service")
    .replace(/\bright-populist\b/gi, "right populist")
    .replace(/\bcentre-left\b/gi, "center left")
    .replace(/\bcentre-right\b/gi, "center right");
  const firstUsefulPhrase =
    source
      .split(/\s+(?:serving as|focused on|who|with|for|from|and)\s+/i)[0]
      ?.split(/[.,;:]/)[0]
      ?.trim() || source;

  return clipAtWord(firstUsefulPhrase, 24);
}

function compactCharacterSummary(participant: ParticipantConfig): string {
  const profile = participant.characterProfile;
  const source = normalizeCardCopy(
    profile.personality ||
      profile.perspective ||
      profile.debateStyle ||
      buildCharacterProfilePreview(profile) ||
      "Configured persona ready to argue from a distinct point of view.",
  );

  if (!source) {
    return "Configured persona ready to argue from a distinct point of view.";
  }

  return clipAtWord(source, 92);
}

function isShareResponse(
  value: unknown,
): value is { slug: string; url: string; error?: { message?: unknown } } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { slug?: unknown }).slug === "string" &&
    typeof (value as { url?: unknown }).url === "string"
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildPresetParticipant(preset: ParticipantCharacterPreset, index: number): ParticipantConfig {
  return {
    ...createMember(index),
    name: preset.name,
    model: preset.recommendedModel,
    presetId: preset.id,
    characterProfile: cloneCharacterProfile(preset.characterProfile),
    avatarUrl: preset.avatarUrl,
    speakingAvatarUrl: preset.speakingAvatarUrl,
  };
}

function promoteParticipantToModerator(input: RunInput, participantId: string): RunInput {
  if (input.coordinator.id === participantId) {
    return input;
  }

  const moderatorIndex = input.members.findIndex((member) => member.id === participantId);

  if (moderatorIndex === -1) {
    return input;
  }

  return {
    ...input,
    coordinator: input.members[moderatorIndex],
    members: input.members.map((member, index) => (index === moderatorIndex ? input.coordinator : member)),
  };
}

function addParticipantToLineup(input: RunInput, preset: ParticipantCharacterPreset): RunInput {
  const isPresetAlreadyInLineup = [input.coordinator, ...input.members].some(
    (participant) => participant.presetId === preset.id,
  );

  if (isPresetAlreadyInLineup) {
    return input;
  }

  const incomingParticipant = buildPresetParticipant(preset, input.members.length + 1);

  if (input.members.length === 0) {
    return {
      ...input,
      coordinator: incomingParticipant,
      members: [input.coordinator],
    };
  }

  return {
    ...input,
    members: [...input.members, incomingParticipant],
  };
}

function removeParticipantFromLineup(input: RunInput, participantId: string): RunInput {
  if (input.coordinator.id === participantId) {
    if (input.members.length === 0) {
      return input;
    }

    const [nextCoordinator, ...remainingMembers] = input.members;

    return {
      ...input,
      coordinator: nextCoordinator,
      members: remainingMembers,
    };
  }

  return {
    ...input,
    members: input.members.filter((member) => member.id !== participantId),
  };
}

function SetupParticipantCard({
  participant,
  isModerator,
  roleLabel,
  onSelectModerator,
  onEdit,
}: {
  participant: ParticipantConfig;
  isModerator: boolean;
  roleLabel: string;
  onSelectModerator: () => void;
  onEdit: () => void;
}) {
  const moderatorActionId = useId();
  const characterLabel = compactCharacterLabel(participant);
  const characterSummary = compactCharacterSummary(participant);

  return (
    <div className={`hero-roster-card ${isModerator ? "hero-roster-card-active" : ""}`}>
      <button
        type="button"
        className="hero-roster-select"
        onClick={onSelectModerator}
        aria-pressed={isModerator}
        aria-describedby={moderatorActionId}
        title={isModerator ? `${participant.name} is the moderator` : `Make ${participant.name} the moderator`}
      >
        <div className="hero-roster-card-top">
          <ParticipantAvatar
            name={participant.name}
            avatarUrl={participant.avatarUrl}
            className="hero-roster-avatar"
            fallbackClassName="hero-roster-avatar-fallback"
            imageClassName="avatar-image"
            priority
            sizes="54px"
          />

          <div className="hero-roster-copy">
            <span className="hero-roster-name" title={participant.name}>{participant.name}</span>
            <span className="hero-roster-role">{roleLabel}</span>
          </div>
        </div>

        <p className="hero-roster-character" title={characterSummary}>{characterSummary}</p>
        <span className="hero-roster-chip" title={characterLabel}>{characterLabel}</span>
        <span id={moderatorActionId} className="sr-only">
          {isModerator ? `${participant.name} is currently the moderator.` : `Select ${participant.name} as the moderator.`}
        </span>
      </button>

      <button type="button" className="hero-roster-edit" onClick={onEdit} aria-label={`Edit ${participant.name}`} title={`Edit ${participant.name}`}>
        <SettingsGlyph />
      </button>
    </div>
  );
}

function StudioHero({
  roster,
  config,
  apiKeyStatus,
  apiKeyStatusMessage,
  draftApiKey,
  canSubmit,
  hasApiKey,
  isRunning,
  onDraftApiKeyChange,
  onPromptChange,
  onRerollDebaters,
  onRerollTopic,
  onAddMember,
  onSelectModerator,
  onOpenParticipant,
}: {
  roster: ParticipantConfig[];
  config: RunInput;
  apiKeyStatus: ApiKeyStatus;
  apiKeyStatusMessage: string;
  draftApiKey: string;
  canSubmit: boolean;
  hasApiKey: boolean;
  isRunning: boolean;
  onDraftApiKeyChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRerollDebaters: () => void;
  onRerollTopic: () => void;
  onAddMember: () => void;
  onSelectModerator: (id: string) => void;
  onOpenParticipant: (id: string) => void;
}) {
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const displayedApiKeyStatus = apiKeyStatus;
  const displayedApiKeyStatusMessage = apiKeyStatusMessage;
  const showWarningStatusIcon = displayedApiKeyStatus === "empty" || displayedApiKeyStatus === "invalid";
  const statusTone =
    displayedApiKeyStatus === "valid"
      ? "success"
      : displayedApiKeyStatus === "invalid"
        ? "error"
        : displayedApiKeyStatus === "checking"
          ? "info"
          : "warning";

  useEffect(() => {
    apiKeyInputRef.current?.focus();
  }, []);

  function handleApiKeyInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
  }

  return (
    <section className="hero-shell">
      <section className="hero-intro-grid" aria-label="The AI Pit setup">
        <div className="hero-copy-panel">
          <div className="hero-welcome-pill">
            <FlameGlyph />
            <span>Welcome to</span>
          </div>
          <h1 className="hero-title">The AI Pit</h1>
          <p className="hero-subtitle">Where AI Minds Clash</p>
          <p className="hero-hook">Choose a topic, pick the personas, and watch live arguments unfold.</p>
        </div>

        <figure className="hero-arena-card" aria-label="Two AI personas in a debate arena">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/landing/ai-pit-arena.png" alt="" aria-hidden="true" />
        </figure>
      </section>

      <section className="hero-setup-grid">
        <div className="hero-panel hero-prompt-shell">
          <div className="hero-topic-header">
            <div className="hero-section-heading">
              <span className="hero-step-badge">1</span>
              <div>
                <h2 className="hero-panel-title">Choose a debate topic</h2>
                <p className="hero-panel-copy">Enter a question or topic to get the debate started</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRerollTopic}
              className="hero-icon-control-button"
              aria-label="Random topic"
              title="Random topic"
            >
              <ShuffleGlyph />
            </button>
          </div>

          <label className="hero-prompt-panel" htmlFor="hero-pit-prompt">
            <AutoSizeTextarea
              id="hero-pit-prompt"
              className="field hero-prompt-input"
              value={config.prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={promptPlaceholder()}
              rows={2}
            />
          </label>

          <div className="hero-suggestion-stack">
            <p className="hero-suggestion-title">Suggested topics</p>
            <div className="hero-suggestion-list">
              {SUGGESTED_TOPICS.map((topic, index) => (
                <button
                  key={topic}
                  type="button"
                  className="hero-suggestion-button"
                  onClick={() => onPromptChange(topic)}
                >
                  <span aria-hidden="true">{SUGGESTED_TOPIC_ICONS[index] ?? "*"}</span>
                  <span>{topic}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-panel hero-roster-shell">
          <div className="hero-roster-header">
            <div className="hero-section-heading">
              <span className="hero-step-badge">2</span>
              <div>
                <div className="hero-heading-row">
                  <h2 className="hero-panel-title">Configure debaters</h2>
                  <span className="hero-roster-count-pill">{roster.length} personas</span>
                </div>
                <p className="hero-panel-copy">Choose AI personas with diverse perspectives</p>
              </div>
            </div>

            <div className="hero-roster-actions">
              <button
                type="button"
                onClick={onRerollDebaters}
                className="hero-icon-control-button"
                aria-label="Random debaters"
                title="Random debaters"
              >
                <ShuffleGlyph />
              </button>
              <button
                type="button"
                onClick={onAddMember}
                className="hero-icon-add-button"
                aria-label="Add debater"
                title="Add debater"
              >
                <PlusGlyph />
              </button>
            </div>
          </div>

          <div className="hero-roster-grid">
            {roster.map((participant) => (
              <SetupParticipantCard
                key={participant.id}
                participant={participant}
                isModerator={participant.id === config.coordinator.id}
                roleLabel={participant.id === config.coordinator.id ? "Moderator" : "Debater"}
                onSelectModerator={() => onSelectModerator(participant.id)}
                onEdit={() => onOpenParticipant(participant.id)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="hero-panel hero-api-shell">
        <div className="hero-api-topline">
          <div className="hero-section-heading">
            <span className="hero-step-badge">3</span>
            <div>
              <h2 className="hero-panel-title">OpenRouter access {hasApiKey ? "" : "(required)"}</h2>
              <p className="hero-panel-copy">Paste your OpenRouter key or leave blank to use this app&apos;s configured key.</p>
            </div>
          </div>

          <p className="hero-api-link-row">
            Get your key at{" "}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="hero-api-link">
              OpenRouter.ai
              <ExternalLinkGlyph />
            </a>
          </p>
        </div>

        <div className="hero-api-block">
          <div className="hero-api-form">
            <input
              id="hero-api-key-input"
              ref={apiKeyInputRef}
              className="field mono hero-api-input"
              type="text"
              value={draftApiKey}
              onChange={(event) => onDraftApiKeyChange(event.target.value)}
              onKeyDown={handleApiKeyInputKeyDown}
              placeholder="sk-or-v1-..."
              autoComplete="off"
              aria-label="OpenRouter API key"
            />
          </div>
        </div>

        <div className={`hero-api-status hero-api-status-${statusTone}`} role="status" aria-live="polite">
          {displayedApiKeyStatus === "valid" ? (
            <span className="hero-api-status-icon" aria-hidden="true">
              <CheckGlyph />
            </span>
          ) : showWarningStatusIcon ? (
            <span className="hero-api-status-icon" aria-hidden="true">
              <WarningGlyph />
            </span>
          ) : null}
          <span>{displayedApiKeyStatusMessage}</span>
        </div>
      </section>

      <button
        type="submit"
        disabled={isRunning || !canSubmit}
        className="action-button action-button-primary hero-start-button"
      >
        <span className="action-button-icon">
          <PlayGlyph />
        </span>
        <span className="hero-start-copy">
          <strong>{isRunning ? "Starting Debate" : "Start Debate"}</strong>
        </span>
      </button>

      <footer className="hero-footer">
        <span className="hero-footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <TelemetryPreferencesButton className="footer-link-button" />
        </span>
        <SimulationNotice className="simulation-notice-hero" />
      </footer>
    </section>
  );
}

function CharacterSelectorModal({
  onClose,
  onSelectPreset,
  activePresetIds,
}: {
  onClose: () => void;
  onSelectPreset: (preset: ParticipantCharacterPreset) => void;
  activePresetIds: ReadonlySet<string>;
}) {
  const [query, setQuery] = useState("");
  const [filterPresets, setFilterPresets] = useState<((query: string) => ParticipantCharacterPreset[]) | null>(null);
  const [didPresetLoadFail, setDidPresetLoadFail] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const presets = filterPresets ? filterPresets(deferredQuery) : [];
  const modalRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(true);
  useModalFocusTrap(modalRef, true);

  useEffect(() => {
    let isMounted = true;

    void import("@/lib/character-presets")
      .then(({ filterParticipantCharacterPresets }) => {
        if (!isMounted) {
          return;
        }

        setFilterPresets(() => filterParticipantCharacterPresets);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setDidPresetLoadFail(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="settings-modal-backdrop">
      <button
        type="button"
        className="settings-modal-dismiss"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />

      <section
        ref={modalRef}
        className="settings-sheet character-selector-modal-panel w-full max-w-3xl p-6 sm:p-7"
        tabIndex={-1}
      >
        <div className="settings-modal-header">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">Pit Lineup</p>
            <p className="hero-panel-copy">Choose a preset character to quickly populate this seat in the debate.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close character selector"
            className="icon-circle-button character-selector-modal-close"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="character-selector-modal-stack">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search characters"
          />

          <div className="character-preset-list character-selector-modal-list" role="list" aria-label="Character presets">
            {filterPresets === null && !didPresetLoadFail ? (
              <div className="character-preset-empty" role="status" aria-live="polite">
                Loading characters...
              </div>
            ) : didPresetLoadFail ? (
              <div className="character-preset-empty" role="status">
                Character presets failed to load. Close and reopen the picker to try again.
              </div>
            ) : presets.length > 0 ? (
              presets.map((preset) => {
                const isApplied = activePresetIds.has(preset.id);

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`character-preset-card${isApplied ? " is-applied" : ""}`}
                    disabled={isApplied}
                    aria-disabled={isApplied}
                    onClick={() => onSelectPreset(preset)}
                  >
                    <span className="character-preset-card-top">
                      <ParticipantAvatar
                        name={preset.name}
                        avatarUrl={preset.avatarUrl}
                        className="character-preset-avatar"
                        fallbackClassName="character-preset-avatar-fallback"
                        imageClassName="avatar-image"
                        sizes="48px"
                      />
                      <span className="character-preset-card-copy">
                        <span className="character-preset-card-header">
                          <span className="character-preset-card-name">{preset.name}</span>
                          <span className="character-preset-card-chip">
                            {isApplied ? "Already added" : getAudienceContextLabel(preset.audience)}
                          </span>
                        </span>
                        <span className="character-preset-card-title">{preset.title}</span>
                        <span className="character-preset-card-summary">{preset.summary}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="character-preset-empty">
                No presets match that search yet. Try a name, party, or ideology keyword.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ParticipantSettingsSheet({
  roleLabel,
  participant,
  onChange,
  onClose,
  onRemove,
}: {
  roleLabel: string;
  participant: ParticipantConfig;
  onChange: (patch: Partial<ParticipantConfig>) => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(participant.name);
  const [draftAvatarUrl, setDraftAvatarUrl] = useState(participant.avatarUrl ?? "");
  const [isAvatarDropActive, setIsAvatarDropActive] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const avatarEditorRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(true);
  useModalFocusTrap(modalRef, true);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName, participant.name]);

  useEffect(() => {
    if (!isAvatarEditorOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (avatarEditorRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsAvatarEditorOpen(false);
      setIsAvatarDropActive(false);
      setDraftAvatarUrl(participant.avatarUrl ?? "");
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAvatarEditorOpen(false);
        setIsAvatarDropActive(false);
        setDraftAvatarUrl(participant.avatarUrl ?? "");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAvatarEditorOpen, participant.avatarUrl]);

  async function applyAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const nextAvatarUrl = await readFileAsDataUrl(file);
    setDraftAvatarUrl(nextAvatarUrl);
    onChange({ avatarUrl: nextAvatarUrl, speakingAvatarUrl: undefined });
    setIsAvatarEditorOpen(false);
    setIsAvatarDropActive(false);
  }

  function commitNameEdit() {
    const nextName = draftName.trim();
    onChange({ name: nextName || participant.name });
    setDraftName(nextName || participant.name);
    setIsEditingName(false);
  }

  function updateCharacterProfile(
    patch: Partial<ParticipantConfig["characterProfile"]>,
  ) {
    onChange({
      characterProfile: {
        ...participant.characterProfile,
        ...patch,
      },
    });
  }

  return (
    <div className="settings-modal-backdrop participant-modal-backdrop">
      <button
        type="button"
        className="settings-modal-dismiss"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={modalRef}
        className="settings-sheet participant-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Participant settings"
        tabIndex={-1}
      >
        <div className="participant-modal-header">
          <div className="participant-sheet-header">
            <div className="participant-avatar-anchor" ref={avatarEditorRef}>
              <button
                type="button"
                className="participant-avatar-button"
                onClick={() => {
                  setDraftAvatarUrl(participant.avatarUrl ?? "");
                  setIsAvatarEditorOpen((current) => !current);
                }}
                aria-label="Edit participant avatar"
                title="Edit participant avatar"
              >
                <ParticipantAvatar
                  name={participant.name || "Participant"}
                  avatarUrl={participant.avatarUrl}
                  className="participant-avatar-preview"
                  fallbackClassName="participant-avatar-preview-fallback"
                  imageClassName="avatar-image"
                  decorative={false}
                  sizes="64px"
                />
              </button>

              {isAvatarEditorOpen ? (
                <div
                  className={`participant-avatar-popover ${isAvatarDropActive ? "is-drag-active" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsAvatarDropActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setIsAvatarDropActive(false);
                    }
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    setIsAvatarDropActive(false);
                    const droppedFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));

                    if (droppedFile) {
                      await applyAvatarFile(droppedFile);
                    }
                  }}
                >
                  <div className="participant-avatar-popover-copy">
                    <strong>Avatar</strong>
                    <span>Paste a link, import an image, or drag one here.</span>
                  </div>

                  <input
                    className="field mono"
                    value={draftAvatarUrl}
                    onChange={(event) => setDraftAvatarUrl(event.target.value)}
                    placeholder="https://... or /avatars/..."
                  />

                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        await applyAvatarFile(file);
                      }
                      event.target.value = "";
                    }}
                  />

                  <div className="participant-avatar-popover-actions">
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => avatarFileInputRef.current?.click()}
                    >
                      Import image
                    </button>

                    <button
                      type="button"
                      className="action-button action-button-primary"
                      onClick={() => {
                        const nextAvatarUrl = draftAvatarUrl.trim();
                        onChange({ avatarUrl: nextAvatarUrl || undefined, speakingAvatarUrl: undefined });
                        setIsAvatarEditorOpen(false);
                        setIsAvatarDropActive(false);
                      }}
                    >
                      Apply link
                    </button>

                    {participant.avatarUrl ? (
                      <button
                        type="button"
                        className="participant-avatar-clear"
                        onClick={() => {
                          setDraftAvatarUrl("");
                          onChange({ avatarUrl: undefined, speakingAvatarUrl: undefined });
                          setIsAvatarEditorOpen(false);
                          setIsAvatarDropActive(false);
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="participant-sheet-header-copy">
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">{roleLabel}</p>
              <div className="participant-sheet-name-row">
                {isEditingName ? (
                  <input
                    ref={nameInputRef}
                    className="field participant-name-input"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={commitNameEdit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitNameEdit();
                        return;
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        setDraftName(participant.name);
                        setIsEditingName(false);
                      }
                    }}
                    placeholder="Debater name"
                  />
                ) : (
                  <>
                    <h2 className="participant-sheet-name">{participant.name}</h2>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(participant.name);
                        setIsEditingName(true);
                      }}
                      className="participant-name-edit-button"
                      aria-label="Edit participant name"
                      title="Edit participant name"
                    >
                      <PencilGlyph />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="participant-modal-actions">
            {onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                aria-label="Remove participant"
                title="Remove participant"
                className="icon-circle-button participant-modal-delete"
              >
                <TrashGlyph />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close participant settings"
              className="icon-circle-button participant-modal-close"
            >
              <CloseGlyph />
            </button>
          </div>
        </div>

        <div className="participant-modal-body">
          <div className="grid gap-5">
          <FieldShell
            label="Model"
            hint="Choose one of the configured OpenRouter models."
          >
            <select
              className="field mono"
              value={participant.model}
              onChange={(event) => onChange({ model: event.target.value })}
            >
              {SUPPORTED_OPENROUTER_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </FieldShell>

          <div className="grid gap-4">
            <FieldShell label="Role">
              <input
                className="field"
                value={participant.characterProfile.role}
                onChange={(event) => updateCharacterProfile({ role: event.target.value })}
                placeholder="Economist, journalist, minister..."
              />
            </FieldShell>

            <FieldShell label="Personality">
              <input
                className="field"
                value={participant.characterProfile.personality}
                onChange={(event) => updateCharacterProfile({ personality: event.target.value })}
                placeholder="Calm, confrontational, analytical..."
              />
            </FieldShell>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Language">
                <input
                  className="field"
                  value={participant.characterProfile.language}
                  onChange={(event) => updateCharacterProfile({ language: event.target.value })}
                  placeholder="European Portuguese"
                />
              </FieldShell>

              <FieldShell label="Gender">
                <input
                  className="field"
                  value={participant.characterProfile.gender}
                  onChange={(event) => updateCharacterProfile({ gender: event.target.value })}
                  placeholder="Optional"
                />
              </FieldShell>

              <FieldShell label="Nationality">
                <input
                  className="field"
                  value={participant.characterProfile.nationality}
                  onChange={(event) => updateCharacterProfile({ nationality: event.target.value })}
                  placeholder="Optional"
                />
              </FieldShell>

              <FieldShell label="Birth Date">
                <input
                  type="date"
                  className="field"
                  value={participant.characterProfile.birthDate}
                  onChange={(event) => updateCharacterProfile({ birthDate: event.target.value })}
                />
              </FieldShell>
            </div>

            <FieldShell label="Perspective">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.characterProfile.perspective}
                onChange={(event) => updateCharacterProfile({ perspective: event.target.value })}
                placeholder="Core worldview, mission, or governing perspective..."
              />
            </FieldShell>

            <FieldShell label="Temperament">
              <input
                className="field"
                value={participant.characterProfile.temperament}
                onChange={(event) => updateCharacterProfile({ temperament: event.target.value })}
                placeholder="Measured, combative, playful, severe..."
              />
            </FieldShell>

            <FieldShell label="Debate Style">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.characterProfile.debateStyle}
                onChange={(event) => updateCharacterProfile({ debateStyle: event.target.value })}
                placeholder="How this person argues, presses points, and responds..."
              />
            </FieldShell>

            <FieldShell label="Speech Style">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.characterProfile.speechStyle}
                onChange={(event) => updateCharacterProfile({ speechStyle: event.target.value })}
                placeholder="Sentence rhythm, vocabulary, tone, delivery..."
              />
            </FieldShell>

            <FieldShell label="Guardrails">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.characterProfile.guardrails}
                onChange={(event) => updateCharacterProfile({ guardrails: event.target.value })}
                placeholder="What this person should avoid sounding like or doing..."
              />
            </FieldShell>
          </div>

          <FieldShell label="Additional Guidance">
            <span className="mb-2 block text-sm text-[color:var(--muted)]">
              Use only for instructions that do not fit the structured character fields above.
            </span>
            <AutoSizeTextarea
              className="field min-h-28 resize-none overflow-hidden participant-character-input"
              value={participant.characterProfile.promptNotes}
              onChange={(event) => updateCharacterProfile({ promptNotes: event.target.value })}
              placeholder="Anything still not captured by role, perspective, style, or guardrails..."
            />
          </FieldShell>
          </div>

        </div>
      </section>
    </div>
  );
}

function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1000) {
    const compactValue = value / 1000;
    return `${compactValue.toFixed(1)}k`;
  }

  return value.toLocaleString("en-US");
}

function formatUsageCost(value: number): string {
  const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedValue);
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.top = "0";
  fallback.style.left = "-9999px";

  document.body.appendChild(fallback);
  fallback.select();
  fallback.setSelectionRange(0, fallback.value.length);

  const didCopy = document.execCommand("copy");
  document.body.removeChild(fallback);

  if (!didCopy) {
    throw new Error("Clipboard copy failed.");
  }
}

function TranscriptPanel({
  turnCount,
  isRunning,
  markdown,
  thinkingSpeakerName,
  thinkingParticipant,
  showReportLink,
}: {
  turnCount: number;
  isRunning: boolean;
  markdown: string;
  thinkingSpeakerName?: string | null;
  thinkingParticipant?: ParticipantConfig | null;
  showReportLink: boolean;
}) {
  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  function updateTranscriptScrollLock() {
    const body = transcriptBodyRef.current;
    if (!body) {
      return;
    }

    const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= 24;
  }

  useEffect(() => {
    const body = transcriptBodyRef.current;
    if (!body || !shouldStickToBottomRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      const currentBody = transcriptBodyRef.current;
      if (!currentBody || !shouldStickToBottomRef.current) {
        return;
      }

      currentBody.scrollTop = currentBody.scrollHeight;
    });
  }, [markdown]);

  const setCopyFeedback = useCallback((nextState: "copied" | "error") => {
    setCopyState(nextState);

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }

    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimeoutRef.current = null;
    }, 2000);
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await copyTextToClipboard(markdown);
      trackEvent("transcript_copy", {
        turn_count: turnCount,
      });
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("error");
    }
  }, [markdown, setCopyFeedback, turnCount]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const copyButtonLabel =
    copyState === "copied"
      ? "Transcript copied as Markdown"
      : copyState === "error"
        ? "Copy transcript failed"
        : "Copy transcript as Markdown";

  return (
    <article className="transcript-sheet transcript-sheet-inline">
      <div className="transcript-sheet-actions transcript-sheet-actions-top">
        <button
          type="button"
          onClick={handleCopyMarkdown}
          className={`action-button hero-icon-button transcript-copy-button ${copyState === "copied" ? "is-success" : ""} ${copyState === "error" ? "is-error" : ""}`.trim()}
          aria-label={copyButtonLabel}
          title={copyButtonLabel}
        >
          <span className="action-button-icon">
            {copyState === "copied" ? <CheckGlyph /> : <CopyGlyph />}
          </span>
        </button>
      </div>

      <div
        ref={transcriptBodyRef}
        className="transcript-sheet-body transcript-sheet-body-with-top-actions"
        onScroll={updateTranscriptScrollLock}
      >
        <div aria-hidden="true" className="transcript-sheet-copy-clearance" />
        <SimulationNotice className="simulation-notice-transcript" showReportLink={showReportLink} />
        <TranscriptMarkdownContent markdown={markdown} />

        <div className="transcript-sheet-footer">
          <div className="transcript-sheet-actions transcript-sheet-actions-footer">
            {isRunning || turnCount > 0 ? (
              <span className={`transcript-status-chip ${isRunning ? "is-live" : ""}`}>
                {isRunning && thinkingParticipant ? (
                  <ParticipantAvatar
                    name={thinkingParticipant.name}
                    avatarUrl={thinkingParticipant.avatarUrl}
                    className="transcript-status-avatar"
                    fallbackClassName="transcript-status-avatar-fallback"
                    sizes="18px"
                  />
                ) : (
                  <span className="transcript-status-dot" />
                )}
                {isRunning ? (thinkingSpeakerName ? `${thinkingSpeakerName}: thinking...` : "Thinking...") : `${turnCount} turns`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function RawPromptModal({
  frame,
  onClose,
}: {
  frame: PlaybackFrame;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const modalRef = useRef<HTMLElement | null>(null);
  useModalFocusTrap(modalRef, true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-modal-backdrop">
      <button
        type="button"
        className="settings-modal-dismiss"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={modalRef}
        className="settings-sheet settings-modal-panel raw-prompt-modal-panel w-full max-w-4xl p-6 sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-label="Raw prompt"
        tabIndex={-1}
      >
        <div className="settings-modal-header">
          <div className="raw-prompt-modal-copy">
            <p className="hero-kicker">Debug</p>
            <h2 className="hero-panel-title">Raw prompt for {frame.speakerName}</h2>
            <p className="raw-prompt-modal-meta mono">
              {frame.chapterLabel} · bubble {frame.bubbleIndex + 1} of {frame.bubbleCount} · {frame.model}
            </p>
          </div>
          <button
            type="button"
            className="icon-circle-button character-selector-modal-close"
            aria-label="Close raw prompt"
            onClick={onClose}
          >
            <CloseGlyph />
          </button>
        </div>

        <pre className="raw-prompt-modal-pre">{frame.rawPrompt || "No raw prompt was captured for this turn."}</pre>
      </section>
    </div>
  );
}

function ShareConfirmationModal({
  onClose,
  onConfirm,
  isConfirming,
}: {
  onClose: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}) {
  const modalRef = useRef<HTMLElement | null>(null);
  useBodyScrollLock(true);
  useModalFocusTrap(modalRef, true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isConfirming) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfirming, onClose]);

  return (
    <div className="settings-modal-backdrop">
      <button
        type="button"
        className="settings-modal-dismiss"
        aria-hidden="true"
        tabIndex={-1}
        onClick={isConfirming ? undefined : onClose}
      />
      <section
        ref={modalRef}
        className="settings-sheet settings-modal-panel share-confirmation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-confirmation-title"
        tabIndex={-1}
      >
        <div className="settings-modal-header">
          <div className="share-confirmation-copy">
            <p className="hero-kicker">Public Replay</p>
            <h2 id="share-confirmation-title" className="hero-panel-title">
              Create a public replay link?
            </h2>
          </div>
          <button
            type="button"
            className="icon-circle-button character-selector-modal-close"
            aria-label="Close share confirmation"
            onClick={onClose}
            disabled={isConfirming}
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="share-confirmation-body">
          <SimulationNotice />
          <p>
            Anyone with the link can view this replay. It contains AI-generated fictionalized speech and must only be
            shared as an AI parody simulation, not as real quotes, official statements, endorsements, beliefs, or
            positions.
          </p>
          <p>
            By creating the link, you agree that you are not using this replay for unlawful, infringing, defamatory,
            deceptive, harassing, private, confidential, sensitive, or otherwise unethical purposes.
          </p>
        </div>

        <div className="share-confirmation-actions">
          <button type="button" className="action-button" onClick={onClose} disabled={isConfirming}>
            Cancel
          </button>
          <button type="button" className="action-button action-button-primary" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Creating..." : "Create public replay link"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ChamberStage({
  roster,
  plannedRounds,
  usage,
  currentFrame,
  displayedBubbleContent,
  chapters,
  frames,
  activeFrameIndex,
  totalDurationMs,
  isRunning,
  isBubbleStreaming,
  error,
  warning,
  prompt,
  hasSessionStarted,
  panelMode,
  transcriptTurnCount,
  transcriptMarkdown,
  isPlaybackPlaying,
  isAwaitingTurnResponse,
  pendingTurn,
  shareUrl,
  shareError,
  shareActionLabel,
  shareActionCopied,
  shareActionDisabled,
  allowRawPromptDebug,
  isReplayOnly,
  onPanelModeChange,
  onOpenParticipant,
  onExit,
  onShareAction,
  onPausePlayback,
  onTogglePlayback,
  onPreviousFrame,
  onNextFrame,
  onSelectFrame,
}: {
  roster: ParticipantConfig[];
  plannedRounds: number;
  usage: RunResult["usage"];
  currentFrame?: PlaybackFrame;
  displayedBubbleContent: string;
  chapters: TimelineChapter[];
  frames: PlaybackFrame[];
  activeFrameIndex: number;
  totalDurationMs: number;
  isRunning: boolean;
  isBubbleStreaming: boolean;
  error: string | null;
  warning: string | null;
  prompt: string;
  hasSessionStarted: boolean;
  panelMode: StagePanelMode;
  transcriptTurnCount: number;
  transcriptMarkdown: string;
  isPlaybackPlaying: boolean;
  isAwaitingTurnResponse: boolean;
  pendingTurn: PendingTurnPreview | null;
  shareUrl: string | null;
  shareError: string | null;
  shareActionLabel?: string;
  shareActionCopied: boolean;
  shareActionDisabled: boolean;
  allowRawPromptDebug: boolean;
  isReplayOnly: boolean;
  onPanelModeChange: (mode: StagePanelMode) => void;
  onOpenParticipant: (id: string) => void;
  onExit: () => void;
  onShareAction?: () => void;
  onPausePlayback: () => void;
  onTogglePlayback: () => void;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onSelectFrame: (index: number) => void;
}) {
  const plannedQueueTurns = buildPlannedQueueTurns({
    rounds: plannedRounds,
    coordinator: roster[0] ?? createFallbackCoordinator(),
    members: roster.slice(1),
  });
  const hasPlaybackStarted = hasSessionStarted || isRunning || frames.length > 0;
  const queueEntries = buildQueueEntries({
    frames,
    roster,
    plannedTurns: plannedQueueTurns,
    currentFrame,
    hasPlaybackStarted,
    isAwaitingTurnResponse,
    isRunning,
    pendingTurn,
  });
  const activeEntry = queueEntries.find((entry) => entry.state === "speaking") ?? null;
  const thinkingEntry = queueEntries.find((entry) => entry.state === "thinking") ?? null;
  const queuedFocusEntry = activeEntry ?? thinkingEntry ?? queueEntries.find((entry) => entry.state !== "waiting") ?? null;
  const hasPendingFrame = isAwaitingTurnResponse && pendingTurn !== null;
  const isShowingPendingTurn = hasPendingFrame && !currentFrame;
  const maxNavigableFrameIndex = hasPendingFrame ? frames.length : Math.max(frames.length - 1, 0);
  const queueScrollTargetId = (isShowingPendingTurn ? thinkingEntry?.id : activeEntry?.id) ?? thinkingEntry?.id ?? null;
  const pendingParticipant =
    pendingTurn ? roster.find((participant) => participant.id === pendingTurn.speakerId) ?? null : null;
  const focusSpeaker =
    (isShowingPendingTurn ? pendingParticipant : null) ??
    (currentFrame ? roster.find((participant) => participant.id === currentFrame.speakerId) : null) ??
    queuedFocusEntry?.participant ??
    null;
  const visibleQueuedEntry = isShowingPendingTurn ? (thinkingEntry ?? queuedFocusEntry) : queuedFocusEntry;
  const isViewingFinalFrame =
    Boolean(currentFrame) && !isShowingPendingTurn && frames.length > 0 && activeFrameIndex === frames.length - 1;

  const canConfigureActiveSpeaker = false;
  const canGoPrevious = activeFrameIndex > 0;
  const canGoNext = activeFrameIndex < maxNavigableFrameIndex;
  const isPlayButtonActive = isPlaybackPlaying && (isRunning || canGoNext || isBubbleStreaming);
  const [debugFrame, setDebugFrame] = useState<PlaybackFrame | null>(null);
  const isLocalRuntimeDebug = useSyncExternalStore(subscribeToRuntime, isLocalRuntime, () => false);
  const showBubbleDebugButton = allowRawPromptDebug && isLocalRuntimeDebug;
  const activeQueueItemRef = useRef<HTMLDivElement | null>(null);
  const queueListRef = useRef<HTMLDivElement | null>(null);

  function openRawPrompt(frame: PlaybackFrame) {
    onPausePlayback();
    setDebugFrame(frame);
  }

  useEffect(() => {
    if (panelMode !== "conversation" || !queueScrollTargetId) {
      return;
    }

    const queueList = queueListRef.current;
    if (!queueList || queueList.scrollHeight <= queueList.clientHeight + 1) {
      return;
    }

    activeQueueItemRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [panelMode, queueScrollTargetId]);

  return (
    <>
      <section className="chamber-shell">
        <div className="chamber-header">
          <div className="chamber-header-copy">
            <h1 className="chamber-runtime-title">Live debate</h1>
            <p className="chamber-runtime-prompt">{prompt.trim() || "No prompt set yet."}</p>
          </div>
          <div className="chamber-runtime-actions">
            <button type="button" className="chamber-back-button" onClick={onExit}>
              <BackGlyph />
              <span>Back</span>
            </button>
            {hasPlaybackStarted ? (
              <div className="chamber-panel-tools">
                <div className="mode-toggle mode-toggle-compact stage-panel-toggle" aria-label="Stage panel mode">
                  {(["conversation", "transcript"] as const).map((nextPanelMode) => (
                    <button
                      key={nextPanelMode}
                      type="button"
                      onClick={() => onPanelModeChange(nextPanelMode)}
                      className={`mode-toggle-button mode-toggle-button-compact ${panelMode === nextPanelMode ? "is-selected" : ""}`}
                    >
                      {nextPanelMode}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <SimulationNotice className="simulation-notice-stage" showReportLink={isReplayOnly} />

        {hasPlaybackStarted ? (
          <div className={`stage-frame ${panelMode === "transcript" ? "stage-frame-transcript" : ""}`}>
            <div
              className={`cinema-stage ${panelMode === "transcript" ? "cinema-stage-transcript" : panelMode === "conversation" ? "cinema-stage-conversation" : ""}`}
            >
              {panelMode === "conversation" ? (
                <>
                  <div className="cinema-vignette" />
                  <div className="pit-floor-glow" />
                  <aside className="speaker-queue-shell" aria-label="Speaker queue">
                    <div className="speaker-queue-header">
                      <p className="speaker-queue-kicker">Queue</p>
                      <p className="chamber-usage-meta mono speaker-queue-usage" aria-label="Usage">
                        <span>{formatTokenCount(usage.totalTokens)} tokens</span>
                        <span className="chamber-usage-meta-separator" aria-hidden="true">
                          ·
                        </span>
                        <span>{formatUsageCost(usage.cost)}</span>
                      </p>
                    </div>
                    <div ref={queueListRef} className="speaker-queue-list">
                      {queueEntries.length > 0 ? (
                        queueEntries.map(({ id, participant, state, speakerName, model }) => (
                          <div
                            key={id}
                            ref={id === queueScrollTargetId ? activeQueueItemRef : undefined}
                            className={`speaker-queue-item is-${state}`}
                            aria-current={state === "speaking" ? "true" : undefined}
                          >
                            <ParticipantAvatar
                              name={speakerName}
                              avatarUrl={participant?.avatarUrl}
                              className="speaker-queue-avatar"
                              fallbackClassName="speaker-queue-avatar-fallback"
                              sizes="38px"
                            />
                            <span className="speaker-queue-copy">
                              <span className="speaker-queue-name">{speakerName}</span>
                              <span className="speaker-queue-model mono">{model}</span>
                            </span>
                            <span className={`speaker-queue-state speaker-queue-state-${state}`}>
                              {queueStateLabel(state)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="speaker-queue-empty">{isRunning ? "Wrapping up the final turn." : "Debate complete."}</div>
                      )}
                    </div>
                  </aside>
                </>
              ) : null}

              {panelMode === "transcript" ? (
                <TranscriptPanel
                  turnCount={transcriptTurnCount}
                  isRunning={isRunning}
                  markdown={transcriptMarkdown}
                  thinkingSpeakerName={thinkingEntry?.speakerName ?? null}
                  thinkingParticipant={thinkingEntry?.participant ?? null}
                  showReportLink={isReplayOnly}
                />
              ) : (
                <div className="speaker-focus-shell">
                  <div className="speaker-focus-content">
                    <div className="speaker-focus-stack">
                      <div className="speaker-focus-figure">
                        {canConfigureActiveSpeaker && focusSpeaker ? (
                          <button
                            type="button"
                            className="speaker-focus-config"
                            onClick={() => onOpenParticipant(focusSpeaker.id)}
                            aria-label={`Configure ${focusSpeaker.name}`}
                          >
                            <SettingsGlyph />
                          </button>
                        ) : null}

                        <div
                          className={`speaker-focus-avatar ${currentFrame || visibleQueuedEntry ? "is-speaking" : "is-idle"}`}
                          aria-hidden="true"
                        >
                          <span className="speaker-focus-avatar-ring" />
                          <SpeakingParticipantAvatar
                            name={focusSpeaker?.name ?? "The AI Pit"}
                            avatarUrl={focusSpeaker?.avatarUrl}
                            speakingAvatarUrl={focusSpeaker?.speakingAvatarUrl}
                            isSpeaking={Boolean(currentFrame && !isShowingPendingTurn)}
                            className="speaker-focus-avatar-core"
                            fallbackClassName="speaker-focus-avatar-fallback"
                            sizes="(max-width: 768px) 134px, 211px"
                          />
                        </div>

                      </div>

                      <div
                        key={
                          isShowingPendingTurn
                            ? `thinking-${pendingTurn?.speakerId ?? "unknown"}-${pendingTurn?.kind ?? "turn"}-${pendingTurn?.round ?? 0}`
                            : (currentFrame?.id ?? visibleQueuedEntry?.id ?? "speaker-focus-idle")
                        }
                        className={`speaker-focus-bubble ${!currentFrame && !visibleQueuedEntry ? "is-idle" : ""}`}
                      >
                        {currentFrame && !isShowingPendingTurn ? (
                          <article
                            key={currentFrame.id}
                            className={`speaker-focus-bubble-card ${showBubbleDebugButton ? "has-debug-action" : ""}`}
                          >
                            {showBubbleDebugButton ? (
                              <button
                                type="button"
                                className="bubble-debug-button"
                                onClick={() => openRawPrompt(currentFrame)}
                                aria-label="Show raw prompt for this speech bubble"
                              >
                                <PromptGlyph />
                                <span className="bubble-debug-tooltip" aria-hidden="true">
                                  Show raw prompt
                                </span>
                              </button>
                            ) : null}
                            <p className="stage-bubble-speaker">
                              <span>{currentFrame.speakerName}</span>
                            </p>
                            <p className={`stage-bubble-copy ${isBubbleStreaming ? "is-streaming" : ""}`}>
                              {displayedBubbleContent || "\u00a0"}
                            </p>
                            {isViewingFinalFrame && onShareAction && shareActionLabel ? (
                              <div className="speaker-focus-share-cta">
                                <div className="speaker-focus-share-copy">
                                  <p className="speaker-focus-share-kicker">Liked the debate?</p>
                                  <p className="speaker-focus-share-body">
                                    {shareUrl
                                      ? "Share it with others."
                                      : "Create a replay link to share it with others."}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={onShareAction}
                                  disabled={shareActionDisabled}
                                  className={`action-button speaker-focus-share-button ${shareActionCopied ? "action-button-primary" : ""}`.trim()}
                                >
                                  <span className="action-button-icon">
                                    {shareActionCopied ? <CheckGlyph /> : <CopyGlyph />}
                                  </span>
                                  {shareActionLabel}
                                </button>
                              </div>
                            ) : null}
                          </article>
                        ) : visibleQueuedEntry ? (
                          <article className="speaker-focus-bubble-card speaker-focus-bubble-card-muted">
                            <p className="stage-bubble-speaker">{visibleQueuedEntry.speakerName}</p>
                            <p className="stage-bubble-copy stage-bubble-copy-thinking">Thinking...</p>
                          </article>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {panelMode === "conversation" ? (
                <div className="timeline-shell speaker-playbar-shell">
                  <button
                    type="button"
                    className="timeline-button timeline-icon-button"
                    onClick={onPreviousFrame}
                    disabled={!canGoPrevious}
                    aria-label="Previous speech bubble"
                    title="Previous speech bubble"
                  >
                    <PreviousGlyph />
                  </button>

                  <div className="timeline-track-shell">
                    <div className="timeline-marker-row" aria-hidden="true">
                      {chapters.map((chapter) => (
                        <button
                          key={chapter.id}
                          type="button"
                          className="timeline-marker"
                          style={{
                            left:
                              totalDurationMs > 0
                                ? `${Math.min((chapter.timestampMs / totalDurationMs) * 100, 100)}%`
                                : "0%",
                          }}
                          onClick={() => onSelectFrame(chapter.frameIndex)}
                          disabled={frames.length === 0}
                          title={chapter.label}
                        />
                      ))}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(frames.length - 1, 0)}
                      value={Math.min(activeFrameIndex, Math.max(frames.length - 1, 0))}
                      onPointerDown={onPausePlayback}
                      onChange={(event) => {
                        onPausePlayback();
                        onSelectFrame(Number(event.target.value));
                      }}
                      disabled={frames.length < 2}
                      className="timeline-slider"
                      aria-label="Playback timeline"
                    />
                  </div>

                  <div className="timeline-button-group">
                    <button
                      type="button"
                      className={`timeline-button timeline-icon-button ${isPlayButtonActive ? "timeline-button-primary" : ""}`}
                      onClick={onTogglePlayback}
                      aria-label={isPlayButtonActive ? "Pause playback" : "Play playback"}
                      title={isPlayButtonActive ? "Pause playback" : "Play playback"}
                    >
                      {isPlayButtonActive ? <PauseGlyph /> : <PlayGlyph />}
                    </button>

                    <button
                      type="button"
                      className="timeline-button timeline-icon-button"
                      onClick={onNextFrame}
                      disabled={!canGoNext}
                      aria-label="Next speech bubble"
                      title="Next speech bubble"
                    >
                      <NextGlyph />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? <div className="notice-row notice-row-error">{error}</div> : null}
        {shareError ? <div className="notice-row notice-row-error">{shareError}</div> : null}
        {warning ? <div className="notice-row notice-row-warning">{warning}</div> : null}
      </section>

      {debugFrame ? <RawPromptModal frame={debugFrame} onClose={() => setDebugFrame(null)} /> : null}
    </>
  );
}

export function PitStudio({
  initialState,
}: {
  initialState: InitialStudioState;
}) {
  const initialStudioStateRef = useRef<InitialStudioState>(initialState);
  const initialStudioState = initialStudioStateRef.current;
  const [config, setConfig] = useState<RunInput>(initialStudioState.config);
  const [audience] = useState<PresetAudience>(initialStudioState.audience);
  const [lineupOrder, setLineupOrder] = useState<string[]>(initialStudioState.lineupOrder);
  const [starterBundleId, setStarterBundleId] = useState<string | undefined>(initialStudioState.starterBundleId);
  const [result, setResult] = useState<RunResult | null>(initialStudioState.initialResult);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [apiKey, setApiKey] = useState(initialStudioState.apiKey);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>(initialStudioState.apiKeyStatus);
  const [apiKeyStatusMessage, setApiKeyStatusMessage] = useState(initialStudioState.apiKeyStatusMessage);
  const [draftApiKey, setDraftApiKey] = useState(initialStudioState.draftApiKey);
  const [showCharacterSelectorModal, setShowCharacterSelectorModal] = useState(false);
  const [studioView, setStudioView] = useState<StudioView>(initialStudioState.initialStudioView);
  const [panelMode, setPanelMode] = useState<StagePanelMode>("conversation");
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [completedBubbleIds, setCompletedBubbleIds] = useState<Record<string, true>>({});
  const [revealedBubbleId, setRevealedBubbleId] = useState<string | null>(null);
  const [revealedBubbleChars, setRevealedBubbleChars] = useState(0);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(true);
  const [frameCompletedAt, setFrameCompletedAt] = useState<number | null>(null);
  const [isAwaitingTurnResponse, setIsAwaitingTurnResponse] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingTurnPreview | null>(null);
  const [activeRuntimeTurn, setActiveRuntimeTurn] = useState<RuntimeTurnIdentity | null>(null);
  const [activeWarning, setActiveWarning] = useState<RuntimeWarningNotice | null>(null);
  const [submittedRunInput, setSubmittedRunInput] = useState<RunInput | null>(
    initialStudioState.initialResult ? initialStudioState.config : null,
  );
  const [shareUrl, setShareUrl] = useState<string | null>(initialStudioState.shareUrl);
  const [shareState, setShareState] = useState<"idle" | "uploading" | "copied">("idle");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareNotice] = useState<string | null>(initialStudioState.shareNotice);
  const [isShareConfirmationOpen, setIsShareConfirmationOpen] = useState(false);
  const [isReplayOnly] = useState(initialStudioState.isReplayOnly);
  const keyValidationRequestIdRef = useRef(0);
  const configRef = useRef(initialStudioState.config);
  const hasHydratedPresetConfigRef = useRef(false);
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);
  const generatedTurnCountRef = useRef(0);
  const acknowledgedTurnCountRef = useRef(0);
  const bufferedTurnWaitersRef = useRef(new Set<() => void>());

  const roster = [config.coordinator, ...config.members];
  const orderedRoster = orderParticipants(roster, lineupOrder);
  const activePresetIds = new Set(
    roster.flatMap((participant) => (participant.presetId ? [participant.presetId] : [])),
  );
  const hasApiKey = apiKey.trim().length > 0;
  const hasValidatedApiKey =
    apiKeyStatus === "valid" && (!draftApiKey.trim() || draftApiKey.trim() === apiKey.trim());
  const hasPrompt = config.prompt.trim().length > 0;
  const transcriptTurns = flattenTurns(result);
  const transcriptPrompt = result?.prompt ?? config.prompt;
  const [transcriptMarkdown, setTranscriptMarkdown] = useState("");
  const deferredTranscriptMarkdown = useDeferredValue(transcriptMarkdown);
  const timeline = buildPlaybackTimeline(result);
  const frames = timeline.frames;
  const playbackTurnIds = buildPlaybackTurnIds(frames);
  const chapters = timeline.chapters;
  const totalDurationMs = timeline.totalDurationMs;
  const hasPendingFrame = isAwaitingTurnResponse && pendingTurn !== null;
  const pendingFrameIndex = frames.length;
  const maxNavigableFrameIndex = hasPendingFrame ? pendingFrameIndex : Math.max(frames.length - 1, 0);
  const currentFrame =
    hasPendingFrame && activeFrameIndex === pendingFrameIndex
      ? undefined
      : frames[Math.min(activeFrameIndex, Math.max(frames.length - 1, 0))];
  const editableParticipant = roster.find((participant) => participant.id === activeEditorId) ?? null;
  const isTransportEnabled = panelMode === "conversation";
  const isPlaybackActive = panelMode === "transcript" ? true : isPlaybackPlaying;
  const isBubbleStreaming =
    Boolean(currentFrame) && revealedBubbleChars < (currentFrame?.bubbleContent.length ?? 0);
  const displayedBubbleContent = currentFrame
    ? currentFrame.bubbleContent.slice(0, Math.min(revealedBubbleChars, currentFrame.bubbleContent.length))
    : "";
  const visibleWarning =
    activeWarning && shouldDisplayRuntimeWarning(activeWarning, activeRuntimeTurn) ? activeWarning.message : null;
  const acknowledgedTurnCount =
    currentFrame
      ? Math.max(0, playbackTurnIds.findIndex((turnId) => turnId === currentFrame.turnId))
      : hasPendingFrame
        ? playbackTurnIds.length
      : 0;
  const canShareCompletedRun =
    submittedRunInput !== null && result !== null && !isRunning && isCompletedRunResult(submittedRunInput, result);
  const showShareAction = canShareCompletedRun && (!!shareUrl || !isReplayOnly);
  const shareActionLabel =
    shareState === "uploading" ? "Sharing..." : shareState === "copied" ? "Link copied" : shareUrl ? "Copy link" : "Share";

  const releaseBufferedTurnWaiters = useCallback(() => {
    if (generatedTurnCountRef.current - acknowledgedTurnCountRef.current >= 2) {
      return;
    }

    const waiters = [...bufferedTurnWaitersRef.current];
    bufferedTurnWaitersRef.current.clear();
    waiters.forEach((resolve) => resolve());
  }, []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    try {
      const storedApiKey = window.localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY);
      if (storedApiKey !== null) {
        setDraftApiKey(storedApiKey);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const trimmed = draftApiKey.trim();
    setError(null);

    try {
      if (trimmed) {
        window.localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
      }
    } catch {}

    setApiKey("");

    if (!trimmed) {
      keyValidationRequestIdRef.current += 1;
      setApiKeyStatus("valid");
      setApiKeyStatusMessage(HOSTED_OPENROUTER_KEY_MESSAGE);
      return;
    }

    if (!OPENROUTER_API_KEY_PATTERN.test(trimmed)) {
      keyValidationRequestIdRef.current += 1;
      setApiKeyStatus("invalid");
      setApiKeyStatusMessage(INVALID_OPENROUTER_KEY_FORMAT_MESSAGE);
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      void validateApiKey({
        nextApiKey: trimmed,
        requestIdRef: keyValidationRequestIdRef,
        siteUrl: window.location.origin,
        setApiKeyStatus,
        setApiKeyStatusMessage,
      }).then((isValid) => {
        if (isCancelled) {
          return;
        }

        if (isValid) {
          setApiKey(trimmed);
          try {
            window.localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, trimmed);
          } catch {}
        }
      });
    }, OPENROUTER_API_KEY_VALIDATION_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [draftApiKey]);

  useEffect(() => {
    const currentRoster = [config.coordinator, ...config.members];
    setLineupOrder((current) => syncLineupOrder(current, currentRoster));
  }, [config.coordinator, config.members]);

  useEffect(() => {
    if (activeEditorId && !editableParticipant) {
      setActiveEditorId(null);
    }
  }, [activeEditorId, editableParticipant]);

  useEffect(() => {
    if (activeFrameIndex > maxNavigableFrameIndex) {
      setActiveFrameIndex(maxNavigableFrameIndex);
    }
  }, [activeFrameIndex, maxNavigableFrameIndex]);

  useEffect(() => {
    acknowledgedTurnCountRef.current = acknowledgedTurnCount;
    releaseBufferedTurnWaiters();
  }, [acknowledgedTurnCount, releaseBufferedTurnWaiters]);

  useEffect(() => {
    if (!currentFrame) {
      if (revealedBubbleId !== null || revealedBubbleChars !== 0 || frameCompletedAt !== null) {
        setRevealedBubbleId(null);
        setRevealedBubbleChars(0);
        setFrameCompletedAt(null);
      }
      return;
    }

    if (revealedBubbleId !== currentFrame.id) {
      setRevealedBubbleId(currentFrame.id);
      setRevealedBubbleChars(
        isPlaybackActive && !completedBubbleIds[currentFrame.id] ? 0 : currentFrame.bubbleContent.length,
      );
      setFrameCompletedAt(null);
    }
  }, [completedBubbleIds, currentFrame, frameCompletedAt, isPlaybackActive, revealedBubbleChars, revealedBubbleId]);

  useEffect(() => {
    if (!currentFrame || revealedBubbleChars < currentFrame.bubbleContent.length) {
      return;
    }

    if (!completedBubbleIds[currentFrame.id]) {
      setCompletedBubbleIds((current) => ({ ...current, [currentFrame.id]: true }));
    }

    if (frameCompletedAt === null) {
      setFrameCompletedAt(Date.now());
    }
  }, [completedBubbleIds, currentFrame, frameCompletedAt, revealedBubbleChars]);

  useEffect(() => {
    if (!currentFrame || revealedBubbleId !== currentFrame.id || !isPlaybackActive) {
      return;
    }

    if (revealedBubbleChars >= currentFrame.bubbleContent.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRevealedBubbleChars((current) =>
        Math.min(current + bubbleRevealIncrement(currentFrame.bubbleContent), currentFrame.bubbleContent.length),
      );
    }, 18);

    return () => window.clearTimeout(timeoutId);
  }, [currentFrame, isPlaybackActive, revealedBubbleChars, revealedBubbleId]);

  useEffect(() => {
    if (shareState !== "copied") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShareState("idle");
    }, 1_800);

    return () => window.clearTimeout(timeoutId);
  }, [shareState]);

  useEffect(() => {
    let isMounted = true;

    if (studioView !== "simulation") {
      setTranscriptMarkdown("");
      return () => {
        isMounted = false;
      };
    }

    void import("@/lib/transcript-markdown").then(({ buildTranscriptMarkdown }) => {
      if (!isMounted) {
        return;
      }

      setTranscriptMarkdown(
        buildTranscriptMarkdown({
          prompt: transcriptPrompt,
          turns: transcriptTurns,
          isRunning,
          chapterLabelForTurn,
        }),
      );
    });

    return () => {
      isMounted = false;
    };
  }, [isRunning, studioView, transcriptPrompt, transcriptTurns]);

  useEffect(() => {
    if (!isPlaybackActive || !currentFrame || revealedBubbleId !== currentFrame.id) {
      return;
    }

    if (revealedBubbleChars < currentFrame.bubbleContent.length || frameCompletedAt === null) {
      return;
    }

    const nextIndex = activeFrameIndex + 1;
    if (nextIndex > maxNavigableFrameIndex) {
      return;
    }

    const remainingDelay = Math.max(0, frameCompletedAt + bubbleHoldDuration(currentFrame.bubbleContent) - Date.now());
    const timeoutId = window.setTimeout(() => {
      setActiveFrameIndex(nextIndex);
    }, remainingDelay);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeFrameIndex,
    currentFrame,
    frames.length,
    frameCompletedAt,
    isPlaybackActive,
    maxNavigableFrameIndex,
    revealedBubbleId,
    revealedBubbleChars,
  ]);

  function updateCoordinator(patch: Partial<ParticipantConfig>) {
    setStarterBundleId(undefined);
    setConfig((current) => ({
      ...current,
      coordinator: { ...current.coordinator, ...patch },
    }));
  }

  function updateMember(id: string, patch: Partial<ParticipantConfig>) {
    setStarterBundleId(undefined);
    setConfig((current) => ({
      ...current,
      members: current.members.map((member) => (member.id === id ? { ...member, ...patch } : member)),
    }));
  }

  function addMemberFromPreset(preset: ParticipantCharacterPreset) {
    hasHydratedPresetConfigRef.current = true;
    setStarterBundleId(undefined);
    setConfig((current) => addParticipantToLineup(current, preset));
  }

  function selectModerator(id: string) {
    setStarterBundleId(undefined);
    setConfig((current) => promoteParticipantToModerator(current, id));
  }

  function removeParticipant(id: string) {
    setStarterBundleId(undefined);
    setConfig((current) => removeParticipantFromLineup(current, id));
  }

  async function ensureHydratedConfig(): Promise<RunInput> {
    if (hasHydratedPresetConfigRef.current) {
      return configRef.current;
    }

    const { hydrateRunInputFromPresets } = await import("@/lib/pit");
    const hydratedConfig = hydrateRunInputFromPresets(configRef.current);
    hasHydratedPresetConfigRef.current = true;
    configRef.current = hydratedConfig;
    setConfig(hydratedConfig);
    return hydratedConfig;
  }

  async function openParticipantEditor(id: string) {
    await ensureHydratedConfig();
    setActiveEditorId(id);
  }

  async function rerollTopic() {
    const { listStarterBundles } = await import("@/lib/pit");
    const bundles = listStarterBundles(audience);
    const currentPrompt = configRef.current.prompt.trim();
    const eligibleBundles = bundles.filter((bundle) => bundle.prompt !== currentPrompt);
    const bundlePool = eligibleBundles.length > 0 ? eligibleBundles : bundles;
    const nextBundle = bundlePool[Math.floor(Math.random() * bundlePool.length)];

    if (!nextBundle) {
      return;
    }

    setStarterBundleId(undefined);
    setConfig((current) => ({ ...current, prompt: nextBundle.prompt }));
    trackEvent("starter_topic_reroll", {
      starter_bundle_id: nextBundle.id,
      starter_bundle_audience: nextBundle.audience,
    });
  }

  async function rerollDebaters() {
    const { createRandomStarterInput } = await import("@/lib/pit");
    const nextStarter = createRandomStarterInput(starterBundleId, audience);
    const nextConfig = {
      ...configRef.current,
      coordinator: nextStarter.input.coordinator,
      members: nextStarter.input.members,
    };

    hasHydratedPresetConfigRef.current = true;
    configRef.current = nextConfig;
    setStarterBundleId(undefined);
    setConfig(nextConfig);
    trackEvent("starter_debaters_reroll", {
      starter_bundle_id: nextStarter.bundle.id,
      starter_bundle_audience: nextStarter.bundle.audience,
    });
  }

  function handleDraftApiKeyChange(value: string) {
    setDraftApiKey(value);
  }

  function selectFrame(index: number) {
    setActiveFrameIndex(Math.max(0, Math.min(index, maxNavigableFrameIndex)));
    setFrameCompletedAt(null);
  }

  const showCurrentBubbleFully = useCallback(() => {
    if (!currentFrame) {
      return;
    }

    setRevealedBubbleId(currentFrame.id);
    setRevealedBubbleChars(currentFrame.bubbleContent.length);
    setCompletedBubbleIds((current) => ({ ...current, [currentFrame.id]: true }));
    setFrameCompletedAt(Date.now());
  }, [currentFrame]);

  const pausePlayback = useCallback(() => {
    if (!isPlaybackPlaying) {
      return;
    }

    showCurrentBubbleFully();
    setIsPlaybackPlaying(false);
  }, [isPlaybackPlaying, showCurrentBubbleFully]);

  function togglePlayback() {
    if (isPlaybackPlaying) {
      pausePlayback();
      return;
    }

    if (currentFrame) {
      setFrameCompletedAt(revealedBubbleChars >= currentFrame.bubbleContent.length ? Date.now() : null);
    }
    setIsPlaybackPlaying(true);
  }

  function selectPreviousFrame() {
    if (activeFrameIndex === 0) {
      return;
    }

    selectFrame(activeFrameIndex - 1);
  }

  function selectNextFrame() {
    if (activeFrameIndex >= maxNavigableFrameIndex) {
      return;
    }

    selectFrame(activeFrameIndex + 1);
  }

  const resetSimulationState = useCallback(() => {
    bufferedTurnWaitersRef.current.clear();
    generatedTurnCountRef.current = 0;
    acknowledgedTurnCountRef.current = 0;
    setStudioView("setup");
    setPanelMode("conversation");
    setResult(null);
    setError(null);
    setIsRunning(false);
    setActiveFrameIndex(0);
    setIsPlaybackPlaying(true);
    setCompletedBubbleIds({});
    setRevealedBubbleId(null);
    setRevealedBubbleChars(0);
    setFrameCompletedAt(null);
    setIsAwaitingTurnResponse(false);
    setPendingTurn(null);
    setActiveRuntimeTurn(null);
    setActiveWarning(null);
    setSubmittedRunInput(null);
    setShareUrl(null);
    setShareState("idle");
    setShareError(null);
    setIsShareConfirmationOpen(false);
  }, []);

  const exitSimulation = useCallback(() => {
    if (isReplayOnly) {
      window.location.assign("/");
      return;
    }

    const activeResult = result;
    const activeConfig = config;

    if (isRunning) {
      trackEvent("pit_cancel", {
        debater_count: activeConfig.members.length,
        completed_turn_count: flattenTurns(activeResult).length,
      });
    }

    activeRunIdRef.current += 1;
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = null;
    resetSimulationState();
  }, [config, isReplayOnly, isRunning, resetSimulationState, result]);

  async function createPublicReplayLink() {
    if (shareState === "uploading") {
      return;
    }

    if (shareUrl) {
      try {
        await copyTextToClipboard(shareUrl);
        setShareState("copied");
        setShareError(null);
      } catch (copyError) {
        setShareState("idle");
        setShareError(copyError instanceof Error ? copyError.message : "Failed to copy the share link.");
      }
      return;
    }

    if (!submittedRunInput || !result || isReplayOnly) {
      return;
    }

    setShareState("uploading");
    setShareError(null);
    setIsShareConfirmationOpen(false);

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: submittedRunInput,
          result,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "Failed to create a shared conversation.";

        throw new Error(
          errorMessage,
        );
      }

      if (!isShareResponse(payload)) {
        throw new Error("The server returned an invalid share response.");
      }

      setShareUrl(payload.url);

      try {
        await copyTextToClipboard(payload.url);
        setShareState("copied");
      } catch {
        setShareState("idle");
        setShareError("Share link created. Use Copy link to try again.");
      }
    } catch (shareRequestError) {
      setShareState("idle");
      setShareError(
        shareRequestError instanceof Error ? shareRequestError.message : "Failed to create a shared conversation.",
      );
    }
  }

  async function handleShareAction() {
    if (shareState === "uploading") {
      return;
    }

    if (shareUrl) {
      await createPublicReplayLink();
      return;
    }

    if (!submittedRunInput || !result || isReplayOnly) {
      return;
    }

    setShareError(null);
    setIsShareConfirmationOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReplayOnly) {
      return;
    }

    if (!hasPrompt) {
      setError("Enter a prompt before starting The AI Pit.");
      return;
    }

    if (!hasValidatedApiKey) {
      setError("Enter a valid OpenRouter API key before starting The AI Pit.");
      return;
    }

    runAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    runAbortControllerRef.current = abortController;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

    window.scrollTo({ top: 0, behavior: "auto" });
    setStudioView("simulation");
    setPanelMode("conversation");
    setError(null);
    setActiveFrameIndex(0);
    setIsPlaybackPlaying(true);
    setCompletedBubbleIds({});
    setRevealedBubbleId(null);
    setRevealedBubbleChars(0);
    setFrameCompletedAt(null);
    setIsAwaitingTurnResponse(true);
    setPendingTurn(null);
    setActiveRuntimeTurn(null);
    setActiveWarning(null);
    setShareUrl(null);
    setShareState("idle");
    setShareError(null);
    setIsShareConfirmationOpen(false);
    bufferedTurnWaitersRef.current.clear();
    generatedTurnCountRef.current = 0;
    acknowledgedTurnCountRef.current = 0;
    const hydratedConfig = await ensureHydratedConfig();
    const payload: RunInput = {
      ...PIT_RUN_DEFAULTS,
      ...hydratedConfig,
      mode: "debate",
      coordinator: hydratedConfig.coordinator,
      members: shuffleParticipants(hydratedConfig.members),
    };
    setSubmittedRunInput(payload);

    trackEvent("pit_start", {
      starter_bundle_id: starterBundleId,
      debater_count: payload.members.length,
      round_count: payload.rounds,
      moderator_model: payload.coordinator.model,
      uses_personal_key: apiKey ? 1 : 0,
    });

    setResult({
      mode: payload.mode,
      prompt: payload.prompt,
      roster: createRosterSnapshot(payload),
      rounds: [],
      usage: emptyUsage(),
      warnings: [],
    });
    setIsRunning(true);

    try {
      const { runPitWorkflow } = await import("@/lib/pit-engine");
      const resultPayload = await runPitWorkflow(payload, {
        apiKey,
        siteUrl: window.location.origin,
        signal: abortController.signal,
        awaitBufferedTurnSlot: async ({ signal }) => {
          if (generatedTurnCountRef.current - acknowledgedTurnCountRef.current < 2) {
            return;
          }

          await new Promise<void>((resolve, reject) => {
            function cleanup() {
              bufferedTurnWaitersRef.current.delete(handleReady);
              signal?.removeEventListener("abort", handleAbort);
            }

            function handleReady() {
              cleanup();
              resolve();
            }

            function handleAbort() {
              cleanup();
              reject(new DOMException("The operation was aborted.", "AbortError"));
            }

            bufferedTurnWaitersRef.current.add(handleReady);
            signal?.addEventListener("abort", handleAbort, { once: true });
          });
        },
        onProgress: (progressEvent) => {
          if (activeRunIdRef.current !== runId) {
            return;
          }
          applyProgressEvent(progressEvent);
        },
      });

      if (activeRunIdRef.current === runId) {
        setResult(resultPayload);
        trackEvent("pit_complete", {
          debater_count: resultPayload.roster.length - 1,
          turn_count: flattenTurns(resultPayload).length,
          total_tokens: resultPayload.usage.totalTokens,
          total_cost_usd: Number(resultPayload.usage.cost.toFixed(4)),
        });
      }
    } catch (submissionError) {
      if (activeRunIdRef.current !== runId || isAbortError(submissionError)) {
        return;
      }

      trackEvent("pit_error", {
        debater_count: config.members.length,
      });
      setError(submissionError instanceof Error ? submissionError.message : "The AI Pit run failed.");
    } finally {
      if (activeRunIdRef.current === runId) {
        runAbortControllerRef.current = null;
        setIsRunning(false);
        setIsAwaitingTurnResponse(false);
        setPendingTurn(null);
        setActiveRuntimeTurn(null);
      }
    }
  }

  const handleTransportKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    if (event.key === " " || event.code === "Space") {
      event.preventDefault();

      if (isPlaybackPlaying) {
        pausePlayback();
      } else {
        if (currentFrame) {
          setFrameCompletedAt(revealedBubbleChars >= currentFrame.bubbleContent.length ? Date.now() : null);
        }
        setIsPlaybackPlaying(true);
      }
      return;
    }

    if (event.key === "Enter" || event.key === "ArrowRight") {
      event.preventDefault();
      if (activeFrameIndex < maxNavigableFrameIndex) {
        setActiveFrameIndex(activeFrameIndex + 1);
        setFrameCompletedAt(null);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (activeFrameIndex > 0) {
        setActiveFrameIndex(activeFrameIndex - 1);
        setFrameCompletedAt(null);
      }
    }
  });

  useEffect(() => {
    if (studioView !== "simulation" || !isTransportEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      handleTransportKeyDown(event);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTransportEnabled, studioView]);

  useEffect(() => {
    return () => {
      runAbortControllerRef.current?.abort();
    };
  }, []);

  function applyProgressEvent(event: RunProgressEvent) {
    if (event.type === "thinking") {
      setIsAwaitingTurnResponse(true);
      setPendingTurn(event);
      setActiveRuntimeTurn({
        speakerId: event.speakerId,
        kind: event.kind,
        round: event.round,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              roster: current.roster.map((participant) =>
                participant.id === event.speakerId ? { ...participant, model: event.model } : participant,
              ),
            }
          : current,
      );
      return;
    }

    if (event.type === "stream") {
      setResult((current) =>
        current
          ? upsertTurnIntoResult(
              {
                ...current,
                roster: current.roster.map((participant) =>
                  participant.id === event.turn.speakerId ? { ...participant, model: event.turn.model } : participant,
                ),
              },
              event.turn,
            )
          : current,
      );
      return;
    }

    if (event.type === "status") {
      return;
    }

    if (event.type === "warning") {
      setActiveWarning({
        message: event.warning,
        speakerId: event.speakerId,
        kind: event.kind,
        round: event.round,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              warnings: [...current.warnings, event.warning],
            }
          : current,
      );
      return;
    }

    setIsAwaitingTurnResponse(false);
    setPendingTurn(null);
    setActiveRuntimeTurn(null);
    generatedTurnCountRef.current += 1;
    releaseBufferedTurnWaiters();

    setResult((current) => {
      if (!current) {
        return current;
      }

      const next = {
        ...current,
        usage: addUsage(current.usage, event.usage),
      };
      return upsertTurnIntoResult(next, event.turn);
    });
  }

  return (
    <main className="studio-page">
      {shareNotice ? <div className="notice-row notice-row-warning">{shareNotice}</div> : null}
      <form
        onSubmit={handleSubmit}
        className={`studio-form flex w-full flex-col gap-5 px-2 py-2 sm:px-5 lg:px-6 lg:py-3 ${
          studioView === "simulation" ? "studio-form-simulation" : "mx-auto max-w-[90rem]"
        }`}
      >
        {studioView === "setup" ? (
          <StudioHero
            roster={orderedRoster}
            config={config}
            apiKeyStatus={apiKeyStatus}
            apiKeyStatusMessage={apiKeyStatusMessage}
            draftApiKey={draftApiKey}
            hasApiKey={hasApiKey || apiKeyStatus === "valid"}
            canSubmit={!isReplayOnly && hasValidatedApiKey && hasPrompt && config.members.length >= 2}
            isRunning={isRunning}
            onDraftApiKeyChange={handleDraftApiKeyChange}
            onPromptChange={(prompt) => setConfig((current) => ({ ...current, prompt }))}
            onRerollDebaters={rerollDebaters}
            onRerollTopic={rerollTopic}
            onAddMember={() => setShowCharacterSelectorModal(true)}
            onSelectModerator={selectModerator}
            onOpenParticipant={openParticipantEditor}
          />
        ) : (
          <ChamberStage
            roster={result?.roster ?? roster}
            plannedRounds={submittedRunInput?.rounds ?? config.rounds}
            usage={result?.usage ?? emptyUsage()}
            currentFrame={currentFrame}
            displayedBubbleContent={displayedBubbleContent}
            chapters={chapters}
            frames={frames}
            activeFrameIndex={activeFrameIndex}
            totalDurationMs={totalDurationMs}
            isRunning={isRunning}
            isBubbleStreaming={isBubbleStreaming}
            error={error}
            warning={visibleWarning}
            prompt={config.prompt}
            hasSessionStarted={studioView === "simulation"}
            panelMode={panelMode}
            transcriptTurnCount={transcriptTurns.length}
            transcriptMarkdown={deferredTranscriptMarkdown}
            isPlaybackPlaying={isPlaybackPlaying}
            isAwaitingTurnResponse={isAwaitingTurnResponse}
            pendingTurn={pendingTurn}
            shareUrl={shareUrl}
            shareError={shareError}
            shareActionLabel={showShareAction ? shareActionLabel : undefined}
            shareActionCopied={shareState === "copied"}
            shareActionDisabled={shareState === "uploading"}
            allowRawPromptDebug={!isReplayOnly}
            isReplayOnly={isReplayOnly}
            onPanelModeChange={setPanelMode}
            onOpenParticipant={openParticipantEditor}
            onExit={exitSimulation}
            onShareAction={showShareAction ? handleShareAction : undefined}
            onPausePlayback={pausePlayback}
            onTogglePlayback={togglePlayback}
            onPreviousFrame={selectPreviousFrame}
            onNextFrame={selectNextFrame}
            onSelectFrame={selectFrame}
          />
        )}
      </form>

      {showCharacterSelectorModal ? (
        <CharacterSelectorModal
          activePresetIds={activePresetIds}
          onClose={() => setShowCharacterSelectorModal(false)}
          onSelectPreset={(preset) => {
            if (activePresetIds.has(preset.id)) {
              return;
            }

            trackEvent("character_added", {
              preset_id: preset.id,
              debater_count: roster.length,
            });
            addMemberFromPreset(preset);
            setShowCharacterSelectorModal(false);
          }}
        />
      ) : null}

      {editableParticipant ? (
        <ParticipantSettingsSheet
          key={editableParticipant.id}
          roleLabel={editableParticipant.id === config.coordinator.id ? "Moderator" : "Debater"}
          participant={editableParticipant}
          onChange={(patch) => {
            if (editableParticipant.id === config.coordinator.id) {
              updateCoordinator(patch);
              return;
            }

            updateMember(editableParticipant.id, patch);
          }}
          onClose={() => setActiveEditorId(null)}
          onRemove={
            roster.length <= 1
              ? undefined
              : () => {
                  removeParticipant(editableParticipant.id);
                  setActiveEditorId(null);
                }
          }
        />
      ) : null}

      {isShareConfirmationOpen ? (
        <ShareConfirmationModal
          isConfirming={shareState === "uploading"}
          onClose={() => setIsShareConfirmationOpen(false)}
          onConfirm={() => {
            void createPublicReplayLink();
          }}
        />
      ) : null}
    </main>
  );
}
