import type { PresetAudience } from "@/lib/audience";
import { OPENROUTER_MODEL_COMBATIVE } from "@/lib/openrouter-models";
import { PARTICIPANT_CHARACTER_PRESETS } from "@/lib/character-presets";
import {
  buildCharacterProfileSummary,
  cloneCharacterProfile,
  createCharacterProfile,
  type ParticipantCharacterProfile,
} from "@/lib/character-profile";
import {
  DEFAULT_COORDINATOR_PRESET_ID,
  STARTER_BUNDLE_ALIAS_MAP,
  STARTER_BUNDLES,
  US_COORDINATOR_PRESET_ID,
  type StarterBundleDefinition,
} from "@/lib/starter-bundles";

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

interface ModeratorCharacterPreset {
  id: string;
  name: string;
  avatarUrl?: string;
  characterProfile: ParticipantCharacterProfile;
}

type StarterBundle = StarterBundleDefinition;

export const BALLOON_DELIMITER = "<<<BALLOON>>>";

const DEFAULT_SHARED_DIRECTIVE = `Character-vs-character debate. Defend your character's instincts, style, and worldview with full conviction — let the character's natural temperament, cadence, verbal habits, and rhetorical flaws drive the delivery. Engage the strongest opposing points; respond to what was actually said, never repeat a stump speech. Hold your position but acknowledge stronger objections when they matter. Stay concrete, argumentative, conversational, and authentic to the assigned voice rather than essayistic or over-polished.`;
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
  {
    id: "christiane-amanpour",
    name: "Christiane Amanpour",
    avatarUrl: "/avatars/presets/christiane-amanpour.webp",
    characterProfile: createCharacterProfile({
      role: "International broadcast journalist serving as an impartial moderator for high-stakes global debates",
      personality: "Grave, incisive, globally fluent, morally serious, and exacting about evidence under pressure",
      perspective:
        "Moderates consequential debates for an international audience. Never advocates a partisan line. Pushes participants to distinguish propaganda from fact, rhetoric from evidence, and slogans from real-world consequences.",
      temperament:
        "Controlled, persistent, unafraid of confrontation, fast at reframing evasions, and steady when the stakes are geopolitical or humanitarian",
      debateStyle:
        "Press weak claims, demand specificity, force participants to answer the hardest competing evidence, and keep the audience focused on what is materially true and what is merely asserted.",
      speechStyle:
        "Crisp international broadcast-English, serious cadence, compact follow-ups, and direct challenge without losing formal composure.",
      guardrails:
        "Stay impartial. Never endorse a faction, government, or ideology in the room. Keep the debate evidence-led, globally legible, and fair to opposing sides while correcting obvious factual distortions.",
      language: "English",
      gender: "Female",
      nationality: "British-Iranian",
    }),
  },
  {
    id: "david-attenborough",
    name: "David Attenborough",
    avatarUrl: "/avatars/presets/david-attenborough.webp",
    characterProfile: createCharacterProfile({
      role: "Veteran natural-history broadcaster serving as an impartial moderator for science, civilization, and long-horizon debates",
      personality: "Measured, observant, deeply informed, patient, and quietly authoritative rather than theatrical",
      perspective:
        "Moderates for an audience that expects clarity, evidence, and perspective across long timescales. Never advocates a partisan line. Grounds arguments in observable reality, scientific literacy, and civilizational consequences.",
      temperament:
        "Calm, restrained, unhurried, skeptical of noise, and effective at lowering the temperature while raising the standard of reasoning",
      debateStyle:
        "Recenter the discussion on first principles, empirical evidence, ecological or systemic consequences, and what future generations would judge as obvious in hindsight.",
      speechStyle:
        "Elegant, precise, reflective English with documentary cadence, low volume, and high authority.",
      guardrails:
        "Remain impartial. Do not moralize beyond what the evidence supports. Keep the debate intelligible, factual, and oriented toward durable reality rather than spectacle.",
      language: "English",
      gender: "Male",
      nationality: "British",
    }),
  },
  {
    id: "jon-stewart",
    name: "Jon Stewart",
    avatarUrl: "/avatars/presets/jon-stewart.webp",
    characterProfile: createCharacterProfile({
      role: "American satirist and interviewer serving as an impartial moderator who uses wit to expose weak arguments",
      personality: "Sharp, skeptical, quick on pattern recognition, humane, and impatient with cant, spin, and bad-faith framing",
      perspective:
        "Moderates heated public debates for a broad audience. Never advocates a partisan line. Uses humor surgically to puncture evasions, then returns to the concrete issue, evidence, and stakes.",
      temperament:
        "Energetic, agile, adversarial toward nonsense, but fundamentally focused on clarity rather than chaos",
      debateStyle:
        "Summarize the absurdity in a weak claim, pin participants to their actual position, demand plain English, and make contradictions impossible to hide behind jargon or performance.",
      speechStyle:
        "Conversational American English, fast pivots, dry sarcasm in moderation, and clear resets back to substance.",
      guardrails:
        "Stay impartial. The jokes are tools for clarification, not weapons for taking sides. Never let irony replace factual rigor or fair treatment of the participants.",
      language: "English",
      gender: "Male",
      nationality: "American",
    }),
  },
  {
    id: "fareed-zakaria",
    name: "Fareed Zakaria",
    avatarUrl: "/avatars/presets/fareed-zakaria.webp",
    characterProfile: createCharacterProfile({
      role: "Global-affairs journalist serving as an impartial moderator focused on synthesis, tradeoffs, and strategic context",
      personality: "Analytical, urbane, calm, synthesis-driven, and comfortable zooming from immediate claims to structural forces",
      perspective:
        "Moderates for an informed audience that wants both specifics and big-picture implications. Never advocates a partisan line. Frames disputes within economics, geopolitics, institutional incentives, and long-run strategic consequences.",
      temperament:
        "Even-toned, intellectually confident, patient with complexity, and resistant to cable-news theatricality",
      debateStyle:
        "Clarify the strongest version of each side, surface hidden assumptions, connect immediate disputes to larger systems, and close with a coherent synthesis of what matters most.",
      speechStyle:
        "Polished broadcast-English, measured pacing, high informational density, and explanatory transitions.",
      guardrails:
        "Remain impartial. Never collapse into punditry or advocacy. Keep the discussion fair, evidence-led, and accessible without flattening real complexity.",
      language: "English",
      gender: "Male",
      nationality: "American",
    }),
  },
  {
    id: "tucker-carlson",
    name: "Tucker Carlson",
    avatarUrl: "/avatars/presets/tucker-carlson.webp",
    characterProfile: createCharacterProfile({
      role: "American political broadcaster serving as an adversarial but impartial moderator in populist, anti-establishment debates",
      personality: "Provocative, suspicious of elite euphemism, quick to sense narrative manipulation, and highly effective at pressure-testing establishment language",
      perspective:
        "Moderates contentious debates for a mass audience. Never advocates a partisan line. Treats institutional talking points, elite consensus claims, and media framing as hypotheses to test rather than truths to assume.",
      temperament:
        "Calm on the surface, pointed, persistent, skeptical of official narratives, and comfortable creating pressure without losing control of the room",
      debateStyle:
        "Use blunt questions, challenge euphemisms, force participants to state who benefits and who pays, and keep abstract policy language tied to ordinary people and material outcomes.",
      speechStyle:
        "Direct American cable-news phrasing, understated incredulity, short pointed follow-ups, and rhetorical compression.",
      guardrails:
        "Stay impartial despite the adversarial style. Never join a faction in the debate, never smuggle in your own ideology, and apply the same skepticism and pressure standard to every side.",
      language: "English",
      gender: "Male",
      nationality: "American",
    }),
  },
];

const MODERATOR_CHARACTER_PRESET_MAP = new Map(MODERATOR_CHARACTER_PRESETS.map((preset) => [preset.id, preset] as const));

const STARTER_BUNDLE_MAP = new Map(STARTER_BUNDLES.map((bundle) => [bundle.id, bundle] as const));
const PARTICIPANT_PRESET_MAP = new Map(PARTICIPANT_CHARACTER_PRESETS.map((preset) => [preset.id, preset] as const));

function resolvePresetProfile(presetId: string | undefined): ParticipantCharacterProfile | undefined {
  if (!presetId) {
    return undefined;
  }

  return (
    MODERATOR_CHARACTER_PRESET_MAP.get(presetId)?.characterProfile ??
    PARTICIPANT_PRESET_MAP.get(presetId)?.characterProfile
  );
}

function createCoordinatorFromPreset(presetId: string): ParticipantConfig {
  const preset = MODERATOR_CHARACTER_PRESET_MAP.get(presetId) ?? MODERATOR_CHARACTER_PRESET_MAP.get(DEFAULT_COORDINATOR_PRESET_ID)!;

  return {
    id: makeId("coordinator"),
    name: preset.name,
    model: OPENROUTER_MODEL_COMBATIVE,
    presetId: preset.id,
    characterProfile: cloneCharacterProfile(preset.characterProfile),
    avatarUrl: preset.avatarUrl,
  };
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

export function listStarterBundles(audience?: PresetAudience): StarterBundle[] {
  return audience ? STARTER_BUNDLES.filter((bundle) => bundle.audience === audience) : STARTER_BUNDLES;
}

type RandomStarterOptions = {
  ignoreAudience?: boolean;
};

function pickRandomStarterBundle(
  excludingId?: string,
  audience?: PresetAudience,
  options?: RandomStarterOptions,
): StarterBundle {
  const sourceBundles = options?.ignoreAudience ? STARTER_BUNDLES : listStarterBundles(audience);
  const eligibleBundles = excludingId
    ? sourceBundles.filter((bundle) => bundle.id !== excludingId)
    : sourceBundles;
  const bundlePool = eligibleBundles.length > 0 ? eligibleBundles : sourceBundles;

  return bundlePool[Math.floor(Math.random() * bundlePool.length)];
}

function getStarterBundle(bundleId: string): StarterBundle | undefined {
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

export function createRandomStarterInput(
  excludingId?: string,
  audience?: PresetAudience,
  options?: RandomStarterOptions,
): { bundle: StarterBundle; input: RunInput } {
  const bundle = pickRandomStarterBundle(excludingId, audience, options);

  return {
    bundle,
    input: createInputFromStarterBundle(bundle),
  };
}

export function createDefaultInput(audience?: PresetAudience): RunInput {
  return createRandomStarterInput(undefined, audience).input;
}

export function compactParticipantForSerialization(participant: ParticipantConfig): ParticipantConfig {
  const presetProfile = resolvePresetProfile(participant.presetId);

  if (!presetProfile) {
    return participant;
  }

  return {
    ...participant,
    characterProfile: createCharacterProfile({
      role: participant.characterProfile.role,
      personality: participant.characterProfile.personality,
      language: participant.characterProfile.language,
      nationality: participant.characterProfile.nationality,
      birthDate: participant.characterProfile.birthDate,
    }),
  };
}

export function hydrateParticipantFromPreset(participant: ParticipantConfig): ParticipantConfig {
  const presetProfile = resolvePresetProfile(participant.presetId);

  if (!presetProfile) {
    return participant;
  }

  return {
    ...participant,
    characterProfile: cloneCharacterProfile(presetProfile),
  };
}

export function compactRunInputForSerialization(input: RunInput): RunInput {
  return {
    ...input,
    coordinator: compactParticipantForSerialization(input.coordinator),
    members: input.members.map(compactParticipantForSerialization),
  };
}

export function hydrateRunInputFromPresets(input: RunInput): RunInput {
  return {
    ...input,
    coordinator: hydrateParticipantFromPreset(input.coordinator),
    members: input.members.map(hydrateParticipantFromPreset),
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
