"use client";

import {
  ArrowLeft as BackGlyph,
  CircleCheck as CheckGlyph,
  Copy as CopyGlyph,
  FileText as PromptGlyph,
  Pause as PauseGlyph,
  Play as PlayGlyph,
  Settings as SettingsGlyph,
  SkipBack as PreviousGlyph,
  SkipForward as NextGlyph,
  X as CloseGlyph,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  copyTextToClipboard,
  ParticipantAvatar,
  SpeakingParticipantAvatar,
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/components/pit-studio-primitives";
import { SimulationNotice } from "@/components/simulation-notice";
import { createCharacterProfile } from "@/lib/character-profile";
import { trackEvent } from "@/lib/google-analytics";
import { OPENROUTER_MODEL_COMBATIVE } from "@/lib/openrouter-models";
import { makeId, type ParticipantConfig, type PitTurn, type RunResult } from "@/lib/pit-core";
import {
  isSameRuntimePlaybackTurn,
  kindLabel,
  type PendingTurnPreview,
  type PlaybackFrame,
  type StagePanelMode,
  type TimelineChapter,
} from "@/lib/pit-playback";

const TranscriptMarkdownContent = dynamic(() => import("@/components/transcript-markdown"), {
  loading: () => <p className="transcript-markdown-p">Loading transcript...</p>,
  ssr: false,
});

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

export default function ChamberStage({
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
  const pendingTurnHasFrame = pendingTurn ? frames.some((frame) => isSameRuntimePlaybackTurn(frame, pendingTurn)) : false;
  const hasPendingFrame = isAwaitingTurnResponse && pendingTurn !== null && !pendingTurnHasFrame;
  const isShowingPendingTurn = hasPendingFrame && !currentFrame;
  const maxNavigableFrameIndex = hasPendingFrame ? frames.length : Math.max(frames.length - 1, 0);
  const queueScrollTargetId = (isShowingPendingTurn ? thinkingEntry?.id : activeEntry?.id) ?? thinkingEntry?.id ?? null;
  const pendingParticipant =
    pendingTurn ? roster.find((participant) => participant.id === pendingTurn.speakerId) ?? null : null;
  const pendingPreviewEntry =
    pendingTurn && hasPendingFrame
      ? {
          id: `pending-${pendingTurn.speakerId}-${pendingTurn.kind}-${pendingTurn.round ?? "final"}`,
          kind: pendingTurn.kind,
          speakerName: pendingTurn.speakerName,
          model: pendingTurn.model,
          chapterLabel: pendingTurn.round ? `${kindLabel(pendingTurn.kind)} ${pendingTurn.round}` : kindLabel(pendingTurn.kind),
          participant: pendingParticipant,
          state: "thinking" as const,
          frameIndex: null,
        }
      : null;
  const focusSpeaker =
    (isShowingPendingTurn ? pendingPreviewEntry?.participant : null) ??
    (currentFrame ? roster.find((participant) => participant.id === currentFrame.speakerId) : null) ??
    queuedFocusEntry?.participant ??
    null;
  const visibleQueuedEntry = isShowingPendingTurn ? (pendingPreviewEntry ?? thinkingEntry ?? queuedFocusEntry) : queuedFocusEntry;
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
