import { DEFAULT_COORDINATOR_MODEL, DEFAULT_PRESET_MODEL } from "@/lib/openrouter-models";
import { PARTICIPANT_PERSONA_PRESETS } from "@/lib/persona-presets";
import {
  buildPersonaProfileSummary,
  clonePersonaProfile,
  createPersonaProfile,
  hasPersonaProfileContent,
  normalizePersonaProfile,
  type ParticipantPersonaProfile,
} from "@/lib/persona-profile";

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
  personaProfile: ParticipantPersonaProfile;
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
  persona: string;
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

export interface ModeratorPersonaPreset {
  id: string;
  name: string;
  avatarUrl?: string;
  personaProfile: ParticipantPersonaProfile;
}

export interface StarterBundle {
  id: string;
  name: string;
  prompt: string;
  moderatorPresetId: string;
  memberPresetIds: readonly [string, string, string];
}

export const DEFAULT_COORDINATOR_PRESET_ID = "jose-rodrigues-dos-santos";
export const COORDINATOR_PRESET_ID = DEFAULT_COORDINATOR_PRESET_ID;
export const US_COORDINATOR_PRESET_ID = "anderson-cooper";

export const BALLOON_DELIMITER = "<<<BALLOON>>>";

export const DEFAULT_SHARED_DIRECTIVE = `Persona-vs-persona debate. Defend your persona's instincts, style, and worldview with full conviction — let the persona's natural temperament drive tone and intensity. Engage the strongest opposing points; respond to what was actually said, never repeat a stump speech. Hold your position but acknowledge stronger objections when they matter. Stay concrete, argumentative, conversational — not essayistic.`;
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

const MODERATOR_PERSONA_PRESETS: ModeratorPersonaPreset[] = [
  {
    id: DEFAULT_COORDINATOR_PRESET_ID,
    name: "José Rodrigues dos Santos",
    avatarUrl: "/avatars/presets/jose-rodrigues-dos-santos.jpg",
    personaProfile: createPersonaProfile({
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
    avatarUrl: "/avatars/presets/anderson-cooper.jpg",
    personaProfile: createPersonaProfile({
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

const MODERATOR_PERSONA_PRESET_MAP = new Map(MODERATOR_PERSONA_PRESETS.map((preset) => [preset.id, preset] as const));

export const STARTER_BUNDLES: StarterBundle[] = [
  {
    id: "portugal-housing-war",
    name: "Portugal Housing War",
    prompt: "Should governments criminalize street camping even when housing supply is still broken?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["luis-montenegro", "mariana-mortagua", "andre-ventura"],
  },
  {
    id: "property-war-portugal",
    name: "Property War Portugal",
    prompt: "Should governments impose hard limits on how many homes one person or fund can own?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "joao-cotrim-de-figueiredo", "henrique-gouveia-e-melo"],
  },
  {
    id: "security-state-pressure",
    name: "Security State Pressure",
    prompt: "Should governments make DNA databases mandatory for all citizens to solve future crimes?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["henrique-gouveia-e-melo", "andre-ventura", "mariana-mortagua"],
  },
  {
    id: "gender-identity-flashpoint",
    name: "Gender Identity Flashpoint",
    prompt: "Can men get pregnant?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "andre-ventura", "luis-montenegro"],
  },
  {
    id: "podcaster-free-speech-war",
    name: "Podcaster Free Speech War",
    prompt: "Should online anonymity be abolished for accounts with more than a million followers?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["alex-jones", "lex-fridman", "joe-rogan"],
  },
  {
    id: "ai-liability-meltdown",
    name: "AI Liability Meltdown",
    prompt: "Should AI companies be held criminally liable when their models enable mass fraud or suicide coaching?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["elon-musk", "lex-fridman", "rick-sanchez"],
  },
  {
    id: "border-prime-time",
    name: "Border Prime Time",
    prompt: "Should rich democracies deport migrants who enter illegally even if they have built families locally?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["donald-trump", "joe-rogan", "alex-jones"],
  },
  {
    id: "absurdity-welfare-panel",
    name: "Absurdity Welfare Panel",
    prompt: "Should universal basic income replace most targeted welfare programs even if some vulnerable groups lose out?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["homer-simpson", "rick-sanchez", "knight-who-says-ni"],
  },
  {
    id: "ocean-democracy-meltdown",
    name: "Ocean Democracy Meltdown",
    prompt: "Should dolphins get voting rights in coastal cities if they can consistently recognize corrupt politicians?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["rick-sanchez", "homer-simpson", "knight-who-says-ni"],
  },
];

const STARTER_BUNDLE_MAP = new Map(STARTER_BUNDLES.map((bundle) => [bundle.id, bundle] as const));
const PARTICIPANT_PRESET_MAP = new Map(PARTICIPANT_PERSONA_PRESETS.map((preset) => [preset.id, preset] as const));

export function createCoordinatorFromPreset(presetId: string): ParticipantConfig {
  const preset = MODERATOR_PERSONA_PRESET_MAP.get(presetId) ?? MODERATOR_PERSONA_PRESET_MAP.get(DEFAULT_COORDINATOR_PRESET_ID)!;

  return {
    id: makeId("coordinator"),
    name: preset.name,
    model: DEFAULT_COORDINATOR_MODEL,
    presetId: preset.id,
    personaProfile: clonePersonaProfile(preset.personaProfile),
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
    personaProfile:
      index % 2 === 0
        ? createPersonaProfile({
            role: "Analytical pragmatist",
            personality: "Evidence-driven, practical, and focused on tradeoffs",
            perspective: "Evaluates proposals through tradeoffs, evidence, and practical execution.",
            debateStyle: "Prioritize concrete tradeoffs, operational constraints, and implementation realism.",
          })
        : createPersonaProfile({
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
    personaProfile: clonePersonaProfile(preset.personaProfile),
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
    personaProfile: normalizePersonaProfile(raw.personaProfile, normalizeText(raw.persona)),
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

  if (!hasPersonaProfileContent(input.coordinator.personaProfile)) {
    throw new Error("Moderator persona details are required.");
  }

  if (input.members.length < 2) {
    throw new Error("At least two debaters are required to start the debate.");
  }

  for (const member of input.members) {
    if (!member.model) {
      throw new Error(`Model is required for ${member.name || "a debater"}.`);
    }

    if (!hasPersonaProfileContent(member.personaProfile)) {
      throw new Error(`Persona details are required for ${member.name || "a debater"}.`);
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
    personaProfile: clonePersonaProfile(participant.personaProfile),
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
    persona: buildPersonaProfileSummary(participant.personaProfile),
    content: normalized,
    bubbles: parseTurnBubbles(normalized),
    rawPrompt: rawPrompt?.trim() ?? "",
  };
}
