"use client";

import {
  Flame as FlameGlyph,
  Pencil as PencilGlyph,
  Play as PlayGlyph,
  Plus as PlusGlyph,
  Settings as SettingsGlyph,
  Shuffle as ShuffleGlyph,
  Trash2 as TrashGlyph,
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
} from "react";
import { ARENA_AVIF_SRC_SET, ARENA_IMAGE_SIZES } from "@/lib/arena-image";
import {
  getAudienceContextLabel,
  type PresetAudience,
} from "@/lib/audience";
import {
  AutoSizeTextarea,
  FieldShell,
  ParticipantAvatar,
  copyTextToClipboard,
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/components/pit-studio-primitives";
import { SimulationNotice } from "@/components/simulation-notice";
import { TelemetryPreferencesButton } from "@/components/telemetry-preferences";
import {
  MAX_DEBATE_MEMBER_COUNT,
  MAX_DEBATE_PERSON_COUNT,
  PIT_RUN_DEFAULTS,
  addUsage,
  createMember,
  createRosterSnapshot,
  emptyUsage,
  type PitTurn,
  type ParticipantConfig,
  type RunInput,
  type RunResult,
} from "@/lib/pit-core";
import { SUPPORTED_OPENROUTER_MODELS } from "@/lib/openrouter-models";
import {
  LEGAL_ACKNOWLEDGEMENT_TOKEN,
  PUBLIC_REPLAY_MISUSE_NOTICE_TEXT,
  PUBLIC_REPLAY_VISIBILITY_NOTICE_TEXT,
  SYNTHETIC_MEDIA_DISCLOSURE_TEXT,
} from "@/lib/legal-notice";
import {
  buildCharacterProfilePreview,
  cloneCharacterProfile,
} from "@/lib/character-profile";
import type { ParticipantCharacterPreset } from "@/lib/character-presets";
import {
  isSameRuntimePlaybackTurn,
  kindLabel,
  type PendingTurnPreview,
  type PlaybackFrame,
  type StagePanelMode,
  type TimelineChapter,
} from "@/lib/pit-playback";
import type { RunProgressEvent } from "@/lib/pit-engine";
import type { InitialStudioState } from "@/lib/pit-studio-state";
import {
  shouldDisplayRuntimeWarning,
  type RuntimeTurnIdentity,
  type RuntimeWarningNotice,
} from "@/lib/runtime-warning";
import { isCompletedRunResult } from "@/lib/share-snapshot";
import { isShareCreationResponse } from "@/lib/share-response";
import { trackEvent } from "@/lib/google-analytics";

export type { InitialStudioState } from "@/lib/pit-studio-state";
export { isSameRuntimePlaybackTurn } from "@/lib/pit-playback";

const ChamberStage = dynamic(() => import("@/components/pit-chamber-stage"), {
  loading: () => <p className="notice-row" role="status">Loading simulation…</p>,
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

type StudioView = "setup" | "simulation";

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
  if (input.members.length >= MAX_DEBATE_MEMBER_COUNT) {
    return input;
  }

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
  canSubmit,
  canAddMember,
  isRunning,
  onPromptChange,
  onRerollDebaters,
  onRerollTopic,
  onAddMember,
  onSelectModerator,
  onOpenParticipant,
}: {
  roster: ParticipantConfig[];
  config: RunInput;
  canSubmit: boolean;
  canAddMember: boolean;
  isRunning: boolean;
  onPromptChange: (value: string) => void;
  onRerollDebaters: () => void;
  onRerollTopic: () => void;
  onAddMember: () => void;
  onSelectModerator: (id: string) => void;
  onOpenParticipant: (id: string) => void;
}) {

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
          <picture>
            <source
              type="image/avif"
              srcSet={ARENA_AVIF_SRC_SET}
              sizes={ARENA_IMAGE_SIZES}
            />
            <source
              type="image/webp"
              srcSet="/brand/landing/ai-pit-arena-960.webp 960w, /brand/landing/ai-pit-arena-1280.webp 1280w, /brand/landing/ai-pit-arena-1896.webp 1896w"
              sizes={ARENA_IMAGE_SIZES}
            />
            <img
              src="/brand/landing/ai-pit-arena.png"
              alt=""
              aria-hidden="true"
              width={1896}
              height={830}
              loading="lazy"
              decoding="async"
              fetchPriority="high"
            />
          </picture>
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
                  <span className="hero-roster-count-pill">
                    {roster.length}/{MAX_DEBATE_PERSON_COUNT} personas
                  </span>
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
                disabled={!canAddMember}
                aria-label="Edit roster"
                title={canAddMember ? "Edit roster" : "Roster locked"}
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
        <h2 className="hero-panel-title">Ready to debate</h2>
        <p className="hero-panel-copy">Debates use The AI Pit&apos;s hosted models. Usage may be limited.</p>
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
          <Link href="/legal">Terms &amp; Privacy</Link>
          <TelemetryPreferencesButton className="footer-link-button" />
        </span>
        <SimulationNotice className="simulation-notice-hero" />
      </footer>
    </section>
  );
}

function CharacterSelectorModal({
  initialConfig,
  lineupOrder,
  onCancel,
  onConfirm,
}: {
  initialConfig: RunInput;
  lineupOrder: string[];
  onCancel: () => void;
  onConfirm: (nextConfig: RunInput) => void;
}) {
  const [query, setQuery] = useState("");
  const [draftConfig, setDraftConfig] = useState(initialConfig);
  const [filterPresets, setFilterPresets] = useState<((query: string) => ParticipantCharacterPreset[]) | null>(null);
  const [didPresetLoadFail, setDidPresetLoadFail] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const presets = filterPresets ? filterPresets(deferredQuery) : [];
  const draftRoster = [draftConfig.coordinator, ...draftConfig.members];
  const activeParticipants = orderParticipants(draftRoster, lineupOrder);
  const activeParticipantByPresetId = new Map(
    activeParticipants.flatMap((participant) => (participant.presetId ? [[participant.presetId, participant] as const] : [])),
  );
  const canRemoveSelectedParticipant = activeParticipants.length > 1;
  const canSelectMore = draftConfig.members.length < MAX_DEBATE_MEMBER_COUNT;
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
        onClick={onCancel}
      />

      <section
        ref={modalRef}
        className="settings-sheet character-selector-modal-panel w-full max-w-3xl p-6 sm:p-7"
        tabIndex={-1}
      >
        <div className="settings-modal-header">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">Pit Lineup</p>
            <p className="hero-panel-copy">
              {canSelectMore
                ? `Build a lineup of up to ${MAX_DEBATE_PERSON_COUNT} personas including the moderator.`
                : `Debates are limited to ${MAX_DEBATE_PERSON_COUNT} personas including the moderator.`}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel lineup changes"
            className="icon-circle-button character-selector-modal-close"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="character-selector-modal-stack">
          <div className="character-selector-selected-panel" aria-label="Selected lineup">
            <div className="character-selector-selected-header">
              <span>Selected lineup</span>
              <span>{activeParticipants.length}/{MAX_DEBATE_PERSON_COUNT}</span>
            </div>
            <div className="character-selector-selected-list">
              {activeParticipants.map((participant) => (
                <button
                  key={participant.id}
                  type="button"
                  className="character-selector-selected-pill"
                  disabled={!canRemoveSelectedParticipant}
                  aria-label={`Remove ${participant.name} from lineup`}
                  title={canRemoveSelectedParticipant ? `Remove ${participant.name}` : "Keep at least one persona"}
                  onClick={() => setDraftConfig((current) => removeParticipantFromLineup(current, participant.id))}
                >
                  <ParticipantAvatar
                    name={participant.name}
                    avatarUrl={participant.avatarUrl}
                    className="character-selector-selected-avatar"
                    fallbackClassName="character-selector-selected-avatar-fallback"
                    imageClassName="character-selector-selected-image"
                    sizes="32px"
                  />
                  <span className="character-selector-selected-copy">
                    <span className="character-selector-selected-name">{participant.name}</span>
                    <span className="character-selector-selected-role">
                      {participant.id === draftConfig.coordinator.id ? "Moderator" : "Debater"}
                    </span>
                  </span>
                  <CloseGlyph aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

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
                const activeParticipant = activeParticipantByPresetId.get(preset.id);
                const isApplied = Boolean(activeParticipant);
                const isDisabled = isApplied ? !canRemoveSelectedParticipant : !canSelectMore;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`character-preset-card${isApplied ? " is-applied" : ""}`}
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    aria-pressed={isApplied}
                    onClick={() => {
                      if (activeParticipant) {
                        setDraftConfig((current) => removeParticipantFromLineup(current, activeParticipant.id));
                        return;
                      }

                      setDraftConfig((current) => addParticipantToLineup(current, preset));
                    }}
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
                            {isApplied
                              ? "Selected"
                              : canSelectMore
                                ? getAudienceContextLabel(preset.audience)
                                : "Lineup full"}
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

          <div className="character-selector-actions">
            <button type="button" className="action-button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="action-button action-button-primary"
              onClick={() => onConfirm(draftConfig)}
            >
              Apply lineup
            </button>
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
          <p>{PUBLIC_REPLAY_VISIBILITY_NOTICE_TEXT}</p>
          <p>
            Public replays may include this AI-generated or manipulated material. {SYNTHETIC_MEDIA_DISCLOSURE_TEXT}
          </p>
          <p>{PUBLIC_REPLAY_MISUSE_NOTICE_TEXT}</p>
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
  const apiKey = "";
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
  const configRef = useRef(initialStudioState.config);
  const hasHydratedPresetConfigRef = useRef(false);
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);
  const generatedTurnCountRef = useRef(0);
  const acknowledgedTurnCountRef = useRef(0);
  const bufferedTurnWaitersRef = useRef(new Set<() => void>());

  const roster = [config.coordinator, ...config.members];
  const orderedRoster = orderParticipants(roster, lineupOrder);
  const hasValidatedApiKey =
    true;
  const hasPrompt = config.prompt.trim().length > 0;
  const hasValidLineupSize = config.members.length >= 2 && config.members.length <= MAX_DEBATE_MEMBER_COUNT;
  const transcriptTurns = flattenTurns(result);
  const transcriptPrompt = result?.prompt ?? config.prompt;
  const [transcriptMarkdown, setTranscriptMarkdown] = useState("");
  const deferredTranscriptMarkdown = useDeferredValue(transcriptMarkdown);
  const timeline = buildPlaybackTimeline(result);
  const frames = timeline.frames;
  const playbackTurnIds = buildPlaybackTurnIds(frames);
  const chapters = timeline.chapters;
  const totalDurationMs = timeline.totalDurationMs;
  const pendingTurnHasFrame = pendingTurn ? frames.some((frame) => isSameRuntimePlaybackTurn(frame, pendingTurn)) : false;
  const hasPendingFrame = isAwaitingTurnResponse && pendingTurn !== null && !pendingTurnHasFrame;
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
    // Retire the old personal-key setting; all requests use the hosted gateway.
    try { window.localStorage.removeItem("aipit.openrouter-api-key"); } catch {}
  }, []);

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

  function selectModerator(id: string) {
    setStarterBundleId(undefined);
    setConfig((current) => promoteParticipantToModerator(current, id));
  }

  function removeParticipant(id: string) {
    setStarterBundleId(undefined);
    setConfig((current) => removeParticipantFromLineup(current, id));
  }

  function applyCharacterLineup(nextConfig: RunInput) {
    const currentPresetIds = new Set(
      roster.flatMap((participant) => (participant.presetId ? [participant.presetId] : [])),
    );
    const nextRoster = [nextConfig.coordinator, ...nextConfig.members];
    const nextPresetIds = new Set(
      nextRoster.flatMap((participant) => (participant.presetId ? [participant.presetId] : [])),
    );

    nextRoster.forEach((participant) => {
      if (!participant.presetId || currentPresetIds.has(participant.presetId)) {
        return;
      }

      trackEvent("character_added", {
        preset_id: participant.presetId,
        debater_count: roster.length,
      });
    });

    roster.forEach((participant) => {
      if (!participant.presetId || nextPresetIds.has(participant.presetId)) {
        return;
      }

      trackEvent("character_removed", {
        debater_count: roster.length,
      });
    });

    hasHydratedPresetConfigRef.current = true;
    setStarterBundleId(undefined);
    setConfig((current) => ({
      ...current,
      coordinator: nextConfig.coordinator,
      members: nextConfig.members,
    }));
    setShowCharacterSelectorModal(false);
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
    const { createRandomLineup } = await import("@/lib/pit");
    const nextLineup = createRandomLineup(audience);
    const nextConfig = {
      ...configRef.current,
      coordinator: nextLineup.coordinator,
      members: nextLineup.members,
    };

    hasHydratedPresetConfigRef.current = true;
    configRef.current = nextConfig;
    setStarterBundleId(undefined);
    setConfig(nextConfig);
    trackEvent("starter_debaters_reroll", {
      starter_bundle_id: starterBundleId,
      starter_bundle_audience: audience,
    });
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
          legalNoticeToken: LEGAL_ACKNOWLEDGEMENT_TOKEN,
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

      if (!isShareCreationResponse(payload)) {
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

    if (!hasValidLineupSize) {
      setError(`Choose 2 to ${MAX_DEBATE_MEMBER_COUNT} debaters. The moderator counts toward the ${MAX_DEBATE_PERSON_COUNT}-person limit.`);
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
      {studioView === "setup" && error ? <div className="notice-row notice-row-error">{error}</div> : null}
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
            canSubmit={!isReplayOnly && hasValidatedApiKey && hasPrompt && hasValidLineupSize}
            canAddMember={!isReplayOnly}
            isRunning={isRunning}
            onPromptChange={(prompt) => setConfig((current) => ({ ...current, prompt }))}
            onRerollDebaters={rerollDebaters}
            onRerollTopic={rerollTopic}
            onAddMember={() => {
              setShowCharacterSelectorModal(true);
            }}
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
          initialConfig={config}
          lineupOrder={lineupOrder}
          onCancel={() => setShowCharacterSelectorModal(false)}
          onConfirm={applyCharacterLineup}
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
