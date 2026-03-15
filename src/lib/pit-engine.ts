import {
  BALLOON_DELIMITER,
  addUsage,
  createRosterSnapshot,
  createTurn,
  createDefaultInput,
  emptyUsage,
  type PitTurn,
  type ParticipantConfig,
  type RunInput,
  type RunResult,
  type UsageSummary,
} from "@/lib/pit";
import type { RuntimeTurnIdentity } from "@/lib/runtime-warning";
import { PARTICIPANT_CHARACTER_PRESET_MAP, PARTICIPANT_CHARACTER_RELATIONSHIPS } from "@/lib/character-presets";
import {
  OPENROUTER_PROXY_CHAT_COMPLETIONS_PATH,
  buildOpenRouterPromptCacheControl,
  extractOpenRouterErrorMessage,
  postOpenRouterProxyRequest,
  resolveOpenRouterModel,
} from "@/lib/openrouter";
import { buildOpenRouterModelFallbackOrder } from "@/lib/openrouter-models";
import {
  buildCompactCharacterPrompt,
  buildCharacterLanguageDirective,
  buildCharacterProfileSummary,
} from "@/lib/character-profile";

export interface RunExecutionOptions {
  apiKey?: string;
  siteUrl?: string;
  onProgress?: (event: RunProgressEvent) => void;
  signal?: AbortSignal;
}

export type RunProgressEvent =
  | { type: "status"; message: string }
  | ({ type: "warning"; warning: string } & RuntimeTurnIdentity)
  | {
      type: "thinking";
      speakerId: string;
      speakerName: string;
      model: string;
      kind: PitTurn["kind"];
      round?: number;
    }
  | { type: "opening"; turn: PitTurn; usage: UsageSummary }
  | { type: "member_turn"; turn: PitTurn; usage: UsageSummary }
  | { type: "intervention"; turn: PitTurn; usage: UsageSummary }
  | { type: "synthesis"; turn: PitTurn; usage: UsageSummary }
  | { type: "consensus"; turn: PitTurn; usage: UsageSummary };

type ThinkingProgressEvent = Extract<RunProgressEvent, { type: "thinking" }>;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    text?: string | null;
    finish_reason?: string | null;
    message?: {
      content?: OpenRouterContent | null;
      refusal?: string | null;
      tool_calls?: unknown[];
    };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
};

type OpenRouterContentPart =
  | string
  | { type?: string; text?: string; content?: string; value?: string; refusal?: string };

type OpenRouterContent = string | OpenRouterContentPart[] | undefined;

const OPENROUTER_MAX_RETRIES = 3;
const OPENROUTER_MAX_COMPLETION_TOKENS = 4000;
const OPENROUTER_RETRY_DELAY_MS = 350;
const PARTICIPANT_RESPONSE_TIMEOUT_MS = 30_000;
const PARTICIPANT_RESPONSE_TIMEOUT_FALLBACK = "Err... I don't know what to say...";

interface PromptFrame {
  objective: string;
  transcript: PitTurn[];
  speakingOrder?: ParticipantConfig[];
}

interface ModeratorInterventionPacket {
  frame: PromptFrame;
  userMessage: string;
}

function buildCompactProfile(participant: ParticipantConfig): string {
  const preset = participant.presetId ? PARTICIPANT_CHARACTER_PRESET_MAP.get(participant.presetId) : undefined;

  if (preset?.summary) {
    return preset.summary;
  }

  return (
    buildCharacterProfileSummary(participant.characterProfile) ||
    participant.characterProfile.perspective ||
    participant.characterProfile.promptNotes ||
    participant.characterProfile.role ||
    "No profile provided"
  );
}

function formatParticipantProfiles(input: RunInput, currentSpeaker: ParticipantConfig): string {
  const participants = [input.coordinator, ...input.members];

  return participants
    .map((participant) => {
      if (participant.id === currentSpeaker.id) {
        return `- ${participant.name} (you): ${buildCompactProfile(participant)}`;
      }

      if (participant.id === input.coordinator.id) {
        return `- ${participant.name} (moderator): ${buildCompactProfile(participant)}`;
      }

      return `- ${participant.name}: ${buildCompactProfile(participant)}`;
    })
    .join("\n");
}

function formatTurns(turns: PitTurn[]): string {
  if (turns.length === 0) {
    return "(empty)";
  }

  return turns
    .map((turn) => {
      const roundLabel = turn.round ? `R${turn.round}` : "S";
      return `${roundLabel} ${turn.speakerName}: ${turn.content}`;
    })
    .join("\n");
}

function buildRelationshipHints(participant: ParticipantConfig, input: RunInput): string {
  if (!participant.presetId) {
    return "";
  }

  const relationships = PARTICIPANT_CHARACTER_RELATIONSHIPS[participant.presetId];

  if (!relationships) {
    return "";
  }

  const allParticipants = [input.coordinator, ...input.members];
  const hints = allParticipants
    .filter((p) => p.id !== participant.id && p.presetId && relationships[p.presetId])
    .map((p) => `- ${p.name}: ${relationships[p.presetId!]}`);

  if (hints.length === 0) {
    return "";
  }

  return hints.join("\n");
}

function buildResponseRules(): string[] {
  return [
    "Speak like a real person in a room.",
    `Split into 2-5 short speech balloons separated by ${BALLOON_DELIMITER} on its own line.`,
    "One conversational beat per balloon. Plain text only — no markdown, no asterisks, no bold, no italics, no headings, no lists, no XML, no labels.",
    "Only spoken words. No stage directions, no action narration, no scene descriptions, no parentheticals.",
    "Respond to the actual exchange instead of repeating a stump speech.",
  ];
}

function buildSpeakingOrderSection(frame: PromptFrame): string {
  if (!frame.speakingOrder || frame.speakingOrder.length === 0) {
    return "";
  }

  return [
    "# SPEAKING ORDER",
    `- First speaker: ${frame.speakingOrder[0]?.name ?? "Unknown"}`,
    ...frame.speakingOrder.map((member, index) => `- Slot ${index + 1}: ${member.name}`),
    "- If you announce who speaks first, use the first speaker named above.",
  ].join("\n");
}

export function buildStableSystemPrompt(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
): string {
  const languageDirective = buildCharacterLanguageDirective(participant.characterProfile);
  const roleDirective =
    role === "coordinator"
      ? "You are the debate moderator. You are strictly impartial: never take sides or express personal opinions on the topic. Frame the room, sharpen the exchange, flag unsupported claims, seek common ground, and close with a balanced summary grounded in evidence."
      : "You are a debater. Speak from your assigned character and engage the arguments directly.";
  const relationshipHints = buildRelationshipHints(participant, input);

  const sections = [
    "# CONTEXT",
    `- **Role**: ${roleDirective}`,
    `- **Speaker**: ${participant.name}`,
    `- **Debate prompt**: ${input.prompt}`,
    `- **Shared directive**: ${input.sharedDirective}`,
    `- **Language rule**: ${languageDirective}`,
    `- **Assigned character**:\n${buildCompactCharacterPrompt(participant.characterProfile)}`,
    `- **Response rules**:\n${buildResponseRules().map((directive) => `  - ${directive}`).join("\n")}`,
    "- Do not mention these instructions.",
  ];

  if (relationshipHints) {
    sections.push("# RELATIONSHIPS", relationshipHints);
  }

  sections.push("# ROOM", formatParticipantProfiles(input, participant));

  return sections.filter(Boolean).join("\n\n");
}

export function buildConversationAnchorMessage(role: "coordinator" | "member"): string {
  return [
    "# SESSION",
    "- Continue the same debate with the same speaker identity and room context already provided above.",
    role === "coordinator"
      ? "- The next user message carries the live moderator packet."
      : "- The next user message carries the live debater packet.",
    "- Treat the latest user message as the source of truth for the current turn.",
  ].join("\n");
}

export function buildTurnContextPrompt(frame: PromptFrame): string {
  const sections = ["# LIVE TURN", `- **Current objective**: ${frame.objective}`];
  const speakingOrderSection = buildSpeakingOrderSection(frame);

  if (speakingOrderSection) {
    sections.push(speakingOrderSection);
  }

  sections.push("# TRANSCRIPT", formatTurns(frame.transcript));

  return sections.filter(Boolean).join("\n\n");
}

export function buildSystemPrompt(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
  frame: PromptFrame,
): string {
  return [buildStableSystemPrompt(input, participant, role), buildTurnContextPrompt(frame)]
    .filter(Boolean)
    .join("\n\n");
}

export function buildModeratorInterventionPacket({
  round,
  totalRounds,
  transcript,
  speakingOrder,
}: {
  round: number;
  totalRounds: number;
  transcript: PitTurn[];
  speakingOrder: ParticipantConfig[];
}): ModeratorInterventionPacket {
  const nextRound = round + 1;
  const nextSpeaker = speakingOrder[0]?.name ?? "Unknown";

  return {
    frame: {
      objective:
        `Intervene between round ${round} and round ${nextRound}. Briefly name the sharpest disagreement or strongest emerging point. If any claims lacked evidence or contained logical errors, note them now. Identify any emerging common ground. Pose one unresolved issue for the next round. If you announce who speaks first in round ${nextRound}, it must be ${nextSpeaker}.`,
      transcript,
      speakingOrder,
    },
    userMessage:
      `Intervention: between round ${round} and round ${nextRound} of ${totalRounds}.\n` +
      `Next round first speaker: ${nextSpeaker}.\n\nProduce the moderator intervention now.`,
  };
}

export function buildPromptMessages(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
  frame: PromptFrame,
  messages: ChatMessage[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: buildStableSystemPrompt(input, participant, role),
    },
    {
      role: "user",
      content: buildConversationAnchorMessage(role),
    },
    {
      role: "user",
      content: buildTurnContextPrompt(frame),
    },
    ...messages,
  ];
}

export function resolveSiteUrl(): string | undefined {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return undefined;
}

function extractContentPart(part: OpenRouterContentPart): string {
  if (typeof part === "string") {
    return part;
  }

  return part.text ?? part.content ?? part.value ?? part.refusal ?? "";
}

function extractContent(content: OpenRouterContent | null): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => extractContentPart(part))
      .join("")
      .trim();
  }

  return "";
}

function formatRawPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => [`[${message.role}]`, message.content.trim()].filter(Boolean).join("\n"))
    .join("\n\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return delay(ms);
  }

  const abortSignal = signal;

  if (abortSignal.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      abortSignal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      globalThis.clearTimeout(timeoutId);
      abortSignal.removeEventListener("abort", handleAbort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }

    abortSignal.addEventListener("abort", handleAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function createTurnAbortController(signal?: AbortSignal, timeoutMs = PARTICIPANT_RESPONSE_TIMEOUT_MS) {
  const controller = new AbortController();
  let didTimeout = false;
  let didParentAbort = false;

  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort(new DOMException("The operation timed out.", "AbortError"));
  }, timeoutMs);

  const abortFromParent = () => {
    didParentAbort = true;
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) {
    abortFromParent();
  } else {
    signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    didParentAbort: () => didParentAbort,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function emitWarning(
  execution: RunExecutionOptions,
  warnings: string[],
  warning: string,
  source: RuntimeTurnIdentity,
): void {
  warnings.push(warning);
  execution.onProgress?.({ type: "warning", warning, ...source });
}

function nextMaxCompletionTokens(current: number): number {
  return Math.min(OPENROUTER_MAX_COMPLETION_TOKENS, Math.max(current + 400, Math.ceil(current * 1.75)));
}

export function shouldRetryOpenRouterRequest(status: number, message: string): boolean {
  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    return true;
  }

  const normalized = message.trim().toLowerCase();

  return (
    normalized.includes("provider returned error") ||
    normalized.includes("temporar") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("rate limit") ||
    normalized.includes("overloaded") ||
    normalized.includes("try again")
  );
}

export function shouldFallbackToAnotherModel(status: number, message: string): boolean {
  if (shouldRetryOpenRouterRequest(status, message)) {
    return true;
  }

  const normalized = message.trim().toLowerCase();

  return (
    normalized.includes("no endpoints found") ||
    normalized.includes("provider routing") ||
    normalized.includes("model is not available") ||
    normalized.includes("model unavailable") ||
    normalized.includes("no provider")
  );
}

async function callOpenRouter(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
  frame: PromptFrame,
  thinkingEvent: ThinkingProgressEvent,
  sessionId: string,
  execution: RunExecutionOptions,
  warnings: string[],
  messages: ChatMessage[],
): Promise<{ content: string; usage: UsageSummary; resolvedModel: string; rawPrompt: string }> {
  const apiKey = execution.apiKey?.trim();
  const siteUrl = execution.siteUrl || resolveSiteUrl();
  const requestMessages = buildPromptMessages(input, participant, role, frame, messages);
  const requestedModels = buildOpenRouterModelFallbackOrder(participant.model);
  let lastFailureMessage = `OpenRouter returned no visible text for ${participant.name}.`;
  const turnAbort = createTurnAbortController(execution.signal);

  try {
    for (let modelIndex = 0; modelIndex < requestedModels.length; modelIndex += 1) {
      const requestedModel = requestedModels[modelIndex]!;
      const nextRequestedModel = requestedModels[modelIndex + 1];
      const resolvedModel = resolveOpenRouterModel(requestedModel, apiKey);
      const cacheControl = buildOpenRouterPromptCacheControl(resolvedModel);
      let maxCompletionTokens = input.maxCompletionTokens;
      let modelFailureReason: string | null = null;

      for (let attempt = 1; attempt <= OPENROUTER_MAX_RETRIES; attempt += 1) {
        throwIfAborted(turnAbort.signal);

        try {
          const response = await postOpenRouterProxyRequest({
            path: OPENROUTER_PROXY_CHAT_COMPLETIONS_PATH,
            apiKey,
            siteUrl,
            signal: turnAbort.signal,
            body: {
              model: resolvedModel,
              messages: requestMessages,
              temperature: input.temperature,
              max_completion_tokens: maxCompletionTokens,
              session_id: sessionId,
              cache_control: cacheControl,
            },
          });

          if (!response.ok) {
            const text = await response.text();
            const detail = extractOpenRouterErrorMessage(text);
            const canRetry = attempt < OPENROUTER_MAX_RETRIES && shouldRetryOpenRouterRequest(response.status, detail);

            if (canRetry) {
              emitWarning(
                execution,
                warnings,
                `${participant.name} hit an OpenRouter provider error on ${requestedModel} (${detail}). Retrying (${attempt + 1}/${OPENROUTER_MAX_RETRIES}).`,
                thinkingEvent,
              );
              await delayWithSignal(OPENROUTER_RETRY_DELAY_MS * attempt, turnAbort.signal);
              continue;
            }

            if (nextRequestedModel && shouldFallbackToAnotherModel(response.status, detail)) {
              modelFailureReason = `provider error: ${detail}`;
              lastFailureMessage = `OpenRouter error for ${participant.name} on ${requestedModel}: ${detail}`;
              break;
            }

            throw new Error(`OpenRouter error for ${participant.name} on ${requestedModel}: ${detail}`);
          }

          const payload = (await response.json()) as OpenRouterResponse;
          const firstChoice = payload.choices?.[0];
          const content =
            extractContent(firstChoice?.message?.content) ||
            extractContent(firstChoice?.text) ||
            extractContent(firstChoice?.message?.refusal);

          if (content) {
            participant.model = requestedModel;

            return {
              content,
              rawPrompt: formatRawPrompt(requestMessages),
              resolvedModel: payload.model || resolvedModel,
              usage: {
                promptTokens: payload.usage?.prompt_tokens ?? 0,
                completionTokens: payload.usage?.completion_tokens ?? 0,
                totalTokens: payload.usage?.total_tokens ?? 0,
                cost: payload.usage?.cost ?? 0,
              },
            };
          }

          const finishReason = firstChoice?.finish_reason ?? undefined;
          const hasToolCalls = Boolean(firstChoice?.message?.tool_calls && firstChoice.message.tool_calls.length > 0);
          const finishReasonText = finishReason ? ` Finish reason: ${finishReason}.` : "";
          const toolCallNote = hasToolCalls ? " The model returned tool calls, which this app does not support yet." : "";

          lastFailureMessage = `OpenRouter returned no visible text for ${participant.name} on ${requestedModel}.${finishReasonText}${toolCallNote}`;

          if (hasToolCalls) {
            modelFailureReason = "it returned unsupported tool calls";
            break;
          }

          const canRetry = attempt < OPENROUTER_MAX_RETRIES;

          if (finishReason === "length" && canRetry && maxCompletionTokens < OPENROUTER_MAX_COMPLETION_TOKENS) {
            const nextTokens = nextMaxCompletionTokens(maxCompletionTokens);
            emitWarning(
              execution,
              warnings,
              `${participant.name} returned no visible text on ${requestedModel} after hitting the token limit. Retrying with a larger completion budget (${maxCompletionTokens} -> ${nextTokens}).`,
              thinkingEvent,
            );
            maxCompletionTokens = nextTokens;
            await delayWithSignal(OPENROUTER_RETRY_DELAY_MS, turnAbort.signal);
            continue;
          }

          if (canRetry) {
            emitWarning(
              execution,
              warnings,
              `${participant.name} returned no visible text on ${requestedModel}${finishReason ? ` (finish reason: ${finishReason})` : ""}. Retrying (${attempt + 1}/${OPENROUTER_MAX_RETRIES}).`,
              thinkingEvent,
            );
            await delayWithSignal(OPENROUTER_RETRY_DELAY_MS * attempt, turnAbort.signal);
            continue;
          }

          modelFailureReason = finishReason
            ? `it returned no visible text (finish reason: ${finishReason})`
            : "it returned no visible text";
          break;
        } catch (error) {
          if (isAbortError(error) && turnAbort.didTimeout() && !turnAbort.didParentAbort()) {
            if (nextRequestedModel) {
              modelFailureReason = "it timed out";
              lastFailureMessage = `${participant.name} timed out on ${requestedModel}.`;
              break;
            }

            emitWarning(
              execution,
              warnings,
              `${participant.name} took too long to respond. Using fallback text instead.`,
              thinkingEvent,
            );
            return {
              content: PARTICIPANT_RESPONSE_TIMEOUT_FALLBACK,
              rawPrompt: formatRawPrompt(requestMessages),
              resolvedModel,
              usage: emptyUsage(),
            };
          }

          throw error;
        }
      }

      if (modelFailureReason && nextRequestedModel) {
        participant.model = nextRequestedModel;
        emitWarning(
          execution,
          warnings,
          `${participant.name} could not use ${requestedModel} because ${modelFailureReason}. Falling back to ${nextRequestedModel}.`,
          thinkingEvent,
        );
        execution.onProgress?.({
          ...thinkingEvent,
          model: nextRequestedModel,
        });
        continue;
      }
    }
  } finally {
    turnAbort.cleanup();
  }

  throw new Error(lastFailureMessage);
}

async function runDebate(input: RunInput, execution: RunExecutionOptions): Promise<RunResult> {
  const sessionId = crypto.randomUUID();
  let usage = emptyUsage();
  const warnings: string[] = [];
  const speakingOrder = [...input.members];

  execution.onProgress?.({
    type: "status",
    message: `Moderator ${input.coordinator.name} is opening the debate.`,
  });
  throwIfAborted(execution.signal);
  const openingThinkingEvent: ThinkingProgressEvent = {
    type: "thinking",
    speakerId: input.coordinator.id,
    speakerName: input.coordinator.name,
    model: input.coordinator.model,
    kind: "opening",
  };
  execution.onProgress?.(openingThinkingEvent);

  const openingResult = await callOpenRouter(
    input,
    input.coordinator,
    "coordinator",
    {
      objective:
        "Open the debate neutrally and impartially. Briefly frame the factual landscape and established evidence around the topic. Surface the main fault lines these debaters are likely to contest. Announce who speaks first.",
      transcript: [],
      speakingOrder,
    },
    openingThinkingEvent,
    sessionId,
    execution,
    warnings,
    [
      {
        role: "user",
        content: `Round plan: ${input.rounds} rounds.\nFirst speaker: ${speakingOrder[0]?.name ?? "Unknown"}.\n\nProduce the opening turn now.`,
      },
    ],
  );

  usage = addUsage(usage, openingResult.usage);

  const opening: PitTurn = createTurn({
    kind: "opening",
    participant: input.coordinator,
    model: openingResult.resolvedModel,
    content: openingResult.content,
    rawPrompt: openingResult.rawPrompt,
  });
  execution.onProgress?.({ type: "opening", turn: opening, usage: openingResult.usage });

  const transcript: PitTurn[] = [opening];
  const rounds = [];

  for (let round = 1; round <= input.rounds; round += 1) {
    throwIfAborted(execution.signal);
    const turns: PitTurn[] = [];
    execution.onProgress?.({
      type: "status",
      message: `Round ${round} of ${input.rounds} is in progress.`,
    });

    for (const member of speakingOrder) {
      throwIfAborted(execution.signal);
      execution.onProgress?.({
        type: "status",
        message: `${member.name} is responding in round ${round}.`,
      });
      const memberThinkingEvent: ThinkingProgressEvent = {
        type: "thinking",
        speakerId: member.id,
        speakerName: member.name,
        model: member.model,
        kind: "member_turn",
        round,
      };
      execution.onProgress?.(memberThinkingEvent);
      const memberResult = await callOpenRouter(
        input,
        member,
        "member",
        {
          objective:
            `Speak in round ${round} of ${input.rounds}. Use the transcript as the source of truth, address specific arguments already made, and keep the turn compact but substantive.`,
          transcript: [...transcript],
        },
        memberThinkingEvent,
        sessionId,
        execution,
        warnings,
        [
          {
            role: "user",
            content: `Round ${round} of ${input.rounds}. You are ${member.name}. Produce your next turn now.`,
          },
        ],
      );

      usage = addUsage(usage, memberResult.usage);

      const turn: PitTurn = createTurn({
        kind: "member_turn",
        round,
        participant: member,
        model: memberResult.resolvedModel,
        content: memberResult.content,
        rawPrompt: memberResult.rawPrompt,
      });

      transcript.push(turn);
      turns.push(turn);
      execution.onProgress?.({ type: "member_turn", turn, usage: memberResult.usage });
    }

    const roundRecord = { round, turns } as { round: number; turns: PitTurn[]; intervention?: PitTurn };

    if (round < input.rounds) {
      throwIfAborted(execution.signal);
      execution.onProgress?.({
        type: "status",
        message: `Moderator ${input.coordinator.name} is intervening before round ${round + 1}.`,
      });
      const interventionThinkingEvent: ThinkingProgressEvent = {
        type: "thinking",
        speakerId: input.coordinator.id,
        speakerName: input.coordinator.name,
        model: input.coordinator.model,
        kind: "intervention",
        round,
      };
      execution.onProgress?.(interventionThinkingEvent);

      const interventionPacket = buildModeratorInterventionPacket({
        round,
        totalRounds: input.rounds,
        transcript: [...transcript],
        speakingOrder,
      });

      const interventionResult = await callOpenRouter(
        input,
        input.coordinator,
        "coordinator",
        interventionPacket.frame,
        interventionThinkingEvent,
        sessionId,
        execution,
        warnings,
        [
          {
            role: "user",
            content: interventionPacket.userMessage,
          },
        ],
      );

      usage = addUsage(usage, interventionResult.usage);

      const intervention: PitTurn = createTurn({
        kind: "intervention",
        round,
        participant: input.coordinator,
        model: interventionResult.resolvedModel,
        content: interventionResult.content,
        rawPrompt: interventionResult.rawPrompt,
      });

      transcript.push(intervention);
      roundRecord.intervention = intervention;
      execution.onProgress?.({ type: "intervention", turn: intervention, usage: interventionResult.usage });
    }

    rounds.push(roundRecord);
  }

  execution.onProgress?.({
    type: "status",
    message: `Moderator ${input.coordinator.name} is closing the debate with a consensus.`,
  });
  throwIfAborted(execution.signal);
  const consensusThinkingEvent: ThinkingProgressEvent = {
    type: "thinking",
    speakerId: input.coordinator.id,
    speakerName: input.coordinator.name,
    model: input.coordinator.model,
    kind: "consensus",
  };
  execution.onProgress?.(consensusThinkingEvent);
  const consensusResult = await callOpenRouter(
    input,
    input.coordinator,
    "coordinator",
    {
      objective:
        "Close with a balanced, impartial wrap-up that stays specific to the actual clashes in the transcript. Distinguish claims that were well-supported by evidence from those that were not. Make clear where convergence emerged and where genuine uncertainty or disagreement remains. Do not favor any participant's position.",
      transcript: [...transcript],
    },
    consensusThinkingEvent,
    sessionId,
    execution,
    warnings,
    [
      {
        role: "user",
        content: "Final round complete. Produce your closing consensus now.",
      },
    ],
  );

  usage = addUsage(usage, consensusResult.usage);

  const consensus: PitTurn = createTurn({
    kind: "consensus",
    participant: input.coordinator,
    model: consensusResult.resolvedModel,
    content: consensusResult.content,
    rawPrompt: consensusResult.rawPrompt,
  });
  execution.onProgress?.({ type: "consensus", turn: consensus, usage: consensusResult.usage });

  return {
    mode: "debate",
    prompt: input.prompt,
    roster: createRosterSnapshot(input),
    opening,
    rounds,
    consensus,
    usage,
    warnings,
  };
}

export async function runPitWorkflow(
  rawInput: unknown,
  execution: RunExecutionOptions,
): Promise<RunResult> {
  const input = rawInput ? (rawInput as RunInput) : createDefaultInput();
  const [coordinator, ...members] = createRosterSnapshot(input);

  return runDebate(
    {
      ...input,
      coordinator,
      members,
    },
    execution,
  );
}
