import { buildCharacterProfileSummary, cloneCharacterProfile, createCharacterProfile, type ParticipantCharacterProfile } from "@/lib/character-profile";
import { OPENROUTER_MODEL_COMBATIVE } from "@/lib/openrouter-models";

export type PitMode = "debate";

export type TurnKind =
  | "opening"
  | "member_turn"
  | "intervention"
  | "synthesis"
  | "consensus";

export interface TurnBubble {
  id: string;
  content: string;
}

export interface ParticipantConfig {
  id: string;
  name: string;
  model: string;
  presetId?: string;
  characterProfile: ParticipantCharacterProfile;
  avatarUrl?: string;
  speakingAvatarUrl?: string;
}

export interface RunInput {
  mode: PitMode;
  prompt: string;
  sharedDirective: string;
  rounds: number;
  temperature: number;
  maxCompletionTokens: number;
  coordinator: ParticipantConfig;
  members: ParticipantConfig[];
}

export interface UsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface PitTurn {
  id: string;
  kind: TurnKind;
  round?: number;
  speakerId: string;
  speakerName: string;
  model: string;
  character: string;
  content: string;
  bubbles: TurnBubble[];
  rawPrompt: string;
}

export interface DebateRound {
  round: number;
  turns: PitTurn[];
  intervention?: PitTurn;
}

export interface RunResult {
  mode: PitMode;
  prompt: string;
  roster: ParticipantConfig[];
  opening?: PitTurn;
  rounds?: DebateRound[];
  synthesis?: PitTurn;
  consensus?: PitTurn;
  usage: UsageSummary;
  warnings: string[];
}

export const BALLOON_DELIMITER = "<<<BALLOON>>>";

const DEFAULT_SHARED_DIRECTIVE = `Character-vs-character debate. Defend your character's instincts, style, and worldview with full conviction — let the character's natural temperament, cadence, verbal habits, and rhetorical flaws drive the delivery. Engage the strongest opposing points; respond to what was actually said, never repeat a stump speech. Hold your position but acknowledge stronger objections when they matter. Stay concrete, argumentative, conversational, and authentic to the assigned voice rather than essayistic or over-polished.`;
export const PIT_RUN_DEFAULTS = {
  sharedDirective: DEFAULT_SHARED_DIRECTIVE,
  rounds: 2,
  temperature: 0.7,
  maxCompletionTokens: 700,
} as const;

export function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMember(index: number): ParticipantConfig {
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

export function emptyUsage(): UsageSummary {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
}

export function addUsage(target: UsageSummary, delta?: Partial<UsageSummary> | null): UsageSummary {
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

export function createRosterSnapshot(input: RunInput): ParticipantConfig[] {
  return [input.coordinator, ...input.members].map((participant) => ({
    ...participant,
    characterProfile: cloneCharacterProfile(participant.characterProfile),
  }));
}

function parseTurnBubbles(content: string, turnId: string): TurnBubble[] {
  const normalized = content.trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(new RegExp(`\\s*${BALLOON_DELIMITER}\\s*`, "g"))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => ({
      id: `${turnId}-bubble-${index + 1}`,
      content: part,
    }));
}

export function createTurn({
  id,
  kind,
  round,
  participant,
  model,
  content,
  rawPrompt,
}: {
  id?: string;
  kind: TurnKind;
  round?: number;
  participant: ParticipantConfig;
  model: string;
  content: string;
  rawPrompt?: string;
}): PitTurn {
  const turnId = id ?? makeId("turn");
  const normalized = content.trim();

  return {
    id: turnId,
    kind,
    round,
    speakerId: participant.id,
    speakerName: participant.name,
    model,
    character: buildCharacterProfileSummary(participant.characterProfile),
    content: normalized,
    bubbles: parseTurnBubbles(normalized, turnId),
    rawPrompt: rawPrompt?.trim() ?? "",
  };
}
