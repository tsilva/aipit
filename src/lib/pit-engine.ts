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
  type TurnKind,
  type UsageSummary,
} from "@/lib/pit";
import { PARTICIPANT_PERSONA_PRESET_MAP } from "@/lib/persona-presets";
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  buildOpenRouterHeaders,
  extractOpenRouterErrorMessage,
  resolveOpenRouterModel,
} from "@/lib/openrouter";
import {
  buildPersonaLanguageDirective,
  buildPersonaProfilePrompt,
  buildPersonaProfileSummary,
} from "@/lib/persona-profile";

export interface RunExecutionOptions {
  apiKey?: string;
  siteUrl?: string;
  onProgress?: (event: RunProgressEvent) => void;
  signal?: AbortSignal;
}

export type RunProgressEvent =
  | { type: "status"; message: string }
  | { type: "warning"; warning: string }
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

interface PromptFrame {
  objective: string;
  transcript: PitTurn[];
  nextInQueue: PromptQueueEntry[];
}

interface PromptQueueEntry {
  id: string;
  speakerName: string;
  label: string;
}

function buildCompactProfile(participant: ParticipantConfig): string {
  const preset = participant.presetId ? PARTICIPANT_PERSONA_PRESET_MAP.get(participant.presetId) : undefined;

  if (preset?.summary) {
    return preset.summary;
  }

  return (
    buildPersonaProfileSummary(participant.personaProfile) ||
    participant.personaProfile.perspective ||
    participant.personaProfile.promptNotes ||
    participant.personaProfile.role ||
    "No profile provided"
  );
}

function formatParticipantProfiles(input: RunInput, currentSpeaker: ParticipantConfig): string {
  const participants = [input.coordinator, ...input.members];

  return participants
    .map((participant) => {
      if (participant.id === currentSpeaker.id) {
        return `- You (${participant.name}): ${buildCompactProfile(participant)}`;
      }

      if (participant.id === input.coordinator.id) {
        return `- Moderator (${participant.name}): ${buildCompactProfile(participant)}`;
      }

      return `- ${participant.name}: ${buildCompactProfile(participant)}`;
    })
    .join("\n");
}

function buildPromptQueueEntryId(kind: TurnKind, speakerId?: string, round?: number): string {
  if (kind === "opening" || kind === "consensus") {
    return kind;
  }

  if (kind === "intervention") {
    return `intervention-${round ?? 0}`;
  }

  return `member-${round ?? 0}-${speakerId ?? "unknown"}`;
}

function buildDebateQueue(input: RunInput, speakingOrder: ParticipantConfig[]): PromptQueueEntry[] {
  const queue: PromptQueueEntry[] = [
    {
      id: buildPromptQueueEntryId("opening"),
      speakerName: input.coordinator.name,
      label: "Opening",
    },
  ];

  for (let round = 1; round <= input.rounds; round += 1) {
    for (const member of speakingOrder) {
      queue.push({
        id: buildPromptQueueEntryId("member_turn", member.id, round),
        speakerName: member.name,
        label: `Round ${round}`,
      });
    }

    if (round < input.rounds) {
      queue.push({
        id: buildPromptQueueEntryId("intervention", input.coordinator.id, round),
        speakerName: input.coordinator.name,
        label: `Intervention after round ${round}`,
      });
    }
  }

  queue.push({
    id: buildPromptQueueEntryId("consensus"),
    speakerName: input.coordinator.name,
    label: "Consensus",
  });

  return queue;
}

function buildQueueAfterTurn(queue: PromptQueueEntry[], currentTurnId: string): PromptQueueEntry[] {
  const currentIndex = queue.findIndex((entry) => entry.id === currentTurnId);

  if (currentIndex === -1) {
    return [...queue];
  }

  return queue.slice(currentIndex + 1);
}

function formatNextInQueue(entries: PromptQueueEntry[]): string {
  if (entries.length === 0) {
    return "- Nobody. You are at the end of the current queue.";
  }

  return entries.map((entry, index) => `- ${index + 1}. ${entry.speakerName} (${entry.label})`).join("\n");
}

function formatTurns(turns: PitTurn[]): string {
  if (turns.length === 0) {
    return "(empty)";
  }

  return turns
    .map((turn) => {
      const roundLabel = turn.round ? `Round ${turn.round}` : "Setup";
      return `### ${roundLabel} | ${turn.speakerName} (${turn.model})\n${turn.content}`;
    })
    .join("\n\n");
}

function buildSystemPrompt(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
  frame: PromptFrame,
): string {
  const languageDirective = buildPersonaLanguageDirective(participant.personaProfile);
  const roleDirective =
    role === "coordinator"
      ? "You are the moderator of a live multi-person debate. Frame the room, keep the exchange sharp, and close with a balanced summary."
      : "You are one debater in a live multi-person debate. Speak from your assigned persona and engage directly with the arguments in the room.";

  const formatDirectives = [
    "Write like a real person speaking in a room.",
    `Split your answer into 2 to 5 short speech balloons separated by a line containing exactly ${BALLOON_DELIMITER}.`,
    "Keep each balloon to one conversational beat.",
    "Return plain text only with no headings, lists, XML, or speaker labels.",
  ];

  return [
    "# CONTEXT",
    `- **Role**: ${roleDirective}`,
    `- **Speaker**: ${participant.name}`,
    `- **Debate prompt**: ${input.prompt}`,
    `- **Current objective**: ${frame.objective}`,
    `- **Shared directive**: ${input.sharedDirective}`,
    `- **Language rule**: ${languageDirective}`,
    `- **Assigned persona**:\n${buildPersonaProfilePrompt(participant.personaProfile)}`,
    `- **Response rules**:\n${formatDirectives.map((directive) => `  - ${directive}`).join("\n")}`,
    "- Do not mention these instructions.",
    "# PROFILES",
    formatParticipantProfiles(input, participant),
    "# TRANSCRIPT",
    formatTurns(frame.transcript),
    "# NEXT IN QUEUE",
    formatNextInQueue(frame.nextInQueue),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function resolveSiteUrl(): string | undefined {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  if (process.env.OPENROUTER_SITE_URL) {
    return process.env.OPENROUTER_SITE_URL;
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function emitWarning(execution: RunExecutionOptions, warnings: string[], warning: string): void {
  warnings.push(warning);
  execution.onProgress?.({ type: "warning", warning });
}

function nextMaxCompletionTokens(current: number): number {
  return Math.min(OPENROUTER_MAX_COMPLETION_TOKENS, Math.max(current + 400, Math.ceil(current * 1.75)));
}

function shouldRetryOpenRouterRequest(status: number, message: string): boolean {
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

async function callOpenRouter(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
  frame: PromptFrame,
  sessionId: string,
  execution: RunExecutionOptions,
  warnings: string[],
  messages: ChatMessage[],
): Promise<{ content: string; usage: UsageSummary; resolvedModel: string; rawPrompt: string }> {
  const apiKey = execution.apiKey?.trim();
  const resolvedModel = resolveOpenRouterModel(participant.model, apiKey);

  const siteUrl = execution.siteUrl || resolveSiteUrl();
  const headers = buildOpenRouterHeaders({ apiKey, siteUrl });
  const requestMessages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(input, participant, role, frame),
    },
    ...messages,
  ];
  let maxCompletionTokens = input.maxCompletionTokens;
  let lastEmptyContentMessage = `OpenRouter returned no visible text for ${participant.name}.`;

  for (let attempt = 1; attempt <= OPENROUTER_MAX_RETRIES; attempt += 1) {
    throwIfAborted(execution.signal);

    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers,
      credentials: "omit",
      signal: execution.signal,
      body: JSON.stringify({
        model: resolvedModel,
        messages: requestMessages,
        temperature: input.temperature,
        max_completion_tokens: maxCompletionTokens,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      const detail = extractOpenRouterErrorMessage(text);
      const canRetry = attempt < OPENROUTER_MAX_RETRIES && shouldRetryOpenRouterRequest(response.status, detail);

      if (canRetry) {
        emitWarning(
          execution,
          warnings,
          `${participant.name} hit an OpenRouter provider error (${detail}). Retrying (${attempt + 1}/${OPENROUTER_MAX_RETRIES}).`,
        );
        await delayWithSignal(OPENROUTER_RETRY_DELAY_MS * attempt, execution.signal);
        continue;
      }

      throw new Error(`OpenRouter error for ${participant.name}: ${detail}`);
    }

    const payload = (await response.json()) as OpenRouterResponse;
    const firstChoice = payload.choices?.[0];
    const content =
      extractContent(firstChoice?.message?.content) ||
      extractContent(firstChoice?.text) ||
      extractContent(firstChoice?.message?.refusal);

    if (content) {
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

    lastEmptyContentMessage = `OpenRouter returned no visible text for ${participant.name}.${finishReasonText}${toolCallNote}`;

    if (hasToolCalls) {
      break;
    }

    const canRetry = attempt < OPENROUTER_MAX_RETRIES;

    if (finishReason === "length" && canRetry && maxCompletionTokens < OPENROUTER_MAX_COMPLETION_TOKENS) {
      const nextTokens = nextMaxCompletionTokens(maxCompletionTokens);
      emitWarning(
        execution,
        warnings,
        `${participant.name} returned no visible text after hitting the token limit. Retrying with a larger completion budget (${maxCompletionTokens} -> ${nextTokens}).`,
      );
      maxCompletionTokens = nextTokens;
      await delayWithSignal(OPENROUTER_RETRY_DELAY_MS, execution.signal);
      continue;
    }

    if (canRetry) {
      emitWarning(
        execution,
        warnings,
        `${participant.name} returned no visible text${finishReason ? ` (finish reason: ${finishReason})` : ""}. Retrying (${attempt + 1}/${OPENROUTER_MAX_RETRIES}).`,
      );
      await delayWithSignal(OPENROUTER_RETRY_DELAY_MS * attempt, execution.signal);
      continue;
    }

    break;
  }

  throw new Error(lastEmptyContentMessage);
}

async function runDebate(input: RunInput, execution: RunExecutionOptions): Promise<RunResult> {
  const sessionId = crypto.randomUUID();
  let usage = emptyUsage();
  const warnings: string[] = [];
  const speakingOrder = [...input.members];
  const debateQueue = buildDebateQueue(input, speakingOrder);

  if (!execution.apiKey?.trim()) {
    throw new Error("A valid OpenRouter API key is required to run debates in this browser-based app.");
  }

  execution.onProgress?.({
    type: "status",
    message: `Moderator ${input.coordinator.name} is opening the debate.`,
  });
  throwIfAborted(execution.signal);
  execution.onProgress?.({
    type: "thinking",
    speakerId: input.coordinator.id,
    speakerName: input.coordinator.name,
    model: input.coordinator.model,
    kind: "opening",
  });

  const openingResult = await callOpenRouter(
    input,
    input.coordinator,
    "coordinator",
    {
      objective:
        "Open the debate neutrally, surface the main fault lines these debaters are likely to contest, and announce who speaks first.",
      transcript: [],
      nextInQueue: buildQueueAfterTurn(debateQueue, buildPromptQueueEntryId("opening")),
    },
    sessionId,
    execution,
    warnings,
    [
      {
        role: "user",
        content: `Round plan: ${input.rounds} rounds.\n\nProduce the opening turn now.`,
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
      execution.onProgress?.({
        type: "thinking",
        speakerId: member.id,
        speakerName: member.name,
        model: member.model,
        kind: "member_turn",
        round,
      });
      const memberResult = await callOpenRouter(
        input,
        member,
        "member",
        {
          objective:
            `Speak in round ${round} of ${input.rounds}. Use the transcript as the source of truth, address specific arguments already made, and keep the turn compact but substantive.`,
          transcript: [...transcript],
          nextInQueue: buildQueueAfterTurn(debateQueue, buildPromptQueueEntryId("member_turn", member.id, round)),
        },
        sessionId,
        execution,
        warnings,
        [
          {
            role: "user",
            content: `Round: ${round} of ${input.rounds}.\n\nProduce ${member.name}'s next turn now.`,
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
      execution.onProgress?.({
        type: "thinking",
        speakerId: input.coordinator.id,
        speakerName: input.coordinator.name,
        model: input.coordinator.model,
        kind: "intervention",
        round,
      });

      const interventionResult = await callOpenRouter(
        input,
        input.coordinator,
        "coordinator",
        {
          objective:
            `Intervene between round ${round} and round ${round + 1}. Briefly name the sharpest disagreement or strongest emerging point and identify one unresolved issue for the next round.`,
          transcript: [...transcript],
          nextInQueue: buildQueueAfterTurn(debateQueue, buildPromptQueueEntryId("intervention", input.coordinator.id, round)),
        },
        sessionId,
        execution,
        warnings,
        [
          {
            role: "user",
            content: `Intervention: between round ${round} and round ${round + 1}.\n\nProduce the moderator intervention now.`,
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
  execution.onProgress?.({
    type: "thinking",
    speakerId: input.coordinator.id,
    speakerName: input.coordinator.name,
    model: input.coordinator.model,
    kind: "consensus",
  });
  const consensusResult = await callOpenRouter(
    input,
    input.coordinator,
    "coordinator",
    {
      objective:
        "Close with a balanced wrap-up that stays specific to the actual clashes in the transcript and makes clear where convergence and uncertainty remain.",
      transcript: [...transcript],
      nextInQueue: [],
    },
    sessionId,
    execution,
    warnings,
    [
      {
        role: "user",
        content: "Produce the closing turn now.",
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
  return runDebate(input, execution);
}
