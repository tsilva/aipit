import type {
  DebateRound,
  ParticipantConfig,
  PitTurn,
  RunInput,
  RunResult,
  TurnKind,
  TurnBubble,
  UsageSummary,
} from "@/lib/pit";
import { isJsonObject } from "@/lib/json";

export const SHARED_CONVERSATION_SNAPSHOT_KIND = "aipit-share";
export const CURRENT_SHARE_HISTORY_VERSION = 1;

const TURN_KINDS = new Set<TurnKind>(["opening", "member_turn", "intervention", "synthesis", "consensus"]);

export type SharedConversationSnapshot = {
  kind: typeof SHARED_CONVERSATION_SNAPSHOT_KIND;
  historyVersion: typeof CURRENT_SHARE_HISTORY_VERSION;
  createdAt: string;
  input: RunInput;
  result: RunResult;
};

export class SharedConversationSnapshotError extends Error {
  reason: "invalid" | "unsupported_version";

  constructor(message: string, reason: "invalid" | "unsupported_version") {
    super(message);
    this.name = "SharedConversationSnapshotError";
    this.reason = reason;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isTurnBubble(value: unknown): value is TurnBubble {
  return isJsonObject(value) && typeof value.id === "string" && typeof value.content === "string";
}

function isPitTurn(value: unknown): value is PitTurn {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.speakerId === "string" &&
    typeof value.speakerName === "string" &&
    typeof value.model === "string" &&
    typeof value.character === "string" &&
    typeof value.content === "string" &&
    typeof value.rawPrompt === "string" &&
    TURN_KINDS.has(value.kind as TurnKind) &&
    (value.round === undefined || isPositiveInteger(value.round)) &&
    Array.isArray(value.bubbles) &&
    value.bubbles.every(isTurnBubble)
  );
}

function isParticipantConfig(value: unknown): value is ParticipantConfig {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.model === "string" &&
    (value.presetId === undefined || typeof value.presetId === "string") &&
    (value.avatarUrl === undefined || typeof value.avatarUrl === "string") &&
    isJsonObject(value.characterProfile)
  );
}

function isUsageSummary(value: unknown): value is UsageSummary {
  return (
    isJsonObject(value) &&
    isFiniteNumber(value.promptTokens) &&
    isFiniteNumber(value.completionTokens) &&
    isFiniteNumber(value.totalTokens) &&
    isFiniteNumber(value.cost)
  );
}

function isDebateRound(value: unknown): value is DebateRound {
  return (
    isJsonObject(value) &&
    isPositiveInteger(value.round) &&
    Array.isArray(value.turns) &&
    value.turns.every(isPitTurn) &&
    (value.intervention === undefined || isPitTurn(value.intervention))
  );
}

function isRunInput(value: unknown): value is RunInput {
  return (
    isJsonObject(value) &&
    value.mode === "debate" &&
    typeof value.prompt === "string" &&
    typeof value.sharedDirective === "string" &&
    isPositiveInteger(value.rounds) &&
    isFiniteNumber(value.temperature) &&
    isFiniteNumber(value.maxCompletionTokens) &&
    isParticipantConfig(value.coordinator) &&
    Array.isArray(value.members) &&
    value.members.length >= 2 &&
    value.members.every(isParticipantConfig)
  );
}

function isRunResult(value: unknown): value is RunResult {
  return (
    isJsonObject(value) &&
    value.mode === "debate" &&
    typeof value.prompt === "string" &&
    Array.isArray(value.roster) &&
    value.roster.every(isParticipantConfig) &&
    isUsageSummary(value.usage) &&
    isStringArray(value.warnings) &&
    (value.opening === undefined || isPitTurn(value.opening)) &&
    (value.rounds === undefined || (Array.isArray(value.rounds) && value.rounds.every(isDebateRound))) &&
    (value.synthesis === undefined || isPitTurn(value.synthesis)) &&
    (value.consensus === undefined || isPitTurn(value.consensus))
  );
}

function hasCompleteDebateShape(input: RunInput, result: RunResult): boolean {
  if (
    result.mode !== input.mode ||
    result.prompt !== input.prompt ||
    result.roster.length !== input.members.length + 1 ||
    !result.opening ||
    result.opening.kind !== "opening" ||
    !result.consensus ||
    result.consensus.kind !== "consensus" ||
    !result.rounds ||
    result.rounds.length !== input.rounds
  ) {
    return false;
  }

  if (result.synthesis && result.synthesis.kind !== "synthesis") {
    return false;
  }

  for (let index = 0; index < result.rounds.length; index += 1) {
    const round = result.rounds[index];
    const expectedRoundNumber = index + 1;

    if (!round || round.round !== expectedRoundNumber || round.turns.length !== input.members.length) {
      return false;
    }

    if (
      round.turns.some((turn) => turn.kind !== "member_turn" || turn.round !== expectedRoundNumber)
    ) {
      return false;
    }

    if (expectedRoundNumber < input.rounds) {
      if (
        !round.intervention ||
        round.intervention.kind !== "intervention" ||
        round.intervention.round !== expectedRoundNumber
      ) {
        return false;
      }
    } else if (round.intervention !== undefined) {
      return false;
    }
  }

  return true;
}

export function isCompletedRunResult(input: RunInput, result: RunResult): boolean {
  return hasCompleteDebateShape(input, result);
}

export function assertShareableRunPayload(input: unknown, result: unknown): {
  input: RunInput;
  result: RunResult;
} {
  if (!isRunInput(input) || !isRunResult(result) || !hasCompleteDebateShape(input, result)) {
    throw new SharedConversationSnapshotError("Only completed debates can be shared.", "invalid");
  }

  return { input, result };
}

function sanitizeTurnForSharing(turn: PitTurn | undefined): PitTurn | undefined {
  if (!turn) {
    return undefined;
  }

  const sanitized = structuredClone(turn);
  sanitized.rawPrompt = "";
  return sanitized;
}

export function sanitizeRunResultForSharing(result: RunResult): RunResult {
  const sanitized = structuredClone(result);
  sanitized.opening = sanitizeTurnForSharing(result.opening);
  sanitized.rounds = result.rounds?.map((round) => ({
    ...structuredClone(round),
    turns: round.turns.map((turn) => sanitizeTurnForSharing(turn)!),
    intervention: sanitizeTurnForSharing(round.intervention),
  }));
  sanitized.synthesis = sanitizeTurnForSharing(result.synthesis);
  sanitized.consensus = sanitizeTurnForSharing(result.consensus);
  return sanitized;
}

export function createSharedConversationSnapshot({
  input,
  result,
  createdAt = new Date().toISOString(),
}: {
  input: unknown;
  result: unknown;
  createdAt?: string;
}): SharedConversationSnapshot {
  const validated = assertShareableRunPayload(input, result);

  return {
    kind: SHARED_CONVERSATION_SNAPSHOT_KIND,
    historyVersion: CURRENT_SHARE_HISTORY_VERSION,
    createdAt,
    input: structuredClone(validated.input),
    result: sanitizeRunResultForSharing(validated.result),
  };
}

export function parseSharedConversationSnapshot(value: unknown): SharedConversationSnapshot {
  if (!isJsonObject(value) || value.kind !== SHARED_CONVERSATION_SNAPSHOT_KIND) {
    throw new SharedConversationSnapshotError("Invalid shared conversation snapshot.", "invalid");
  }

  if (value.historyVersion !== CURRENT_SHARE_HISTORY_VERSION) {
    throw new SharedConversationSnapshotError("Unsupported shared conversation version.", "unsupported_version");
  }

  if (typeof value.createdAt !== "string") {
    throw new SharedConversationSnapshotError("Invalid shared conversation snapshot.", "invalid");
  }

  const validated = assertShareableRunPayload(value.input, value.result);

  return {
    kind: SHARED_CONVERSATION_SNAPSHOT_KIND,
    historyVersion: CURRENT_SHARE_HISTORY_VERSION,
    createdAt: value.createdAt,
    input: validated.input,
    result: validated.result,
  };
}
