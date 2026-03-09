"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import ReactMarkdown from "react-markdown";
import {
  DEFAULT_PRESET_MODEL,
  MODEL_SUGGESTIONS,
  addUsage,
  createRosterSnapshot,
  createDefaultInput,
  createMember,
  emptyUsage,
  generateControversialPrompt,
  type PitTurn,
  type ParticipantConfig,
  type RunInput,
  type RunResult,
} from "@/lib/pit";
import { OPENROUTER_FREE_MODEL, missingOpenRouterKeyMessage, validateOpenRouterKey } from "@/lib/openrouter";
import { runPitWorkflow, type RunProgressEvent } from "@/lib/pit-engine";
import { buildPersonaProfilePreview } from "@/lib/persona-profile";
import { filterParticipantPersonaPresets, type ParticipantPersonaPreset } from "@/lib/persona-presets";

const OPENROUTER_KEY_STORAGE = "llmpit.openrouter.key";
const DEFAULT_OPENROUTER_API_KEY =
  "***REMOVED***";

type ApiKeyStatus = "empty" | "checking" | "valid" | "invalid";

function emptyApiKeyStatusMessage(): string {
  return missingOpenRouterKeyMessage();
}

async function validateStoredApiKey({
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

  if (!trimmed) {
    requestIdRef.current += 1;
    setApiKeyStatus("empty");
    setApiKeyStatusMessage(emptyApiKeyStatusMessage());
    return false;
  }

  const requestId = requestIdRef.current + 1;
  requestIdRef.current = requestId;
  setApiKeyStatus("checking");
  setApiKeyStatusMessage("Validating API key with OpenRouter...");

  try {
    const validation = await validateOpenRouterKey(nextApiKey, siteUrl);
    if (requestIdRef.current !== requestId) {
      return validation.valid;
    }

    setApiKeyStatus(validation.valid ? "valid" : "invalid");
    setApiKeyStatusMessage(validation.message);
    return validation.valid;
  } catch (validationError) {
    if (requestIdRef.current !== requestId) {
      return false;
    }

    setApiKeyStatus("invalid");
    setApiKeyStatusMessage(
      `${validationError instanceof Error ? validationError.message : "Could not validate this API key."} Add a valid OpenRouter key to run debates.`,
    );
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
  persona: string;
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
  state: "active" | "ready" | "thinking";
  frameIndex: number | null;
};

type StagePanelMode = "conversation" | "transcript";
type StudioView = "setup" | "simulation";

function maskApiKey(value: string): string {
  return ".".repeat(value.length);
}

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

  return [
    ...(result.opening ? [result.opening] : []),
    ...(result.rounds?.flatMap((round) => [...round.turns, ...(round.intervention ? [round.intervention] : [])]) ?? []),
    ...(result.synthesis ? [result.synthesis] : []),
    ...(result.consensus ? [result.consensus] : []),
  ];
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
        persona: turn.persona,
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
  isAwaitingFirstTurn,
  isRunning,
}: {
  frames: PlaybackFrame[];
  roster: ParticipantConfig[];
  plannedTurns: PlannedQueueTurn[];
  currentFrame?: PlaybackFrame;
  isAwaitingFirstTurn: boolean;
  isRunning: boolean;
}): QueueEntry[] {
  const participantById = new Map(roster.map((participant) => [participant.id, participant]));
  const actualTurnStarts = frames.reduce<Array<{ frame: PlaybackFrame; frameIndex: number }>>((entries, frame, frameIndex) => {
    if (entries[entries.length - 1]?.frame.turnId === frame.turnId) {
      return entries;
    }

    entries.push({ frame, frameIndex });
    return entries;
  }, []);

  if (!currentFrame) {
    if (!isAwaitingFirstTurn) {
      return [];
    }

    return plannedTurns.slice(actualTurnStarts.length).map((plannedTurn, index) => ({
      id: plannedTurn.id,
      kind: plannedTurn.kind,
      speakerName: plannedTurn.speakerName,
      model: plannedTurn.model,
      chapterLabel: plannedTurn.chapterLabel,
      participant: participantById.get(plannedTurn.speakerId) ?? null,
      state: index === 0 ? "thinking" : "ready",
      frameIndex: null,
    }));
  }

  const currentTurnIndex = actualTurnStarts.findIndex(({ frame }) => frame.turnId === currentFrame.turnId);
  const visibleActualTurns = (currentTurnIndex >= 0 ? actualTurnStarts.slice(currentTurnIndex) : actualTurnStarts).map(
    ({ frame, frameIndex }, index) => ({
      id: frame.id,
      kind: frame.kind,
      speakerName: frame.speakerName,
      model: frame.model,
      chapterLabel: frame.chapterLabel,
      participant: participantById.get(frame.speakerId) ?? null,
      state: index === 0 ? ("active" as const) : ("ready" as const),
      frameIndex,
    }),
  );

  const remainingPlannedTurns = plannedTurns.slice(actualTurnStarts.length).map((plannedTurn, index) => ({
    id: plannedTurn.id,
    kind: plannedTurn.kind,
    speakerName: plannedTurn.speakerName,
    model: plannedTurn.model,
    chapterLabel: plannedTurn.chapterLabel,
    participant: participantById.get(plannedTurn.speakerId) ?? null,
    state: isRunning && index === 0 ? ("thinking" as const) : ("ready" as const),
    frameIndex: null,
  }));

  return [...visibleActualTurns, ...remainingPlannedTurns];
}

function participantInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function ParticipantAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
  imageClassName,
  decorative = true,
}: {
  name: string;
  avatarUrl?: string;
  className: string;
  fallbackClassName?: string;
  imageClassName?: string;
  decorative?: boolean;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const showImage = Boolean(normalizedAvatarUrl) && failedAvatarUrl !== normalizedAvatarUrl;

  return (
    <span className={className} aria-hidden={decorative}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={imageClassName ?? "avatar-image"}
          src={normalizedAvatarUrl}
          alt={decorative ? "" : `${name} avatar`}
          loading="lazy"
          onError={() => setFailedAvatarUrl(normalizedAvatarUrl ?? null)}
        />
      ) : (
        <span className={fallbackClassName ?? "avatar-fallback"}>{participantInitials(name)}</span>
      )}
    </span>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-sm text-[color:var(--muted)]">{hint}</span> : null}
    </label>
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function AutoSizeTextarea({
  className,
  onChange,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      resizeTextarea(textareaRef.current);
    }
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={className}
      onChange={(event) => {
        resizeTextarea(event.currentTarget);
        onChange?.(event);
      }}
    />
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 3.4h3l.5 2.2a7.8 7.8 0 0 1 1.6.9l2.1-.9 2.1 2.1-.9 2.1c.35.5.65 1.03.9 1.6l2.2.5v3l-2.2.5a7.8 7.8 0 0 1-.9 1.6l.9 2.1-2.1 2.1-2.1-.9c-.5.35-1.03.65-1.6.9l-.5 2.2h-3l-.5-2.2a7.8 7.8 0 0 1-1.6-.9l-2.1.9-2.1-2.1.9-2.1a7.8 7.8 0 0 1-.9-1.6l-2.2-.5v-3l2.2-.5c.24-.57.54-1.1.9-1.6l-.9-2.1 2.1-2.1 2.1.9a7.8 7.8 0 0 1 1.6-.9l.5-2.2Z"
      />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.5 6.2a1 1 0 0 1 1.5-.86l8.17 5.3a1.6 1.6 0 0 1 0 2.72L10 18.66a1 1 0 0 1-1.5-.86V6.2Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.5 5.8A1.3 1.3 0 0 1 8.8 4.5h1.4a1.3 1.3 0 0 1 1.3 1.3v12.4a1.3 1.3 0 0 1-1.3 1.3H8.8a1.3 1.3 0 0 1-1.3-1.3V5.8Zm5 0a1.3 1.3 0 0 1 1.3-1.3h1.4a1.3 1.3 0 0 1 1.3 1.3v12.4a1.3 1.3 0 0 1-1.3 1.3h-1.4a1.3 1.3 0 0 1-1.3-1.3V5.8Z" />
    </svg>
  );
}

function PreviousGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.8 5.3a1 1 0 0 1 1 1v11.4a1 1 0 1 1-2 0V6.3a1 1 0 0 1 1-1Zm10.34.04a1 1 0 0 1 .03 1.42L11.9 12l5.27 5.24a1 1 0 1 1-1.41 1.42l-5.98-5.95a1 1 0 0 1 0-1.42l5.95-5.95a1 1 0 0 1 1.41 0Z" />
    </svg>
  );
}

function NextGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.2 5.3a1 1 0 0 1 1 1v11.4a1 1 0 1 1-2 0V6.3a1 1 0 0 1 1-1Zm-10.37.04a1 1 0 0 1 1.41 0l5.98 5.95a1 1 0 0 1 0 1.42l-5.98 5.95a1 1 0 1 1-1.41-1.42L12.1 12 6.83 6.76a1 1 0 0 1 0-1.42Z" />
    </svg>
  );
}

function PencilGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4.2l9.9-9.9a1.8 1.8 0 0 0 0-2.55l-1.65-1.65a1.8 1.8 0 0 0-2.55 0L4 15.8V20Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m12.8 6.2 5 5" />
    </svg>
  );
}

function EyeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.8 12s3.3-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.3 5.5-9.2 5.5S2.8 12 2.8 12Z"
      />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

function EyeOffGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.5 3.5 20.5 20.5M9.9 5.1A10.8 10.8 0 0 1 12 4.9c5.9 0 9.2 5.5 9.2 5.5a17.4 17.4 0 0 1-3.4 3.9M14.8 14.9A3.8 3.8 0 0 1 9 9.1M6.4 6.5A17 17 0 0 0 2.8 12s3.3 5.5 9.2 5.5c1.6 0 3-.4 4.3-1"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.7 12.2 2.1 2.1 4.5-4.8" />
    </svg>
  );
}

function WandGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 10-10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m12.8 5.2 1.1-2.7 1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m17.8 13.2.7-1.7.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.2 16.8.6-1.4.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z" />
    </svg>
  );
}

function PromptGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M6 12h12M9 17h6" />
      <rect x="3.8" y="4" width="16.4" height="16" rx="3.2" />
    </svg>
  );
}

function promptPlaceholder(): string {
  return "What should these personas fight out in LLM Pit?";
}

function SetupParticipantCard({
  participant,
  roleLabel,
  onEdit,
}: {
  participant: ParticipantConfig;
  roleLabel: string;
  onEdit: () => void;
}) {
  const personaPreview = buildPersonaProfilePreview(participant.personaProfile).trim().replace(/\s+/g, " ");

  return (
    <button type="button" className="hero-roster-card" onClick={onEdit} aria-label={`Edit ${participant.name}`}>
      <span className="hero-roster-edit" aria-hidden="true">
        <SettingsGlyph />
      </span>

      <div className="hero-roster-card-top">
        <ParticipantAvatar
          name={participant.name}
          avatarUrl={participant.avatarUrl}
          className="hero-roster-avatar"
          fallbackClassName="hero-roster-avatar-fallback"
          imageClassName="avatar-image"
        />

        <div className="hero-roster-copy">
          <span className="hero-roster-role">{roleLabel}</span>
          <span className="hero-roster-name">{participant.name}</span>
          <span className="hero-roster-model mono">{participant.model}</span>
        </div>
      </div>

      <p className="hero-roster-persona">
        {personaPreview ? `${personaPreview.slice(0, 180)}${personaPreview.length > 180 ? "..." : ""}` : "Add a persona to shape this voice in the room."}
      </p>
    </button>
  );
}

function StudioHero({
  config,
  apiKey,
  apiKeyStatus,
  apiKeyStatusMessage,
  draftApiKey,
  canSubmit,
  hasApiKey,
  hasLoadedKey,
  isRunning,
  onDraftApiKeyChange,
  onSaveApiKey,
  onOpenSettings,
  onPromptChange,
  onAddMember,
  onOpenParticipant,
}: {
  config: RunInput;
  apiKey: string;
  apiKeyStatus: ApiKeyStatus;
  apiKeyStatusMessage: string;
  draftApiKey: string;
  canSubmit: boolean;
  hasApiKey: boolean;
  hasLoadedKey: boolean;
  isRunning: boolean;
  onDraftApiKeyChange: (value: string) => void;
  onSaveApiKey: () => Promise<boolean>;
  onOpenSettings: () => void;
  onPromptChange: (value: string) => void;
  onAddMember: () => void;
  onOpenParticipant: (id: string) => void;
}) {
  const roster = [config.coordinator, ...config.members];
  const apiKeyLabel = hasLoadedKey ? (hasApiKey ? maskApiKey(apiKey) : "No key saved") : "Loading";
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const isApiKeyEditorVisible = isEditingApiKey || (hasLoadedKey && !hasApiKey);
  const apiKeyFieldValue = isApiKeyEditorVisible ? draftApiKey : hasApiKey ? (isApiKeyVisible ? apiKey : apiKeyLabel) : apiKeyLabel;
  const statusTone =
    apiKeyStatus === "valid" ? "success" : apiKeyStatus === "invalid" ? "error" : apiKeyStatus === "checking" ? "info" : "warning";

  useEffect(() => {
    if (!isApiKeyEditorVisible) {
      return;
    }

    apiKeyInputRef.current?.focus();
    apiKeyInputRef.current?.select();
  }, [isApiKeyEditorVisible]);

  async function handleApiKeyConfirm() {
    if (await onSaveApiKey()) {
      setIsEditingApiKey(false);
    }
  }

  function handleApiKeyInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (!isApiKeyEditorVisible || apiKeyStatus === "checking") {
      return;
    }

    void handleApiKeyConfirm();
  }

  return (
    <section className="hero-shell">
      <section className="hero-panel hero-copy-panel">
        <div className="hero-copy-stack">
          <h1 className="hero-title">LLM Pit</h1>
          <p className="hero-body">
            Pick a moderator, choose at least two persona simulations, and throw them into a live debate. Once you hit play, the setup surface clears out and the room takes over.
          </p>
        </div>
      </section>

      <section className="hero-panel hero-roster-shell">
        <div className="hero-roster-header">
          <div>
            <p className="hero-kicker">Pit Lineup</p>
            <h2 className="hero-panel-title">Select the moderator and debaters</h2>
          </div>

          <button type="button" onClick={onAddMember} className="chamber-add-button">
            <PlusGlyph />
          </button>
        </div>

        <div className="hero-roster-grid">
          {roster.map((participant) => (
            <SetupParticipantCard
              key={participant.id}
              participant={participant}
              roleLabel={participant.id === config.coordinator.id ? "Moderator" : "Debater"}
              onEdit={() => onOpenParticipant(participant.id)}
            />
          ))}
        </div>
      </section>

      <section className="hero-panel hero-prompt-shell">
        <div className="hero-prompt-header">
          <div>
            <p className="hero-kicker">Debate Topic</p>
            <h2 className="hero-panel-title">What is the debate topic about?</h2>
          </div>

          <div className="hero-selector-actions">
            <button
              type="button"
              onClick={onOpenSettings}
              className="action-button hero-icon-button"
              aria-label="Run settings"
              title="Run settings"
            >
              <span className="action-button-icon">
                <SettingsGlyph />
              </span>
            </button>
          </div>
        </div>

        <label className="hero-prompt-panel" htmlFor="hero-pit-prompt">
          <div className="hero-prompt-input-shell">
            <button
              type="button"
              onClick={() => onPromptChange(generateControversialPrompt())}
              className="icon-circle-button hero-prompt-wand-button"
              aria-label="Generate a controversial prompt"
              title="Generate a controversial prompt"
            >
              <WandGlyph />
            </button>

            <input
              type="text"
              id="hero-pit-prompt"
              className="field hero-prompt-input"
              value={config.prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={promptPlaceholder()}
            />
          </div>
        </label>
      </section>

      <section className="hero-panel hero-api-shell">
        <div className="hero-api-header">
          <div>
            <p className="hero-kicker">OpenRouter Access</p>
            <h2 className="hero-panel-title">API key</h2>
            <p className="hero-panel-copy">
              Browser runs need a valid OpenRouter API key, including for <span className="mono">{OPENROUTER_FREE_MODEL}</span>. Create one in{" "}
              <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="hero-api-link">
                OpenRouter
              </a>{" "}
              and manage it in{" "}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="hero-api-link">
                key settings
              </a>
              .
            </p>
          </div>
        </div>

        <div className="hero-api-block">
          <div className={`hero-api-form ${isApiKeyEditorVisible ? "is-editing" : ""}`}>
            <input
              id="hero-api-key-input"
              ref={apiKeyInputRef}
              className="field mono hero-api-input"
              type={isApiKeyEditorVisible ? (isApiKeyVisible ? "text" : "password") : "text"}
              value={apiKeyFieldValue}
              onChange={(event) => onDraftApiKeyChange(event.target.value)}
              onKeyDown={handleApiKeyInputKeyDown}
              placeholder="sk-or-v1-..."
              autoComplete="off"
              readOnly={!isApiKeyEditorVisible}
              aria-label="OpenRouter API key"
            />
            <div className="hero-api-input-actions">
              <button
                type="button"
                onClick={() => setIsApiKeyVisible((current) => !current)}
                className="hero-api-icon-button"
                aria-label={isApiKeyVisible ? "Hide API key" : "Show API key"}
                title={isApiKeyVisible ? "Hide API key" : "Show API key"}
              >
                {isApiKeyVisible ? <EyeOffGlyph /> : <EyeGlyph />}
              </button>
              <button
                type="button"
                disabled={apiKeyStatus === "checking"}
                onClick={
                  isApiKeyEditorVisible
                    ? () => {
                        void handleApiKeyConfirm();
                      }
                    : () => {
                        setIsEditingApiKey(true);
                      }
                }
                className={`hero-api-edit-button ${isApiKeyEditorVisible ? "is-confirm" : ""}`}
                aria-label={isApiKeyEditorVisible ? "Confirm API key" : "Edit API key"}
                title={isApiKeyEditorVisible ? "Confirm API key" : "Edit API key"}
              >
                {isApiKeyEditorVisible ? (apiKeyStatus === "checking" ? "Testing..." : "Confirm") : <PencilGlyph />}
              </button>
            </div>
          </div>
          <div className={`hero-api-status hero-api-status-${statusTone}`} role="status" aria-live="polite">
            {apiKeyStatus === "valid" ? (
              <span className="hero-api-status-icon" aria-hidden="true">
                <CheckGlyph />
              </span>
            ) : null}
            <span>{apiKeyStatusMessage}</span>
          </div>
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
        {isRunning ? "STARTING..." : "START"}
      </button>
    </section>
  );
}

function PersonaSelectorModal({
  onClose,
  onSelectPreset,
}: {
  onClose: () => void;
  onSelectPreset: (preset: ParticipantPersonaPreset) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const presets = filterParticipantPersonaPresets(deferredQuery);

  return (
    <div className="settings-modal-backdrop">
      <button type="button" className="settings-modal-dismiss" aria-label="Close persona selector" onClick={onClose} />

      <section className="settings-sheet persona-selector-modal-panel w-full max-w-3xl p-6 sm:p-7">
        <div className="settings-modal-header">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">Pit Lineup</p>
            <p className="hero-panel-copy">Choose a preset persona to quickly populate this seat in the debate.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close persona selector"
            className="icon-circle-button persona-selector-modal-close"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="persona-selector-modal-stack">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search personas"
          />

          <div className="persona-preset-list persona-selector-modal-list" role="list" aria-label="Persona presets">
            {presets.length > 0 ? (
              presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="persona-preset-card"
                  onClick={() => onSelectPreset(preset)}
                >
                  <span className="persona-preset-card-top">
                    <ParticipantAvatar
                      name={preset.name}
                      avatarUrl={preset.avatarUrl}
                      className="persona-preset-avatar"
                      fallbackClassName="persona-preset-avatar-fallback"
                      imageClassName="avatar-image"
                    />
                    <span className="persona-preset-card-copy">
                      <span className="persona-preset-card-header">
                        <span className="persona-preset-card-name">{preset.name}</span>
                      </span>
                      <span className="persona-preset-card-title">{preset.title}</span>
                      <span className="persona-preset-card-summary">{preset.summary}</span>
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="persona-preset-empty">
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
    onChange({ avatarUrl: nextAvatarUrl });
    setIsAvatarEditorOpen(false);
    setIsAvatarDropActive(false);
  }

  function commitNameEdit() {
    const nextName = draftName.trim();
    onChange({ name: nextName || participant.name });
    setDraftName(nextName || participant.name);
    setIsEditingName(false);
  }

  function updatePersonaProfile(
    patch: Partial<ParticipantConfig["personaProfile"]>,
  ) {
    onChange({
      personaProfile: {
        ...participant.personaProfile,
        ...patch,
      },
    });
  }

  return (
    <div className="settings-modal-backdrop participant-modal-backdrop">
      <button type="button" className="settings-modal-dismiss" aria-label="Close participant settings" onClick={onClose} />
      <section className="settings-sheet participant-modal-panel" role="dialog" aria-modal="true" aria-label="Participant settings">
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
                        onChange({ avatarUrl: nextAvatarUrl || undefined });
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
                          onChange({ avatarUrl: undefined });
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close member settings"
            className="icon-circle-button participant-modal-close"
          >
            <CloseGlyph />
          </button>
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
              {MODEL_SUGGESTIONS.map((model) => (
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
                value={participant.personaProfile.role}
                onChange={(event) => updatePersonaProfile({ role: event.target.value })}
                placeholder="Economist, journalist, minister..."
              />
            </FieldShell>

            <FieldShell label="Personality">
              <input
                className="field"
                value={participant.personaProfile.personality}
                onChange={(event) => updatePersonaProfile({ personality: event.target.value })}
                placeholder="Calm, confrontational, analytical..."
              />
            </FieldShell>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FieldShell label="Language">
                <input
                  className="field"
                  value={participant.personaProfile.language}
                  onChange={(event) => updatePersonaProfile({ language: event.target.value })}
                  placeholder="European Portuguese"
                />
              </FieldShell>

              <FieldShell label="Gender">
                <input
                  className="field"
                  value={participant.personaProfile.gender}
                  onChange={(event) => updatePersonaProfile({ gender: event.target.value })}
                  placeholder="Optional"
                />
              </FieldShell>

              <FieldShell label="Nationality">
                <input
                  className="field"
                  value={participant.personaProfile.nationality}
                  onChange={(event) => updatePersonaProfile({ nationality: event.target.value })}
                  placeholder="Optional"
                />
              </FieldShell>

              <FieldShell label="Birth Date">
                <input
                  type="date"
                  className="field"
                  value={participant.personaProfile.birthDate}
                  onChange={(event) => updatePersonaProfile({ birthDate: event.target.value })}
                />
              </FieldShell>
            </div>

            <FieldShell label="Perspective">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.personaProfile.perspective}
                onChange={(event) => updatePersonaProfile({ perspective: event.target.value })}
                placeholder="Core worldview, mission, or governing perspective..."
              />
            </FieldShell>

            <FieldShell label="Temperament">
              <input
                className="field"
                value={participant.personaProfile.temperament}
                onChange={(event) => updatePersonaProfile({ temperament: event.target.value })}
                placeholder="Measured, combative, playful, severe..."
              />
            </FieldShell>

            <FieldShell label="Debate Style">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.personaProfile.debateStyle}
                onChange={(event) => updatePersonaProfile({ debateStyle: event.target.value })}
                placeholder="How this person argues, presses points, and responds..."
              />
            </FieldShell>

            <FieldShell label="Speech Style">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.personaProfile.speechStyle}
                onChange={(event) => updatePersonaProfile({ speechStyle: event.target.value })}
                placeholder="Sentence rhythm, vocabulary, tone, delivery..."
              />
            </FieldShell>

            <FieldShell label="Guardrails">
              <AutoSizeTextarea
                className="field min-h-24 resize-none overflow-hidden"
                value={participant.personaProfile.guardrails}
                onChange={(event) => updatePersonaProfile({ guardrails: event.target.value })}
                placeholder="What this person should avoid sounding like or doing..."
              />
            </FieldShell>
          </div>

          <FieldShell label="Additional Guidance">
            <span className="mb-2 block text-sm text-[color:var(--muted)]">
              Use only for instructions that do not fit the structured persona fields above.
            </span>
            <AutoSizeTextarea
              className="field min-h-28 resize-none overflow-hidden participant-persona-input"
              value={participant.personaProfile.promptNotes}
              onChange={(event) => updatePersonaProfile({ promptNotes: event.target.value })}
              placeholder="Anything still not captured by role, perspective, style, or guardrails..."
            />
          </FieldShell>
          </div>

          {onRemove ? (
            <div className="participant-modal-footer">
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full border border-red-500/35 px-4 py-2 text-sm font-medium text-red-200 transition hover:border-red-400 hover:bg-red-500/10 hover:text-white"
              >
                Remove member
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function transcriptTurnBody(turn: PitTurn): string {
  const segments = turn.bubbles.length > 0 ? turn.bubbles.map((bubble) => bubble.content.trim()).filter(Boolean) : [turn.content];
  return segments.join("\n\n");
}

function buildTranscriptMarkdown({
  prompt,
  turns,
  isRunning,
}: {
  prompt: string;
  turns: PitTurn[];
  isRunning: boolean;
}): string {
  const lines = [
    "## Prompt",
    "",
    prompt.trim() || "_No prompt set yet._",
  ];

  if (turns.length === 0) {
    lines.push(
      "",
      "## Live Feed",
      "",
      isRunning ? "_Waiting for the first response..._" : "_Start LLM Pit to generate a transcript._",
    );

    return lines.join("\n");
  }

  for (const turn of turns) {
    lines.push(
      "",
      `## ${chapterLabelForTurn(turn)} · ${turn.speakerName}`,
      "",
      `*${turn.model}*`,
      "",
      transcriptTurnBody(turn),
    );
  }

  if (isRunning) {
    lines.push("", "_Transcript updates live as each turn completes._");
  }

  return lines.join("\n");
}

function StudioSettingsModal({
  config,
  onClose,
  onConfigChange,
}: {
  config: RunInput;
  onClose: () => void;
  onConfigChange: (patch: Partial<RunInput>) => void;
}) {
  return (
    <div className="settings-modal-backdrop">
      <button type="button" className="settings-modal-dismiss" aria-label="Close settings" onClick={onClose} />

      <section className="settings-sheet settings-modal-panel w-full max-w-3xl p-6 sm:p-7">
        <div className="settings-modal-header">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">Pit Settings</p>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">Room controls and run options</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--ink-soft)]">
              Adjust the debate-wide run settings from one place.
            </p>
          </div>

          <button type="button" onClick={onClose} className="action-button">
            Close
          </button>
        </div>

        <div className="settings-modal-grid">
          <div className="settings-modal-stack">
            <FieldShell
              label="Shared Directive"
              hint="Prepended for every participant before their individual persona."
            >
              <textarea
                className="field min-h-32 resize-y"
                value={config.sharedDirective}
                onChange={(event) => onConfigChange({ sharedDirective: event.target.value })}
              />
            </FieldShell>

            <div className="settings-number-grid">
              <FieldShell
                label="Rounds"
                hint="Each round gives every member one turn."
              >
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={6}
                  value={config.rounds}
                  onChange={(event) => onConfigChange({ rounds: Number(event.target.value) || 1 })}
                />
              </FieldShell>

              <FieldShell label="Temperature">
                <input
                  className="field"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={config.temperature}
                  onChange={(event) => onConfigChange({ temperature: Number(event.target.value) || 0 })}
                />
              </FieldShell>

              <FieldShell label="Max Completion Tokens">
                <input
                  className="field"
                  type="number"
                  min={200}
                  max={4000}
                  step={50}
                  value={config.maxCompletionTokens}
                  onChange={(event) => onConfigChange({ maxCompletionTokens: Number(event.target.value) || 200 })}
                />
              </FieldShell>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TranscriptPanel({
  turnCount,
  isRunning,
  markdown,
  thinkingSpeakerName,
}: {
  turnCount: number;
  isRunning: boolean;
  markdown: string;
  thinkingSpeakerName?: string | null;
}) {
  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

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

  return (
    <article className="transcript-sheet transcript-sheet-inline">
      <div ref={transcriptBodyRef} className="transcript-sheet-body" onScroll={updateTranscriptScrollLock}>
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 className="transcript-markdown-h1">{children}</h1>,
            h2: ({ children }) => <h2 className="transcript-markdown-h2">{children}</h2>,
            p: ({ children }) => <p className="transcript-markdown-p">{children}</p>,
            em: ({ children }) => <em className="transcript-markdown-em">{children}</em>,
            ul: ({ children }) => <ul className="transcript-markdown-ul">{children}</ul>,
            ol: ({ children }) => <ol className="transcript-markdown-ol">{children}</ol>,
            li: ({ children }) => <li className="transcript-markdown-li">{children}</li>,
            code: ({ children }) => <code className="transcript-markdown-code">{children}</code>,
            blockquote: ({ children }) => <blockquote className="transcript-markdown-blockquote">{children}</blockquote>,
          }}
        >
          {markdown}
        </ReactMarkdown>

        <div className="transcript-sheet-footer">
          <div className="transcript-sheet-actions transcript-sheet-actions-footer">
            {isRunning || turnCount > 0 ? (
              <span className={`transcript-status-chip ${isRunning ? "is-live" : ""}`}>
                <span className="transcript-status-dot" />
                {isRunning ? (thinkingSpeakerName ? `Thinking: ${thinkingSpeakerName}` : "Thinking...") : `${turnCount} turns`}
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
      <button type="button" className="settings-modal-dismiss" aria-label="Close raw prompt" onClick={onClose} />
      <section
        className="settings-sheet settings-modal-panel raw-prompt-modal-panel w-full max-w-4xl p-6 sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-label="Raw prompt"
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
            className="icon-circle-button persona-selector-modal-close"
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

function ChamberStage({
  roster,
  plannedRounds,
  currentFrame,
  displayedBubbleContent,
  chapters,
  frames,
  activeFrameIndex,
  totalDurationMs,
  isRunning,
  isBubbleStreaming,
  error,
  warnings,
  prompt,
  hasSessionStarted,
  panelMode,
  transcriptTurnCount,
  transcriptMarkdown,
  isPlaybackPlaying,
  onPanelModeChange,
  onOpenParticipant,
  onPausePlayback,
  onTogglePlayback,
  onPreviousFrame,
  onNextFrame,
  onSelectFrame,
}: {
  roster: ParticipantConfig[];
  plannedRounds: number;
  currentFrame?: PlaybackFrame;
  displayedBubbleContent: string;
  chapters: TimelineChapter[];
  frames: PlaybackFrame[];
  activeFrameIndex: number;
  totalDurationMs: number;
  isRunning: boolean;
  isBubbleStreaming: boolean;
  error: string | null;
  warnings: string[];
  prompt: string;
  hasSessionStarted: boolean;
  panelMode: StagePanelMode;
  transcriptTurnCount: number;
  transcriptMarkdown: string;
  isPlaybackPlaying: boolean;
  onPanelModeChange: (mode: StagePanelMode) => void;
  onOpenParticipant: (id: string) => void;
  onPausePlayback: () => void;
  onTogglePlayback: () => void;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onSelectFrame: (index: number) => void;
}) {
  const plannedQueueTurns = buildPlannedQueueTurns({
    rounds: plannedRounds,
    coordinator: roster[0] ?? createDefaultInput().coordinator,
    members: roster.slice(1),
  });
  const hasPlaybackStarted = hasSessionStarted || isRunning || frames.length > 0;
  const isAwaitingFirstTurn = hasPlaybackStarted && frames.length === 0 && !error;
  const queueEntries = buildQueueEntries({
    frames,
    roster,
    plannedTurns: plannedQueueTurns,
    currentFrame,
    isAwaitingFirstTurn,
    isRunning,
  });
  const thinkingEntry = queueEntries.find((entry) => entry.state === "thinking") ?? null;
  const focusSpeaker =
    (currentFrame ? roster.find((participant) => participant.id === currentFrame.speakerId) : null) ??
    thinkingEntry?.participant ??
    null;

  const canConfigureActiveSpeaker = false;
  const canGoPrevious = activeFrameIndex > 0;
  const canGoNext = activeFrameIndex < frames.length - 1;
  const isPlayButtonActive = isPlaybackPlaying && (isRunning || canGoNext || isBubbleStreaming);
  const [debugFrame, setDebugFrame] = useState<PlaybackFrame | null>(null);

  function openRawPrompt(frame: PlaybackFrame) {
    onPausePlayback();
    setDebugFrame(frame);
  }

  return (
    <>
      <section className="chamber-shell">
        <div className="chamber-header">
          <div className="chamber-header-copy">
            <h1 className="chamber-runtime-title">Live debate</h1>
            <p className="chamber-runtime-prompt">{prompt.trim() || "No prompt set yet."}</p>
          </div>
          {hasPlaybackStarted ? (
            <div className="chamber-runtime-actions">
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

        {hasPlaybackStarted ? (
          <div className={`stage-frame ${panelMode === "transcript" ? "stage-frame-transcript" : ""}`}>
            <div className={`cinema-stage ${panelMode === "transcript" ? "cinema-stage-transcript" : ""}`}>
              {panelMode === "conversation" ? (
                <>
                  <div className="cinema-vignette" />
                  <div className="pit-floor-glow" />
                  <aside className="speaker-queue-shell" aria-label="Upcoming speakers">
                    <p className="speaker-queue-kicker">Up next</p>
                    <div className="speaker-queue-list">
                      {queueEntries.length > 0 ? (
                        queueEntries.map(({ id, participant, state, frameIndex, speakerName, model, chapterLabel }, index) => (
                          <button
                            key={id}
                            type="button"
                            className={`speaker-queue-item is-${state}`}
                            onClick={() => {
                              if (frameIndex !== null) {
                                onSelectFrame(frameIndex);
                              }
                            }}
                            disabled={frameIndex === null}
                            aria-label={`${state === "active" ? "Current" : state === "thinking" ? "Thinking" : "Upcoming"} turn: ${speakerName}`}
                          >
                            <span className="speaker-queue-rank mono">{String(index + 1).padStart(2, "0")}</span>
                            <ParticipantAvatar
                              name={speakerName}
                              avatarUrl={participant?.avatarUrl}
                              className="speaker-queue-avatar"
                              fallbackClassName="speaker-queue-avatar-fallback"
                            />
                            <span className="speaker-queue-copy">
                              <span className="speaker-queue-name">{speakerName}</span>
                              <span className="speaker-queue-model mono">
                                {chapterLabel} · {participant?.model ?? model}
                              </span>
                            </span>
                            <span className={`speaker-queue-state speaker-queue-state-${state}`}>
                              {state === "active" ? "active" : state === "thinking" ? "thinking" : "ready"}
                            </span>
                          </button>
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

                        <div className={`speaker-focus-avatar ${currentFrame || thinkingEntry ? "is-speaking" : "is-idle"}`} aria-hidden="true">
                          <span className="speaker-focus-avatar-ring" />
                          <ParticipantAvatar
                            name={focusSpeaker?.name ?? "LLM Pit"}
                            avatarUrl={focusSpeaker?.avatarUrl}
                            className="speaker-focus-avatar-core"
                            fallbackClassName="speaker-focus-avatar-fallback"
                          />
                        </div>

                        <div className="speaker-focus-meta">
                          <span className="speaker-focus-name">{focusSpeaker?.name ?? "LLM Pit"}</span>
                          <span className="speaker-focus-model mono">
                            {focusSpeaker?.model ?? (isRunning ? "thinking" : "ready")}
                          </span>
                        </div>
                      </div>

                      <div className={`speaker-focus-bubble ${!currentFrame && !thinkingEntry ? "is-idle" : ""}`}>
                        {currentFrame ? (
                          <article key={currentFrame.id} className="speaker-focus-bubble-card has-debug-action">
                            <button
                              type="button"
                              className="bubble-debug-button"
                              onClick={() => openRawPrompt(currentFrame)}
                              aria-label="Show raw prompt for this speech bubble"
                              title="Show raw prompt"
                            >
                              <PromptGlyph />
                            </button>
                            <p className="stage-bubble-speaker">{currentFrame.speakerName}</p>
                            <p className={`stage-bubble-copy ${isBubbleStreaming ? "is-streaming" : ""}`}>
                              {displayedBubbleContent || "\u00a0"}
                            </p>
                          </article>
                        ) : thinkingEntry ? (
                          <article className="speaker-focus-bubble-card speaker-focus-bubble-card-muted">
                            <p className="stage-bubble-speaker">{thinkingEntry.speakerName}</p>
                            <p className="stage-bubble-copy stage-bubble-copy-thinking">Thinking...</p>
                          </article>
                        ) : (
                          <article className="speaker-focus-bubble-card speaker-focus-bubble-card-muted">
                            <p className="stage-bubble-speaker">
                              LLM Pit
                              <span>ready</span>
                            </p>
                            <p className="stage-bubble-copy">Start the debate to put the active speaker here.</p>
                          </article>
                        )}
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
        {warnings.length ? <div className="notice-row notice-row-warning">{warnings[warnings.length - 1]}</div> : null}
      </section>

      {debugFrame ? <RawPromptModal frame={debugFrame} onClose={() => setDebugFrame(null)} /> : null}
    </>
  );
}

export function PitStudio() {
  const [config, setConfig] = useState<RunInput>(() => createDefaultInput());
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [apiKey, setApiKey] = useState(DEFAULT_OPENROUTER_API_KEY);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>("empty");
  const [apiKeyStatusMessage, setApiKeyStatusMessage] = useState(emptyApiKeyStatusMessage);
  const [draftApiKey, setDraftApiKey] = useState(DEFAULT_OPENROUTER_API_KEY);
  const [hasLoadedKey, setHasLoadedKey] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPersonaSelectorModal, setShowPersonaSelectorModal] = useState(false);
  const [studioView, setStudioView] = useState<StudioView>("setup");
  const [panelMode, setPanelMode] = useState<StagePanelMode>("conversation");
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [completedBubbleIds, setCompletedBubbleIds] = useState<Record<string, true>>({});
  const [revealedBubbleId, setRevealedBubbleId] = useState<string | null>(null);
  const [revealedBubbleChars, setRevealedBubbleChars] = useState(0);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(true);
  const [frameCompletedAt, setFrameCompletedAt] = useState<number | null>(null);
  const keyValidationRequestIdRef = useRef(0);

  const roster = [config.coordinator, ...config.members];
  const hasApiKey = apiKey.trim().length > 0;
  const hasValidatedApiKey = apiKeyStatus === "valid";
  const hasPrompt = config.prompt.trim().length > 0;
  const transcriptTurns = flattenTurns(result);
  const transcriptPrompt = result?.prompt ?? config.prompt;
  const transcriptMarkdown = useDeferredValue(
    buildTranscriptMarkdown({
      prompt: transcriptPrompt,
      turns: transcriptTurns,
      isRunning,
    }),
  );
  const timeline = buildPlaybackTimeline(result);
  const frames = timeline.frames;
  const chapters = timeline.chapters;
  const totalDurationMs = timeline.totalDurationMs;
  const currentFrame = frames[Math.min(activeFrameIndex, Math.max(frames.length - 1, 0))];
  const editableParticipant = roster.find((participant) => participant.id === activeEditorId) ?? null;
  const isTransportEnabled = panelMode === "conversation";
  const isPlaybackActive = panelMode === "transcript" ? true : isPlaybackPlaying;
  const isBubbleStreaming =
    Boolean(currentFrame) && revealedBubbleChars < (currentFrame?.bubbleContent.length ?? 0);
  const displayedBubbleContent = currentFrame
    ? currentFrame.bubbleContent.slice(0, Math.min(revealedBubbleChars, currentFrame.bubbleContent.length))
    : "";

  useEffect(() => {
    const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE)?.trim() ?? "";
    const nextApiKey = storedKey || DEFAULT_OPENROUTER_API_KEY;
    if (nextApiKey) {
      setApiKey(nextApiKey);
      setDraftApiKey(nextApiKey);
      setShowSettingsModal(false);
      void validateStoredApiKey({
        nextApiKey,
        requestIdRef: keyValidationRequestIdRef,
        siteUrl: window.location.origin,
        setApiKeyStatus,
        setApiKeyStatusMessage,
      });
    } else {
      setApiKeyStatus("empty");
      setApiKeyStatusMessage(emptyApiKeyStatusMessage());
    }
    setHasLoadedKey(true);
  }, []);

  useEffect(() => {
    if (activeEditorId && !editableParticipant) {
      setActiveEditorId(null);
    }
  }, [activeEditorId, editableParticipant]);

  useEffect(() => {
    if (frames.length === 0) {
      if (activeFrameIndex !== 0) {
        setActiveFrameIndex(0);
      }
      return;
    }

    if (activeFrameIndex > frames.length - 1) {
      setActiveFrameIndex(frames.length - 1);
    }
  }, [activeFrameIndex, frames.length]);

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
    if (!isPlaybackActive || !currentFrame || revealedBubbleId !== currentFrame.id) {
      return;
    }

    if (revealedBubbleChars < currentFrame.bubbleContent.length || frameCompletedAt === null) {
      return;
    }

    const nextIndex = activeFrameIndex + 1;
    if (nextIndex >= frames.length) {
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
    revealedBubbleId,
    revealedBubbleChars,
  ]);

  function updateCoordinator(patch: Partial<ParticipantConfig>) {
    setConfig((current) => ({
      ...current,
      coordinator: { ...current.coordinator, ...patch },
    }));
  }

  function updateMember(id: string, patch: Partial<ParticipantConfig>) {
    setConfig((current) => ({
      ...current,
      members: current.members.map((member) => (member.id === id ? { ...member, ...patch } : member)),
    }));
  }

  function addMemberFromPreset(preset: ParticipantPersonaPreset) {
    setConfig((current) => ({
      ...current,
      members: [
        ...current.members,
        {
          ...createMember(current.members.length + 1),
          name: preset.name,
          model: DEFAULT_PRESET_MODEL,
          presetId: preset.id,
          personaProfile: { ...preset.personaProfile },
          avatarUrl: preset.avatarUrl,
        },
      ],
    }));
  }

  function removeMember(id: string) {
    setConfig((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== id),
    }));
  }

  function openParticipantEditor(id: string) {
    setActiveEditorId(id);
  }

  async function saveApiKey() {
    const trimmed = draftApiKey.trim();
    if (!trimmed) {
      window.localStorage.removeItem(OPENROUTER_KEY_STORAGE);
      setApiKey("");
      setDraftApiKey("");
      await validateStoredApiKey({
        nextApiKey: "",
        requestIdRef: keyValidationRequestIdRef,
        siteUrl: window.location.origin,
        setApiKeyStatus,
        setApiKeyStatusMessage,
      });
      setShowSettingsModal(false);
      setError(null);
      return true;
    }

    window.localStorage.setItem(OPENROUTER_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setDraftApiKey(trimmed);
    await validateStoredApiKey({
      nextApiKey: trimmed,
      requestIdRef: keyValidationRequestIdRef,
      siteUrl: window.location.origin,
      setApiKeyStatus,
      setApiKeyStatusMessage,
    });
    setShowSettingsModal(false);
    setError(null);
    return true;
  }

  function selectFrame(index: number) {
    setActiveFrameIndex(index);
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
    if (activeFrameIndex >= frames.length - 1) {
      return;
    }

    selectFrame(activeFrameIndex + 1);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasPrompt) {
      setError("Enter a prompt before starting LLM Pit.");
      return;
    }

    if (!hasValidatedApiKey) {
      setError("Add and validate an OpenRouter API key before starting LLM Pit.");
      return;
    }

    setStudioView("simulation");
    setError(null);
    setActiveFrameIndex(0);
    setIsPlaybackPlaying(true);
    setCompletedBubbleIds({});
    setRevealedBubbleId(null);
    setRevealedBubbleChars(0);
    setFrameCompletedAt(null);
    const payload: RunInput = {
      ...config,
      mode: "debate",
      coordinator: config.coordinator,
      members: shuffleParticipants(config.members),
    };

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
      const resultPayload = await runPitWorkflow(payload, {
        apiKey,
        siteUrl: window.location.origin,
        onProgress: (progressEvent) => {
          applyProgressEvent(progressEvent);
        },
      });

      setResult(resultPayload);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "LLM Pit run failed.");
    } finally {
      setIsRunning(false);
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
      if (activeFrameIndex < frames.length - 1) {
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

  function applyProgressEvent(event: RunProgressEvent) {
    if (event.type === "status") {
      return;
    }

    if (event.type === "warning") {
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

    setResult((current) => {
      if (!current) {
        return current;
      }

      const next = {
        ...current,
        usage: addUsage(current.usage, event.usage),
      };

      switch (event.type) {
        case "opening":
          return { ...next, opening: event.turn };
        case "member_turn": {
          const existingRounds = next.rounds ?? [];
          const index = existingRounds.findIndex((round) => round.round === event.turn.round);
          if (index >= 0) {
            const updatedRounds = existingRounds.map((round, roundIndex) =>
              roundIndex === index ? { ...round, turns: [...round.turns, event.turn] } : round,
            );
            return { ...next, rounds: updatedRounds };
          }

          return {
            ...next,
            rounds: [...existingRounds, { round: event.turn.round ?? 1, turns: [event.turn] }],
          };
        }
        case "intervention": {
          const existingRounds = next.rounds ?? [];
          const index = existingRounds.findIndex((round) => round.round === event.turn.round);

          if (index >= 0) {
            const updatedRounds = existingRounds.map((round, roundIndex) =>
              roundIndex === index ? { ...round, intervention: event.turn } : round,
            );
            return { ...next, rounds: updatedRounds };
          }

          return {
            ...next,
            rounds: [...existingRounds, { round: event.turn.round ?? 1, turns: [], intervention: event.turn }],
          };
        }
        case "synthesis":
          return { ...next, synthesis: event.turn };
        case "consensus":
          return { ...next, consensus: event.turn };
      }
    });
  }

  return (
    <main className="studio-page">
      <form
        onSubmit={handleSubmit}
        className={`studio-form flex w-full flex-col gap-5 px-4 py-4 sm:px-5 lg:px-6 lg:py-5 ${
          studioView === "simulation" ? "studio-form-simulation" : "mx-auto max-w-[90rem]"
        }`}
      >
        {studioView === "setup" ? (
          <StudioHero
            config={config}
            apiKey={apiKey}
            apiKeyStatus={apiKeyStatus}
            apiKeyStatusMessage={apiKeyStatusMessage}
            draftApiKey={draftApiKey}
            hasApiKey={hasApiKey}
            canSubmit={hasLoadedKey && hasValidatedApiKey && hasPrompt && config.members.length >= 2}
            hasLoadedKey={hasLoadedKey}
            isRunning={isRunning}
            onDraftApiKeyChange={setDraftApiKey}
            onSaveApiKey={saveApiKey}
            onOpenSettings={() => setShowSettingsModal(true)}
            onPromptChange={(prompt) => setConfig((current) => ({ ...current, prompt }))}
            onAddMember={() => setShowPersonaSelectorModal(true)}
            onOpenParticipant={openParticipantEditor}
          />
        ) : (
          <ChamberStage
            roster={result?.roster ?? roster}
            plannedRounds={config.rounds}
            currentFrame={currentFrame}
            displayedBubbleContent={displayedBubbleContent}
            chapters={chapters}
            frames={frames}
            activeFrameIndex={Math.min(activeFrameIndex, Math.max(frames.length - 1, 0))}
            totalDurationMs={totalDurationMs}
            isRunning={isRunning}
            isBubbleStreaming={isBubbleStreaming}
            error={error}
            warnings={result?.warnings ?? []}
            prompt={config.prompt}
            hasSessionStarted={studioView === "simulation"}
            panelMode={panelMode}
            transcriptTurnCount={transcriptTurns.length}
            transcriptMarkdown={transcriptMarkdown}
            isPlaybackPlaying={isPlaybackPlaying}
            onPanelModeChange={setPanelMode}
            onOpenParticipant={openParticipantEditor}
            onPausePlayback={pausePlayback}
            onTogglePlayback={togglePlayback}
            onPreviousFrame={selectPreviousFrame}
            onNextFrame={selectNextFrame}
            onSelectFrame={selectFrame}
          />
        )}
      </form>

      {hasLoadedKey && showSettingsModal ? (
        <StudioSettingsModal
          config={config}
          onClose={() => {
            setShowSettingsModal(false);
          }}
          onConfigChange={(patch) => setConfig((current) => ({ ...current, ...patch }))}
        />
      ) : null}

      {showPersonaSelectorModal ? (
        <PersonaSelectorModal
          onClose={() => setShowPersonaSelectorModal(false)}
          onSelectPreset={(preset) => {
            addMemberFromPreset(preset);
            setShowPersonaSelectorModal(false);
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
            editableParticipant.id === config.coordinator.id || config.members.length <= 2
              ? undefined
              : () => {
                  removeMember(editableParticipant.id);
                  setActiveEditorId(null);
                }
          }
        />
      ) : null}
    </main>
  );
}
