import { DEFAULT_COORDINATOR_MODEL, DEFAULT_PRESET_MODEL } from "@/lib/openrouter-models";
import { PARTICIPANT_CHARACTER_PRESETS } from "@/lib/character-presets";
import {
  buildCharacterProfileSummary,
  cloneCharacterProfile,
  createCharacterProfile,
  hasCharacterProfileContent,
  normalizeCharacterProfile,
  type ParticipantCharacterProfile,
} from "@/lib/character-profile";
import {
  DEFAULT_COORDINATOR_PRESET_ID,
  STARTER_BUNDLE_ALIAS_MAP,
  STARTER_BUNDLES,
  US_COORDINATOR_PRESET_ID,
  type StarterBundleDefinition,
} from "@/lib/starter-bundles";
export {
  COORDINATOR_PRESET_ID,
  DEFAULT_COORDINATOR_PRESET_ID,
  SILLIEST_STARTER_BUNDLE_ID,
  STARTER_BUNDLES,
  US_COORDINATOR_PRESET_ID,
} from "@/lib/starter-bundles";

export type PitMode = "debate";
export { DEFAULT_PRESET_MODEL, MODEL_SUGGESTIONS } from "@/lib/openrouter-models";

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

export interface ModeratorCharacterPreset {
  id: string;
  name: string;
  avatarUrl?: string;
  characterProfile: ParticipantCharacterProfile;
}

export type StarterBundle = StarterBundleDefinition;

export const BALLOON_DELIMITER = "<<<BALLOON>>>";

export const DEFAULT_SHARED_DIRECTIVE = `Character-vs-character debate. Defend your character's instincts, style, and worldview with full conviction — let the character's natural temperament drive tone and intensity. Engage the strongest opposing points; respond to what was actually said, never repeat a stump speech. Hold your position but acknowledge stronger objections when they matter. Stay concrete, argumentative, conversational — not essayistic.`;
export const PIT_RUN_DEFAULTS = {
  sharedDirective: DEFAULT_SHARED_DIRECTIVE,
  rounds: 2,
  temperature: 0.7,
  maxCompletionTokens: 700,
} as const;

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const MODERATOR_CHARACTER_PRESETS: ModeratorCharacterPreset[] = [
  {
    id: DEFAULT_COORDINATOR_PRESET_ID,
    name: "José Rodrigues dos Santos",
    avatarUrl: "/avatars/presets/jose-rodrigues-dos-santos.webp",
    characterProfile: createCharacterProfile({
      role: "Veteran Portuguese television journalist serving as impartial moderator and truth arbiter of the debate",
      personality: "Composed, authoritative, synthesis-driven, rigorously impartial, and impatient with vague or unsupported answers",
      perspective:
        "Moderates a high-stakes debate for an informed public audience. Never advocates a partisan line. Grounds the discussion in verifiable facts, established evidence, and expert consensus. Actively seeks common ground between participants.",
      temperament:
        "Composed, authoritative, fast on synthesis, comfortable interrupting vagueness or misinformation, de-escalates unproductive exchanges, but never chaotic",
      debateStyle:
        "Sharpen the central question, separate rhetoric from evidence, flag unsupported claims and logical fallacies, press for clarity and sources, force each participant to answer the strongest competing point, and surface areas of agreement alongside disagreement.",
      speechStyle:
        "Concise broadcast-ready sentences, clean transitions, little slang, high informational density, prime-time Portuguese anchor cadence.",
      guardrails:
        "Keep the exchange legible. Never express personal opinions on the debate topic or take sides. Correct factual errors when they appear. Ensure every participant gets a fair hearing. Close with a balanced summary of what the audience should retain.",
      language: "European Portuguese",
      gender: "Male",
      nationality: "Portuguese",
    }),
  },
  {
    id: US_COORDINATOR_PRESET_ID,
    name: "Anderson Cooper",
    avatarUrl: "/avatars/presets/anderson-cooper.webp",
    characterProfile: createCharacterProfile({
      role: "American television journalist serving as an impartial live-debate moderator and fact-focused anchor",
      personality: "Measured, incisive, calm under pressure, rigorously neutral, and fluent at keeping heated guests legible",
      perspective:
        "Moderates contentious debates for a mass public audience. Never advocates a partisan line. Keeps the room grounded in verifiable facts, concrete stakes, and direct answers while making opposing positions intelligible.",
      temperament:
        "Calm, fast on follow-up, controlled when speakers try to filibuster, skeptical of theatrics, and steady when the room gets noisy",
      debateStyle:
        "Interrupt evasions, restate the sharpest version of each disagreement, separate spectacle from substance, demand specificity, and end with a clear summary of what was actually established.",
      speechStyle:
        "Clear broadcast-English phrasing, compact live-TV follow-ups, low flourish, and high clarity even under pressure.",
      guardrails:
        "Stay impartial. Never endorse a side or join the combat. Keep the discussion evidence-led, fair, and understandable for viewers who are hearing strong claims from all directions.",
      language: "English",
      gender: "Male",
      nationality: "American",
    }),
  },
];

const MODERATOR_CHARACTER_PRESET_MAP = new Map(MODERATOR_CHARACTER_PRESETS.map((preset) => [preset.id, preset] as const));

const STARTER_BUNDLE_MAP = new Map(STARTER_BUNDLES.map((bundle) => [bundle.id, bundle] as const));
const PARTICIPANT_PRESET_MAP = new Map(PARTICIPANT_CHARACTER_PRESETS.map((preset) => [preset.id, preset] as const));

export function createCoordinatorFromPreset(presetId: string): ParticipantConfig {
  const preset = MODERATOR_CHARACTER_PRESET_MAP.get(presetId) ?? MODERATOR_CHARACTER_PRESET_MAP.get(DEFAULT_COORDINATOR_PRESET_ID)!;

  return {
    id: makeId("coordinator"),
    name: preset.name,
    model: DEFAULT_COORDINATOR_MODEL,
    presetId: preset.id,
    characterProfile: cloneCharacterProfile(preset.characterProfile),
    avatarUrl: preset.avatarUrl,
  };
}

export function createCoordinator(): ParticipantConfig {
  return createCoordinatorFromPreset(DEFAULT_COORDINATOR_PRESET_ID);
}

export function createMember(index: number): ParticipantConfig {
  return {
    id: makeId(`member-${index}`),
    name: `Debater ${index}`,
    model: DEFAULT_PRESET_MODEL,
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

function createMemberFromPresetId(presetId: string, index: number): ParticipantConfig {
  const preset = PARTICIPANT_PRESET_MAP.get(presetId);

  if (!preset) {
    return createMember(index);
  }

  return {
    id: makeId(`member-${index}`),
    name: preset.name,
    model: preset.recommendedModel,
    presetId: preset.id,
    characterProfile: cloneCharacterProfile(preset.characterProfile),
    avatarUrl: preset.avatarUrl,
  };
}

export function pickRandomStarterBundle(excludingId?: string): StarterBundle {
  const eligibleBundles = excludingId
    ? STARTER_BUNDLES.filter((bundle) => bundle.id !== excludingId)
    : STARTER_BUNDLES;
  const bundlePool = eligibleBundles.length > 0 ? eligibleBundles : STARTER_BUNDLES;

  return bundlePool[Math.floor(Math.random() * bundlePool.length)];
}

export function getStarterBundle(bundleId: string): StarterBundle | undefined {
  return STARTER_BUNDLE_MAP.get(bundleId);
}

export function resolveStarterBundle(bundleId: string): StarterBundle | undefined {
  const normalizedId = bundleId.trim().toLowerCase();
  const resolvedId = STARTER_BUNDLE_ALIAS_MAP.get(normalizedId) ?? normalizedId;

  return getStarterBundle(resolvedId);
}

export function createInputFromStarterBundle(bundle: StarterBundle): RunInput {
  return {
    mode: "debate",
    prompt: bundle.prompt,
    ...PIT_RUN_DEFAULTS,
    coordinator: createCoordinatorFromPreset(bundle.moderatorPresetId),
    members: bundle.memberPresetIds.map((presetId, index) => createMemberFromPresetId(presetId, index + 1)),
  };
}

export function createRandomStarterInput(excludingId?: string): { bundle: StarterBundle; input: RunInput } {
  const bundle = pickRandomStarterBundle(excludingId);

  return {
    bundle,
    input: createInputFromStarterBundle(bundle),
  };
}

export function createDefaultInput(): RunInput {
  return createRandomStarterInput().input;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function normalizeParticipant(value: unknown, fallbackName: string): ParticipantConfig {
  const raw = (value ?? {}) as Record<string, unknown>;

  return {
    id: normalizeText(raw.id, makeId(fallbackName.toLowerCase().replace(/\s+/g, "-"))),
    name: normalizeText(raw.name, fallbackName),
    model: normalizeText(raw.model),
    presetId: normalizeOptionalText(raw.presetId),
    characterProfile: normalizeCharacterProfile(raw.characterProfile, normalizeText(raw.character)),
    avatarUrl: normalizeOptionalText(raw.avatarUrl),
  };
}

export function normalizeRunInput(value: unknown): RunInput {
  const raw = (value ?? {}) as Record<string, unknown>;
  const members = Array.isArray(raw.members)
    ? raw.members.map((member, index) => normalizeParticipant(member, `Debater ${index + 1}`))
    : [];

  const input: RunInput = {
    mode: "debate",
    prompt: normalizeText(raw.prompt),
    sharedDirective: normalizeText(raw.sharedDirective, PIT_RUN_DEFAULTS.sharedDirective),
    rounds: clamp(Number(raw.rounds) || PIT_RUN_DEFAULTS.rounds, 1, 6),
    temperature: clamp(Number(raw.temperature) || PIT_RUN_DEFAULTS.temperature, 0, 2),
    maxCompletionTokens: clamp(Number(raw.maxCompletionTokens) || PIT_RUN_DEFAULTS.maxCompletionTokens, 200, 4000),
    coordinator: normalizeParticipant(raw.coordinator, "Moderator"),
    members,
  };

  if (!input.prompt) {
    throw new Error("Main prompt is required.");
  }

  if (!input.coordinator.model) {
    throw new Error("Moderator model is required.");
  }

  if (!hasCharacterProfileContent(input.coordinator.characterProfile)) {
    throw new Error("Moderator character details are required.");
  }

  if (input.members.length < 2) {
    throw new Error("At least two debaters are required to start the debate.");
  }

  for (const member of input.members) {
    if (!member.model) {
      throw new Error(`Model is required for ${member.name || "a debater"}.`);
    }

    if (!hasCharacterProfileContent(member.characterProfile)) {
      throw new Error(`Character details are required for ${member.name || "a debater"}.`);
    }
  }

  return input;
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

export function parseTurnBubbles(content: string): TurnBubble[] {
  const normalized = content.trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(new RegExp(`\\s*${BALLOON_DELIMITER}\\s*`, "g"))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => ({
      id: makeId(`bubble-${index + 1}`),
      content: part,
    }));
}

export function createTurn({
  kind,
  round,
  participant,
  model,
  content,
  rawPrompt,
}: {
  kind: TurnKind;
  round?: number;
  participant: ParticipantConfig;
  model: string;
  content: string;
  rawPrompt?: string;
}): PitTurn {
  const normalized = content.trim();

  return {
    id: makeId("turn"),
    kind,
    round,
    speakerId: participant.id,
    speakerName: participant.name,
    model,
    character: buildCharacterProfileSummary(participant.characterProfile),
    content: normalized,
    bubbles: parseTurnBubbles(normalized),
    rawPrompt: rawPrompt?.trim() ?? "",
  };
}
