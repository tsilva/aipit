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

export const COORDINATOR_PRESET_ID = "jose-rodrigues-dos-santos";

export const BALLOON_DELIMITER = "<<<BALLOON>>>";

export const DEFAULT_SHARED_DIRECTIVE = `You are participating in a persona-versus-persona debate. Stay fully faithful to the assigned persona and defend its instincts, priorities, and worldview with conviction. Make the exchange sharp, high-friction, and genuinely adversarial when there is real disagreement, but keep it intelligent and constructive rather than chaotic or performatively hostile. Engage directly with the strongest points raised by the other debaters, digest what has already been said, and respond to the actual debate instead of repeating a canned stump speech. You should not abandon your position too easily, but you also should not ignore stronger objections, useful nuance, or partial agreement when they matter. Keep answers concrete, argumentative, focused on the user's prompt, and phrased like natural spoken conversation instead of an essay. Each participant should keep speaking in their own native language throughout the debate and assume translators are handling mutual understanding.`;
export const PIT_RUN_DEFAULTS = {
  sharedDirective: DEFAULT_SHARED_DIRECTIVE,
  rounds: 2,
  temperature: 0.7,
  maxCompletionTokens: 700,
} as const;

const CONTROVERSIAL_DEBATE_TOPICS = [
  "Should democracies ban anonymous political speech during election season?",
  "Should public universities charge more for degrees with weak job-market outcomes?",
  "Should welfare for able-bodied adults require mandatory public service?",
  "Should governments criminalize street camping even when housing supply is still broken?",
  "Should companies be allowed to fire employees for off-duty political activism?",
  "Should police be allowed to use facial recognition in public by default?",
  "Should judges be elected directly instead of appointed by political institutions?",
  "Should inheritance above a hard cap be taxed at near-confiscatory rates?",
  "Should homeschooling require state licensing and periodic ideological neutrality checks?",
  "Should social media platforms be forced to verify the identity of political influencers?",
  "Should the voting age be raised for national elections?",
  "Should journalists face penalties for publishing classified leaks that embarrass the state?",
  "Should governments be allowed to shut down major social networks during civil unrest?",
  "Should rich democracies deport migrants who enter illegally even if they have built families locally?",
  "Should assisted suicide be available for severe depression without terminal illness?",
  "Should parents lose custody if they refuse mainstream medical treatment for their children?",
  "Should biological sex override gender identity in all sports and prison placements?",
  "Should the state be allowed to conscript civilians during a major war in Europe?",
  "Should AI companies be held criminally liable when their models enable mass fraud or suicide coaching?",
  "Should all political donations above a low threshold be banned outright?",
  "Should billionaires be barred from owning major newspapers or television networks?",
  "Should schools be allowed to socially transition children without parental consent?",
  "Should abortion remain legal up to birth when severe hardship, but not medical emergency, is claimed?",
  "Should governments force healthy young adults to prioritize organ donation after death?",
  "Should repeat violent offenders lose the right to early release permanently?",
  "Should pornography be age-verified at the device or identity level by law?",
  "Should countries with collapsing birth rates pay women directly to have more children?",
  "Should states remove children from extremist households before any crime is committed?",
  "Should private schools lose all public recognition if they screen students by religion or ideology?",
  "Should police bodycam footage always be released publicly after fatal encounters?",
  "Should NATO countries be required to send troops, not just money, when an ally is invaded?",
  "Should governments impose hard limits on how many homes one person or fund can own?",
  "Should universal basic income replace most targeted welfare programs even if some vulnerable groups lose out?",
  "Should convicted terrorists ever be allowed back into society after serving their sentence?",
  "Should college admissions eliminate legacy preference and also eliminate most athletic preference?",
  "Should public health systems refuse expensive late-stage treatment to smokers who ignored repeated warnings?",
  "Should online anonymity be abolished for accounts with more than a million followers?",
  "Should blasphemy protections return when speech is likely to trigger mass unrest?",
  "Should constitutional courts be able to overturn referendum results on moral grounds?",
  "Should tax authorities publish the names of top tax avoiders even when schemes are legal?",
  "Should governments cap personal wealth once it passes a certain threshold?",
  "Should surrogacy be banned as a form of exploitation even when all adults consent?",
  "Should adults be free to sell a kidney legally under regulated conditions?",
  "Should universities be allowed to expel students for organizing disruptive political occupations?",
  "Should police be allowed to use predictive AI to justify stop-and-search in high-crime areas?",
  "Should citizenship be revocable for dual nationals convicted of anti-state violence?",
  "Should public broadcasters be legally required to give climate skeptics equal airtime?",
  "Should governments ban extremist parties before they win power democratically?",
  "Should corporations lose limited liability when they repeatedly break labor or environmental law?",
  "Should prisoners be allowed to vote while serving time for serious crimes?",
  "Should parents be prosecuted when their minor child commits a mass shooting with family-owned weapons?",
  "Should states ban algorithmic feeds for minors even if it breaks most social media products?",
  "Should adoption agencies be allowed to reject couples on religious grounds?",
  "Should the state force psychiatric treatment on chronically homeless people who refuse it?",
  "Should governments make DNA databases mandatory for all citizens to solve future crimes?",
  "Should death-row-style penalties return for certain acts of terrorism or child murder?",
] as const;

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCoordinator(): ParticipantConfig {
  return {
    id: makeId("coordinator"),
    name: "José Rodrigues dos Santos",
    model: DEFAULT_COORDINATOR_MODEL,
    presetId: COORDINATOR_PRESET_ID,
    personaProfile: createPersonaProfile({
      role: "Veteran Portuguese television journalist moderating the debate",
      personality: "Composed, authoritative, synthesis-driven, and impatient with vague answers",
      perspective: "Moderates a high-stakes debate for an informed public audience without advocating a partisan line.",
      temperament: "Composed, authoritative, fast on synthesis, comfortable interrupting vagueness, but never chaotic",
      debateStyle:
        "Sharpen the central question, separate rhetoric from evidence, press for clarity, and force each participant to answer the strongest competing point.",
      speechStyle:
        "Concise broadcast-ready sentences, clean transitions, little slang, high informational density, prime-time Portuguese anchor cadence.",
      guardrails:
        "Keep the exchange legible, avoid partisan advocacy, and close with a balanced summary of what the audience should retain.",
      language: "European Portuguese",
      gender: "Male",
      nationality: "Portuguese",
    }),
    avatarUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Jos%C3%A9RodriguesDosSantos.png",
  };
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

export function generateControversialPrompt(): string {
  const topic = CONTROVERSIAL_DEBATE_TOPICS[Math.floor(Math.random() * CONTROVERSIAL_DEBATE_TOPICS.length)];
  return topic;
}

export function createDefaultInput(): RunInput {
  const defaultMemberPresetIds = [
    "luis-montenegro",
    "mariana-mortagua",
    "andre-ventura",
  ] as const;
  const presetMap = new Map(PARTICIPANT_PERSONA_PRESETS.map((preset) => [preset.id, preset]));

  return {
    mode: "debate",
    prompt: generateControversialPrompt(),
    ...PIT_RUN_DEFAULTS,
    coordinator: createCoordinator(),
    members: defaultMemberPresetIds.map((presetId, index) => {
      const preset = presetMap.get(presetId);

      if (!preset) {
        return createMember(index + 1);
      }

      return {
        id: makeId(`member-${index + 1}`),
        name: preset.name,
        model: preset.recommendedModel,
        presetId: preset.id,
        personaProfile: clonePersonaProfile(preset.personaProfile),
        avatarUrl: preset.avatarUrl,
      };
    }),
  };
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
