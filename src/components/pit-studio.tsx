"use client";

import {
  ArrowLeft as BackGlyph,
  CircleCheck as CheckGlyph,
  Copy as CopyGlyph,
  FileText as PromptGlyph,
  Github as GitHubGlyph,
  Pause as PauseGlyph,
  Pencil as PencilGlyph,
  Play as PlayGlyph,
  Plus as PlusGlyph,
  Save as SaveGlyph,
  Settings as SettingsGlyph,
  SkipBack as PreviousGlyph,
  SkipForward as NextGlyph,
  Trash2 as TrashGlyph,
  TriangleAlert as WarningGlyph,
  WandSparkles as WandGlyph,
  X as CloseGlyph,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
} from "react";
import {
  MODEL_SUGGESTIONS,
  PIT_RUN_DEFAULTS,
  addUsage,
  createInputFromStarterBundle,
  createRosterSnapshot,
  createDefaultInput,
  createRandomStarterInput,
  createMember,
  emptyUsage,
  getStarterBundle,
  type PitTurn,
  type ParticipantConfig,
  type RunInput,
  type RunResult,
} from "@/lib/pit";
import {
  invalidOpenRouterKeyMessage,
  validateOpenRouterKey,
} from "@/lib/openrouter";
import { runPitWorkflow, type RunProgressEvent } from "@/lib/pit-engine";
import { buildPersonaProfilePreview } from "@/lib/persona-profile";
import type { ParticipantPersonaPreset } from "@/lib/persona-presets";

type ApiKeyStatus = "empty" | "checking" | "valid" | "invalid" | "unresolved";

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

function emptyApiKeyStatusMessage(): string {
  return "Usage will be limited if no key is provided.";
}

function unresolvedApiKeyStatusMessage(): string {
  return "API key changed. Confirm it to validate before starting.";
}

type InitialStudioState = {
  config: RunInput;
  lineupOrder: string[];
  starterBundleId?: string;
  apiKey: string;
  apiKeyStatus: ApiKeyStatus;
  apiKeyStatusMessage: string;
  draftApiKey: string;
};

function readStarterBundleFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const bundleId = params.get("id")?.trim();

  if (!bundleId) {
    return null;
  }

  return getStarterBundle(bundleId) ?? null;
}

function buildInitialStudioState(): InitialStudioState {
  const defaultStarter = createRandomStarterInput();
  const defaultInput = defaultStarter.input;
  const defaultLineupOrder = syncLineupOrder([], [defaultInput.coordinator, ...defaultInput.members]);

  if (typeof window === "undefined") {
    return {
      config: defaultInput,
      lineupOrder: defaultLineupOrder,
      starterBundleId: defaultStarter.bundle.id,
      apiKey: "",
      apiKeyStatus: "empty",
      apiKeyStatusMessage: emptyApiKeyStatusMessage(),
      draftApiKey: "",
    };
  }

  const queryStarterBundle = readStarterBundleFromQuery();
  const config = queryStarterBundle ? createInputFromStarterBundle(queryStarterBundle) : defaultInput;
  const lineupOrder = syncLineupOrder([], [config.coordinator, ...config.members]);
  const starterBundleId = queryStarterBundle?.id ?? defaultStarter.bundle.id;

  return {
    config,
    lineupOrder,
    starterBundleId,
    apiKey: "",
    apiKeyStatus: "checking",
    apiKeyStatusMessage: "Checking for a server-side OpenRouter key...",
    draftApiKey: "",
  };
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
  setApiKeyStatusMessage(trimmed ? "Validating API key with OpenRouter..." : "Checking for a server-side OpenRouter key...");

  try {
    const validation = await validateOpenRouterKey(nextApiKey, siteUrl);
    if (requestIdRef.current !== requestId) {
      return validation.valid;
    }

    setApiKeyStatus(validation.valid ? "valid" : "invalid");
    setApiKeyStatusMessage(validation.message);
    return validation.valid;
  } catch {
    if (requestIdRef.current !== requestId) {
      return false;
    }

    setApiKeyStatus("invalid");
    setApiKeyStatusMessage(invalidOpenRouterKeyMessage());
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
  state: "speaking" | "ready" | "thinking" | "waiting";
  frameIndex: number | null;
};

type PendingTurnPreview = Extract<RunProgressEvent, { type: "thinking" }>;

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
      model: actualFrame?.model ?? plannedTurn.model,
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

function isLocalAvatarAsset(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
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

function ParticipantAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
  imageClassName,
  decorative = true,
  sizes = "64px",
}: {
  name: string;
  avatarUrl?: string;
  className: string;
  fallbackClassName?: string;
  imageClassName?: string;
  decorative?: boolean;
  sizes?: string;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const showImage = Boolean(normalizedAvatarUrl) && failedAvatarUrl !== normalizedAvatarUrl;
  const optimizedAvatarUrl =
    showImage && normalizedAvatarUrl && isLocalAvatarAsset(normalizedAvatarUrl) ? normalizedAvatarUrl : null;
  const shouldUseOptimizedImage = optimizedAvatarUrl !== null;

  return (
    <span
      className={className}
      aria-hidden={decorative}
      style={shouldUseOptimizedImage ? { position: "relative" } : undefined}
    >
      {showImage ? (
        shouldUseOptimizedImage ? (
          <Image
            className={imageClassName ?? "avatar-image"}
            src={optimizedAvatarUrl}
            alt={decorative ? "" : `${name} avatar`}
            fill
            sizes={sizes}
            onError={() => setFailedAvatarUrl(normalizedAvatarUrl ?? null)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={imageClassName ?? "avatar-image"}
            src={normalizedAvatarUrl}
            alt={decorative ? "" : `${name} avatar`}
            loading="lazy"
            decoding="async"
            onError={() => setFailedAvatarUrl(normalizedAvatarUrl ?? null)}
          />
        )
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
  textarea.style.height = "0px";
  textarea.style.overflowY = "hidden";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function AutoSizeTextarea({
  className,
  onChange,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syncTextareaHeight = useEffectEvent(() => {
    if (textareaRef.current) {
      resizeTextarea(textareaRef.current);
    }
  });

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [props.value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const container = textarea?.parentElement;

    if (!textarea || !container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      resizeTextarea(textarea);
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

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

function promptPlaceholder(): string {
  return "What should these personas fight out in The AI Pit?";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildPresetParticipant(preset: ParticipantPersonaPreset, index: number): ParticipantConfig {
  return {
    ...createMember(index),
    name: preset.name,
    model: preset.recommendedModel,
    presetId: preset.id,
    personaProfile: { ...preset.personaProfile },
    avatarUrl: preset.avatarUrl,
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

function addParticipantToLineup(input: RunInput, preset: ParticipantPersonaPreset): RunInput {
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
  const personaPreview = buildPersonaProfilePreview(participant.personaProfile).trim().replace(/\s+/g, " ");

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
            sizes="54px"
          />

          <div className="hero-roster-copy">
            <span className="hero-roster-role">{roleLabel}</span>
            <span className="hero-roster-name">{participant.name}</span>
            <span className="hero-roster-model mono">{participant.model}</span>
          </div>
        </div>

        <p className="hero-roster-persona">
          {personaPreview
            ? `${personaPreview.slice(0, 180)}${personaPreview.length > 180 ? "..." : ""}`
            : "Add a persona to shape this voice in the room."}
        </p>
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
  apiKey,
  apiKeyStatus,
  apiKeyStatusMessage,
  draftApiKey,
  canSubmit,
  hasApiKey,
  isRunning,
  onDraftApiKeyChange,
  onSaveApiKey,
  onPromptChange,
  onRerollStarterBundle,
  onAddMember,
  onSelectModerator,
  onOpenParticipant,
}: {
  roster: ParticipantConfig[];
  config: RunInput;
  apiKey: string;
  apiKeyStatus: ApiKeyStatus;
  apiKeyStatusMessage: string;
  draftApiKey: string;
  canSubmit: boolean;
  hasApiKey: boolean;
  isRunning: boolean;
  onDraftApiKeyChange: (value: string) => void;
  onSaveApiKey: () => Promise<boolean>;
  onPromptChange: (value: string) => void;
  onRerollStarterBundle: () => void;
  onAddMember: () => void;
  onSelectModerator: (id: string) => void;
  onOpenParticipant: (id: string) => void;
}) {
  const apiKeyLabel = hasApiKey ? maskApiKey(apiKey) : "No personal key";
  const [isEditingApiKey, setIsEditingApiKey] = useState(() => !apiKey.trim());
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const hasMountedApiKeyEditorRef = useRef(false);
  const isApiKeyEditorVisible = isEditingApiKey;
  const previousApiKeyEditorVisibilityRef = useRef(isApiKeyEditorVisible);
  const hasPendingApiKeyChanges = draftApiKey.trim() !== apiKey.trim();
  const canConfirmApiKey = draftApiKey.trim().length > 0;
  const apiKeyFieldValue = isApiKeyEditorVisible ? draftApiKey : apiKeyLabel;
  const displayedApiKeyStatus = hasPendingApiKeyChanges ? "unresolved" : apiKeyStatus;
  const displayedApiKeyStatusMessage = hasPendingApiKeyChanges ? unresolvedApiKeyStatusMessage() : apiKeyStatusMessage;
  const showHostedUsageWarning = !apiKey.trim() && !hasPendingApiKeyChanges && apiKeyStatus === "valid";
  const showWarningStatusIcon = showHostedUsageWarning || displayedApiKeyStatus === "empty" || displayedApiKeyStatus === "unresolved";
  const statusTone =
    showHostedUsageWarning
      ? "warning"
      : displayedApiKeyStatus === "valid"
      ? "success"
      : displayedApiKeyStatus === "invalid"
        ? "error"
        : displayedApiKeyStatus === "checking"
          ? "info"
          : "warning";

  useEffect(() => {
    const wasVisible = previousApiKeyEditorVisibilityRef.current;
    previousApiKeyEditorVisibilityRef.current = isApiKeyEditorVisible;

    if (!hasMountedApiKeyEditorRef.current) {
      hasMountedApiKeyEditorRef.current = true;
      return;
    }

    if (!isApiKeyEditorVisible || wasVisible) {
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

    if (!isApiKeyEditorVisible || displayedApiKeyStatus === "checking") {
      return;
    }

    void handleApiKeyConfirm();
  }

  return (
    <section className="hero-shell">
      <section className="hero-panel hero-copy-panel">
        <div className="hero-copy-actions">
          <a
            href="https://github.com/tsilva/aipit"
            target="_blank"
            rel="noreferrer"
            className="hero-github-link"
            aria-label="Open aipit on GitHub"
            title="Open aipit on GitHub"
          >
            <GitHubGlyph />
          </a>
        </div>

        <div className="hero-copy-stack">
          <h1 className="hero-title">The AI Pit</h1>
          <p className="hero-body">Choose a topic, select debaters, hit start, get some popcorn 🍿.</p>
        </div>
      </section>

      <section className="hero-panel hero-prompt-shell">
        <button
          type="button"
          onClick={onRerollStarterBundle}
          className="icon-circle-button hero-prompt-wand-button"
          aria-label="Load another starter debate"
          title="Load another starter debate"
        >
          <WandGlyph />
        </button>

        <div className="hero-prompt-header">
          <div>
            <p className="hero-kicker">Debate Topic</p>
            <h2 className="hero-panel-title">What is the debate topic about?</h2>
          </div>
        </div>

        <label className="hero-prompt-panel" htmlFor="hero-pit-prompt">
          <div className="hero-prompt-input-shell">
            <AutoSizeTextarea
              id="hero-pit-prompt"
              className="field hero-prompt-input"
              value={config.prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={promptPlaceholder()}
              rows={2}
            />
          </div>
        </label>
      </section>

      <section className="hero-panel hero-roster-shell">
        <div className="hero-roster-header">
          <div>
            <p className="hero-kicker">Pit Lineup</p>
            <h2 className="hero-panel-title">Select the moderator and debaters</h2>
          </div>

          <button
            type="button"
            onClick={onAddMember}
            className="chamber-add-button"
            aria-label="Add debater"
            title="Add debater"
          >
            <PlusGlyph />
          </button>
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
      </section>

      <section className="hero-panel hero-api-shell">
        <div className="hero-api-header">
          <div>
            <p className="hero-kicker">OpenRouter Access</p>
            <p className="hero-panel-copy">
              Use your OpenRouter key here, or leave it blank to use a configured server key. Get one from{" "}
              <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="hero-api-link">
                OpenRouter
              </a>{" "}
              or manage it in{" "}
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
              type="text"
              value={apiKeyFieldValue}
              onChange={(event) => onDraftApiKeyChange(event.target.value)}
              onKeyDown={handleApiKeyInputKeyDown}
              placeholder="sk-or-v1-..."
              autoComplete="off"
              readOnly={!isApiKeyEditorVisible}
              aria-label="OpenRouter API key"
            />
            <div className="hero-api-input-actions">
              {(!isApiKeyEditorVisible || canConfirmApiKey) && (
                <button
                  type="button"
                  disabled={displayedApiKeyStatus === "checking"}
                  onClick={
                    isApiKeyEditorVisible
                      ? () => {
                          void handleApiKeyConfirm();
                        }
                      : () => {
                          onDraftApiKeyChange(apiKey);
                          setIsEditingApiKey(true);
                        }
                  }
                  className={`hero-api-edit-button ${isApiKeyEditorVisible ? "is-confirm" : ""}`}
                  aria-label={isApiKeyEditorVisible ? "Save API key" : "Edit API key"}
                  title={isApiKeyEditorVisible ? "Save API key" : "Edit API key"}
                >
                  {isApiKeyEditorVisible ? <SaveGlyph /> : <PencilGlyph />}
                </button>
              )}
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
  const [filterPresets, setFilterPresets] = useState<((query: string) => ParticipantPersonaPreset[]) | null>(null);
  const [didPresetLoadFail, setDidPresetLoadFail] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const presets = filterPresets ? filterPresets(deferredQuery) : [];

  useEffect(() => {
    let isMounted = true;

    void import("@/lib/persona-presets")
      .then(({ filterParticipantPersonaPresets }) => {
        if (!isMounted) {
          return;
        }

        setFilterPresets(() => filterParticipantPersonaPresets);
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
            {filterPresets === null && !didPresetLoadFail ? (
              <div className="persona-preset-empty" role="status" aria-live="polite">
                Loading personas...
              </div>
            ) : didPresetLoadFail ? (
              <div className="persona-preset-empty" role="status">
                Persona presets failed to load. Close and reopen the picker to try again.
              </div>
            ) : presets.length > 0 ? (
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
                      sizes="48px"
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
          <div className="participant-modal-actions">
            {onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                aria-label="Remove member"
                title="Remove member"
                className="icon-circle-button participant-modal-delete"
              >
                <TrashGlyph />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close member settings"
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

            <div className="grid gap-4 sm:grid-cols-2">
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

        </div>
      </section>
    </div>
  );
}

function transcriptTurnBody(turn: PitTurn): string {
  const segments = turn.bubbles.length > 0 ? turn.bubbles.map((bubble) => bubble.content.trim()).filter(Boolean) : [turn.content];
  return segments.join("\n\n");
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
    return lines.join("\n");
  }

  for (const turn of turns) {
    lines.push(
      "",
      `## ${chapterLabelForTurn(turn)} · ${turn.speakerName} · \`${turn.model}\``,
      "",
      transcriptTurnBody(turn),
    );
  }

  if (isRunning) {
    lines.push("", "_Transcript updates live as each turn completes._");
  }

  return lines.join("\n");
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
}: {
  turnCount: number;
  isRunning: boolean;
  markdown: string;
  thinkingSpeakerName?: string | null;
  thinkingParticipant?: ParticipantConfig | null;
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
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("error");
    }
  }, [markdown, setCopyFeedback]);

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
  warnings,
  prompt,
  hasSessionStarted,
  panelMode,
  transcriptTurnCount,
  transcriptMarkdown,
  isPlaybackPlaying,
  isAwaitingTurnResponse,
  pendingTurn,
  onPanelModeChange,
  onOpenParticipant,
  onExit,
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
  warnings: string[];
  prompt: string;
  hasSessionStarted: boolean;
  panelMode: StagePanelMode;
  transcriptTurnCount: number;
  transcriptMarkdown: string;
  isPlaybackPlaying: boolean;
  isAwaitingTurnResponse: boolean;
  pendingTurn: PendingTurnPreview | null;
  onPanelModeChange: (mode: StagePanelMode) => void;
  onOpenParticipant: (id: string) => void;
  onExit: () => void;
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

  const canConfigureActiveSpeaker = false;
  const canGoPrevious = activeFrameIndex > 0;
  const canGoNext = activeFrameIndex < maxNavigableFrameIndex;
  const isPlayButtonActive = isPlaybackPlaying && (isRunning || canGoNext || isBubbleStreaming);
  const [debugFrame, setDebugFrame] = useState<PlaybackFrame | null>(null);
  const showBubbleDebugButton = useSyncExternalStore(subscribeToRuntime, isLocalRuntime, () => false);
  const activeQueueItemRef = useRef<HTMLDivElement | null>(null);

  function openRawPrompt(frame: PlaybackFrame) {
    onPausePlayback();
    setDebugFrame(frame);
  }

  useEffect(() => {
    if (panelMode !== "conversation" || !queueScrollTargetId) {
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
                    <div className="speaker-queue-list">
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
                              sizes="32px"
                            />
                            <span className="speaker-queue-copy">
                              <span className="speaker-queue-name">{speakerName}</span>
                              <span className="speaker-queue-model mono">{participant?.model ?? model}</span>
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
                          <ParticipantAvatar
                            name={focusSpeaker?.name ?? "The AI Pit"}
                            avatarUrl={focusSpeaker?.avatarUrl}
                            className="speaker-focus-avatar-core"
                            fallbackClassName="speaker-focus-avatar-fallback"
                            sizes="(max-width: 768px) 112px, 176px"
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
        {warnings.length ? <div className="notice-row notice-row-warning">{warnings[warnings.length - 1]}</div> : null}
      </section>

      {debugFrame ? <RawPromptModal frame={debugFrame} onClose={() => setDebugFrame(null)} /> : null}
    </>
  );
}

export function PitStudio() {
  const initialStudioStateRef = useRef<InitialStudioState | null>(null);

  if (initialStudioStateRef.current === null) {
    initialStudioStateRef.current = buildInitialStudioState();
  }

  const initialStudioState = initialStudioStateRef.current;
  const [config, setConfig] = useState<RunInput>(initialStudioState.config);
  const [lineupOrder, setLineupOrder] = useState<string[]>(initialStudioState.lineupOrder);
  const [starterBundleId, setStarterBundleId] = useState<string | undefined>(initialStudioState.starterBundleId);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [apiKey, setApiKey] = useState(initialStudioState.apiKey);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>(initialStudioState.apiKeyStatus);
  const [apiKeyStatusMessage, setApiKeyStatusMessage] = useState(initialStudioState.apiKeyStatusMessage);
  const [draftApiKey, setDraftApiKey] = useState(initialStudioState.draftApiKey);
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
  const [isAwaitingTurnResponse, setIsAwaitingTurnResponse] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingTurnPreview | null>(null);
  const keyValidationRequestIdRef = useRef(0);
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);

  const roster = [config.coordinator, ...config.members];
  const orderedRoster = orderParticipants(roster, lineupOrder);
  const hasApiKey = apiKey.trim().length > 0;
  const hasPendingApiKeyChanges = draftApiKey.trim() !== apiKey.trim();
  const hasValidatedApiKey = apiKeyStatus === "valid" && !hasPendingApiKeyChanges;
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

  useEffect(() => {
    void validateApiKey({
      nextApiKey: initialStudioState.apiKey,
      requestIdRef: keyValidationRequestIdRef,
      siteUrl: window.location.origin,
      setApiKeyStatus,
      setApiKeyStatusMessage,
    });
  }, [initialStudioState.apiKey]);

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

  function addMemberFromPreset(preset: ParticipantPersonaPreset) {
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

  function openParticipantEditor(id: string) {
    setActiveEditorId(id);
  }

  function rerollStarterBundle() {
    const nextStarter = createRandomStarterInput(starterBundleId);
    setStarterBundleId(nextStarter.bundle.id);
    setConfig(nextStarter.input);
  }

  async function saveApiKey() {
    const trimmed = draftApiKey.trim();
    if (!trimmed) {
      setApiKey("");
      setDraftApiKey("");
      await validateApiKey({
        nextApiKey: "",
        requestIdRef: keyValidationRequestIdRef,
        siteUrl: window.location.origin,
        setApiKeyStatus,
        setApiKeyStatusMessage,
      });
      setError(null);
      return true;
    }

    setApiKey(trimmed);
    setDraftApiKey(trimmed);
    await validateApiKey({
      nextApiKey: trimmed,
      requestIdRef: keyValidationRequestIdRef,
      siteUrl: window.location.origin,
      setApiKeyStatus,
      setApiKeyStatusMessage,
    });
    setError(null);
    return true;
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
  }, []);

  const exitSimulation = useCallback(() => {
    activeRunIdRef.current += 1;
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = null;
    resetSimulationState();
  }, [resetSimulationState]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasPrompt) {
      setError("Enter a prompt before starting The AI Pit.");
      return;
    }

    if (!hasValidatedApiKey) {
      setError("Confirm a personal OpenRouter key or configure a server-side key before starting The AI Pit.");
      return;
    }

    runAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    runAbortControllerRef.current = abortController;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

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
    const payload: RunInput = {
      ...config,
      ...PIT_RUN_DEFAULTS,
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
        signal: abortController.signal,
        onProgress: (progressEvent) => {
          if (activeRunIdRef.current !== runId) {
            return;
          }
          applyProgressEvent(progressEvent);
        },
      });

      if (activeRunIdRef.current === runId) {
        setResult(resultPayload);
      }
    } catch (submissionError) {
      if (activeRunIdRef.current !== runId || isAbortError(submissionError)) {
        return;
      }

      setError(submissionError instanceof Error ? submissionError.message : "The AI Pit run failed.");
    } finally {
      if (activeRunIdRef.current === runId) {
        runAbortControllerRef.current = null;
        setIsRunning(false);
        setIsAwaitingTurnResponse(false);
        setPendingTurn(null);
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
      return;
    }

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

    setIsAwaitingTurnResponse(false);
    setPendingTurn(null);

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
        className={`studio-form flex w-full flex-col gap-5 px-2 py-2 sm:px-5 lg:px-6 lg:py-5 ${
          studioView === "simulation" ? "studio-form-simulation" : "mx-auto max-w-[90rem]"
        }`}
      >
        {studioView === "setup" ? (
          <StudioHero
            roster={orderedRoster}
            config={config}
            apiKey={apiKey}
            apiKeyStatus={apiKeyStatus}
            apiKeyStatusMessage={apiKeyStatusMessage}
            draftApiKey={draftApiKey}
            hasApiKey={hasApiKey}
            canSubmit={hasValidatedApiKey && hasPrompt && config.members.length >= 2}
            isRunning={isRunning}
            onDraftApiKeyChange={setDraftApiKey}
            onSaveApiKey={saveApiKey}
            onPromptChange={(prompt) => setConfig((current) => ({ ...current, prompt }))}
            onRerollStarterBundle={rerollStarterBundle}
            onAddMember={() => setShowPersonaSelectorModal(true)}
            onSelectModerator={selectModerator}
            onOpenParticipant={openParticipantEditor}
          />
        ) : (
          <ChamberStage
            roster={result?.roster ?? roster}
            plannedRounds={PIT_RUN_DEFAULTS.rounds}
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
            warnings={result?.warnings ?? []}
            prompt={config.prompt}
            hasSessionStarted={studioView === "simulation"}
            panelMode={panelMode}
            transcriptTurnCount={transcriptTurns.length}
            transcriptMarkdown={transcriptMarkdown}
            isPlaybackPlaying={isPlaybackPlaying}
            isAwaitingTurnResponse={isAwaitingTurnResponse}
            pendingTurn={pendingTurn}
            onPanelModeChange={setPanelMode}
            onOpenParticipant={openParticipantEditor}
            onExit={exitSimulation}
            onPausePlayback={pausePlayback}
            onTogglePlayback={togglePlayback}
            onPreviousFrame={selectPreviousFrame}
            onNextFrame={selectNextFrame}
            onSelectFrame={selectFrame}
          />
        )}
      </form>

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
            roster.length <= 1
              ? undefined
              : () => {
                  removeParticipant(editableParticipant.id);
                  setActiveEditorId(null);
                }
          }
        />
      ) : null}
    </main>
  );
}
