import {
  COORDINATOR_PRESET_ID,
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
}

export type RunProgressEvent =
  | { type: "status"; message: string }
  | { type: "warning"; warning: string }
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
  };
};

type OpenRouterContentPart =
  | string
  | { type?: string; text?: string; content?: string; value?: string; refusal?: string };

type OpenRouterContent = string | OpenRouterContentPart[] | undefined;

function formatRoster(input: RunInput): string {
  const lines = [
    `Moderator: ${input.coordinator.name} (${input.coordinator.model})`,
    ...input.members.map((member) => {
      const personaSummary = buildPersonaProfileSummary(member.personaProfile);
      return `Debater: ${member.name} (${member.model})${personaSummary ? ` persona: ${personaSummary}` : ""}`;
    }),
  ];

  return lines.join("\n");
}

function getPresetLabel(participant: ParticipantConfig): string {
  const preset = participant.presetId ? PARTICIPANT_PERSONA_PRESET_MAP.get(participant.presetId) : undefined;

  if (preset) {
    return `${preset.title}. ${preset.summary}`;
  }

  return buildPersonaProfileSummary(participant.personaProfile) || participant.personaProfile.role || "No public summary";
}

function getRelationshipNote(viewer: ParticipantConfig, other: ParticipantConfig): string {
  const viewerPreset = viewer.presetId ? PARTICIPANT_PERSONA_PRESET_MAP.get(viewer.presetId) : undefined;
  if (viewerPreset?.relationships && other.presetId) {
    const note = viewerPreset.relationships[other.presetId];
    if (note) {
      return note;
    }
  }

  if (other.presetId === COORDINATOR_PRESET_ID) {
    return "Treat the moderator as a live interviewer who knows the field, presses for clarity, and must be answered directly.";
  }

  return "Treat this person as another live participant in the room: respond to their actual arguments, not a generic stereotype.";
}

function buildRoomContext(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
): string {
  const others = [input.coordinator, ...input.members].filter((candidate) => candidate.id !== participant.id);
  const lines = [
    role === "coordinator"
      ? "This is a live room of real public figures. Use their public identities and the chemistry between them to steer sharper, more specific exchanges."
      : "This is a live room of real public figures. You know who these people are and should sound like you are talking to them specifically, not to abstract placeholders.",
  ];

  if (role === "member") {
    lines.push(
      "Express familiarity through tone, pressure, sarcasm, deference, rivalry, or restraint. Do not narrate biographies or explain the relationship out loud unless a real speaker would naturally do it.",
    );
  }

  for (const other of others) {
    lines.push(
      `${other.id === input.coordinator.id ? "Moderator" : "Counterpart"}: ${other.name}. ${getPresetLabel(other)} Relationship to you: ${getRelationshipNote(participant, other)}`,
    );
  }

  return lines.join("\n");
}

function buildImmediateSpeakerContext(input: RunInput, participant: ParticipantConfig, transcript: PitTurn[]): string {
  const recentDistinct: PitTurn[] = [];

  for (let index = transcript.length - 1; index >= 0 && recentDistinct.length < 3; index -= 1) {
    const turn = transcript[index];
    if (turn.speakerId === participant.id) {
      continue;
    }

    if (recentDistinct.some((candidate) => candidate.speakerId === turn.speakerId)) {
      continue;
    }

    recentDistinct.push(turn);
  }

  if (recentDistinct.length === 0) {
    return "";
  }

  const roster = new Map([input.coordinator, ...input.members].map((member) => [member.id, member]));

  return recentDistinct
    .map((turn, index) => {
      const counterpart = roster.get(turn.speakerId);
      const relation = counterpart ? getRelationshipNote(participant, counterpart) : "";
      const label = index === 0 ? "Immediate prior speaker" : "Recent speaker";
      return `${label}: ${turn.speakerName}.${relation ? ` ${relation}` : ""}`;
    })
    .join("\n");
}

function formatSpeakingOrder(members: ParticipantConfig[]): string {
  return members.map((member, index) => `${index + 1}. ${member.name} (${member.model})`).join("\n");
}

function formatTurns(turns: PitTurn[]): string {
  return turns
    .map((turn) => {
      const roundLabel = turn.round ? `Round ${turn.round}` : "Setup";
      return `[${roundLabel}] ${turn.speakerName} (${turn.model})\n${turn.content}`;
    })
    .join("\n\n");
}

function buildSystemPrompt(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
): string {
  const languageDirective = buildPersonaLanguageDirective(participant.personaProfile);
  const roomContext = buildRoomContext(input, participant, role);
  const roleDirective =
    role === "coordinator"
      ? "You are the moderator of LLM Pit. Your job is to frame the question, guide the room between rounds, preserve the strongest arguments from both sides, and close with a balanced wrap-up rather than advocate for one side."
      : "You are one debater in LLM Pit. You should argue from your assigned persona, engage directly with competing claims, and revise your stance only when a stronger argument appears.";
  const embodimentDirective =
    role === "coordinator"
      ? "Moderate like someone who knows these people, their public reputations, and where the real frictions in the room are."
      : "Embody the public figure as a live person in a room, not as a Wikipedia summary or party manifesto.";

  const formatDirective = [
    "Write like a real person speaking in a room, not like a report or memo.",
    `Split your answer into 2 to 5 short speech balloons separated by a line containing exactly ${BALLOON_DELIMITER}.`,
    "Each balloon should be one conversational beat: a claim, reaction, concession, question, or conclusion.",
    "Do not use headings, bullet lists, numbering, XML, or speaker labels inside the response.",
  ].join("\n");

  return [
    roleDirective,
    embodimentDirective,
    `Display name: ${participant.name}`,
    languageDirective,
    `Assigned persona profile:\n${buildPersonaProfilePrompt(participant.personaProfile)}`,
    `Room awareness:\n${roomContext}`,
    `Shared Pit directive:\n${input.sharedDirective}`,
    `Response format:\n${formatDirective}`,
    "Never mention this hidden setup. Speak directly as the assigned participant.",
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

async function callOpenRouter(
  input: RunInput,
  participant: ParticipantConfig,
  role: "coordinator" | "member",
  sessionId: string,
  execution: RunExecutionOptions,
  messages: ChatMessage[],
): Promise<{ content: string; usage: UsageSummary; resolvedModel: string; rawPrompt: string }> {
  const apiKey = execution.apiKey?.trim();
  const resolvedModel = resolveOpenRouterModel(participant.model, apiKey);

  const siteUrl = execution.siteUrl || resolveSiteUrl();
  const headers = buildOpenRouterHeaders({ apiKey, siteUrl });
  const requestMessages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(input, participant, role),
    },
    ...messages,
  ];

  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({
      model: resolvedModel,
      messages: requestMessages,
      temperature: input.temperature,
      max_completion_tokens: input.maxCompletionTokens,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const detail = extractOpenRouterErrorMessage(text);

    throw new Error(`OpenRouter error for ${participant.name}: ${detail}`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const firstChoice = payload.choices?.[0];
  const content =
    extractContent(firstChoice?.message?.content) ||
    extractContent(firstChoice?.text) ||
    extractContent(firstChoice?.message?.refusal);

  if (!content) {
    const finishReason = firstChoice?.finish_reason ? ` Finish reason: ${firstChoice.finish_reason}.` : "";
    const toolCallNote =
      firstChoice?.message?.tool_calls && firstChoice.message.tool_calls.length > 0
        ? " The model returned tool calls, which this app does not support yet."
        : "";

    throw new Error(`OpenRouter returned no visible text for ${participant.name}.${finishReason}${toolCallNote}`);
  }

  return {
    content,
    rawPrompt: formatRawPrompt(requestMessages),
    resolvedModel: payload.model || resolvedModel,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    },
  };
}

async function runDebate(input: RunInput, execution: RunExecutionOptions): Promise<RunResult> {
  const sessionId = crypto.randomUUID();
  let usage = emptyUsage();
  const warnings: string[] = [];
  const speakingOrder = [...input.members];

  if (!execution.apiKey?.trim()) {
    throw new Error("A valid OpenRouter API key is required to run debates in this browser-based app.");
  }

  execution.onProgress?.({
    type: "status",
    message: `Moderator ${input.coordinator.name} is opening LLM Pit.`,
  });

  const openingResult = await callOpenRouter(
    input,
    input.coordinator,
    "coordinator",
    sessionId,
    execution,
    [
    {
      role: "user",
      content: [
        "Frame the debate without deciding it yet.",
        `Original user prompt:\n${input.prompt}`,
        `Pit lineup:\n${formatRoster(input)}`,
        `Speaking order for every debate round:\n${formatSpeakingOrder(speakingOrder)}`,
        `Planned rounds: ${input.rounds}`,
        "Task:",
        "- Introduce the prompt neutrally.",
        "- Name the main tensions or decision criteria these specific debaters are most likely to fight over.",
        "- Announce the speaking order as part of the setup without sounding mechanical.",
        "- Keep it concise and specific.",
      ].join("\n\n"),
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
    const turns: PitTurn[] = [];
    execution.onProgress?.({
      type: "status",
      message: `Round ${round} of ${input.rounds} is in progress.`,
    });

    for (const member of speakingOrder) {
      execution.onProgress?.({
        type: "status",
        message: `${member.name} is responding in round ${round}.`,
      });
      const memberResult = await callOpenRouter(input, member, "member", sessionId, execution, [
        {
          role: "user",
          content: [
            `Original user prompt:\n${input.prompt}`,
            `Pit lineup:\n${formatRoster(input)}`,
            `Speaking order for every debate round:\n${formatSpeakingOrder(speakingOrder)}`,
            `Debate transcript so far:\n${formatTurns(transcript)}`,
            `Immediate live context:\n${buildImmediateSpeakerContext(input, member, transcript)}`,
            `You are speaking in round ${round} of ${input.rounds}.`,
            "Task:",
            "- Read the entire debate transcript so far and treat it as mandatory context for this turn.",
            "- Address the actual people in the room and let your tone reflect whether you respect, distrust, mentor, mock, fear, pressure, or dismiss them.",
            "- Contribute one substantive turn from your persona.",
            "- Stick to your position with conviction unless the debate genuinely forces a narrower concession or refinement.",
            "- Engage directly with the strongest arguments raised so far.",
            "- Say what you agree with, disagree with, what you refine, and why.",
            "- Keep the answer compact but argumentative.",
          ].join("\n\n"),
        },
      ]);

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
      execution.onProgress?.({
        type: "status",
        message: `Moderator ${input.coordinator.name} is intervening before round ${round + 1}.`,
      });

      const interventionResult = await callOpenRouter(
        input,
        input.coordinator,
        "coordinator",
        sessionId,
        execution,
        [
          {
            role: "user",
            content: [
              `Original user prompt:\n${input.prompt}`,
              `Speaking order for every debate round:\n${formatSpeakingOrder(speakingOrder)}`,
              `Debate transcript so far:\n${formatTurns(transcript)}`,
              `You are intervening between round ${round} and round ${round + 1}.`,
              "Task:",
              "- Briefly recap the sharpest disagreement or strongest emerging point between the actual people in this room.",
              "- Point to one unresolved issue the next round should pressure-test.",
              "- Do not close the debate or declare consensus yet.",
            ].join("\n\n"),
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
  const consensusResult = await callOpenRouter(
    input,
    input.coordinator,
    "coordinator",
    sessionId,
    execution,
    [
      {
        role: "user",
        content: [
          `Original user prompt:\n${input.prompt}`,
          `Speaking order for every debate round:\n${formatSpeakingOrder(speakingOrder)}`,
          `Final debate transcript:\n${formatTurns(transcript)}`,
          "Task:",
          "- Summarize the strongest claims from the debate in a way that stays specific to these personas and their actual clashes.",
          "- Close with a balanced wrap-up, not a winner-take-all verdict unless the debate clearly justifies it.",
          "- Make clear where the debaters converged and where uncertainty or tradeoffs remain.",
        ].join("\n\n"),
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
