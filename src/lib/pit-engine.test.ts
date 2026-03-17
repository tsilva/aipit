import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultInput, createTurn } from "@/lib/pit";
import {
  buildModeratorInterventionPacket,
  buildPromptMessages,
  buildSystemPrompt,
  runPitWorkflow,
  shouldFallbackToAnotherModel,
  shouldRetryOpenRouterRequest,
} from "@/lib/pit-engine";

describe("pit-engine helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("builds a system prompt with transcript context and balloon instructions", () => {
    const input = createDefaultInput();
    const participant = input.members[0]!;
    const transcriptTurn = createTurn({
      kind: "member_turn",
      round: 1,
      participant,
      model: participant.model,
      content: "First point",
    });

    const prompt = buildSystemPrompt(input, participant, "member", {
      objective: "Respond to the strongest objection.",
      transcript: [transcriptTurn],
      speakingOrder: input.members,
    });

    expect(prompt).toContain("<<<BALLOON>>>");
    expect(prompt).toContain("Respond to the strongest objection.");
    expect(prompt).toContain("R1");
    expect(prompt).toContain(`${participant.name}: First point`);
    expect(prompt).not.toContain("###");
  });

  it("keeps the cached prompt prefix stable across turns", () => {
    const input = createDefaultInput();
    const participant = input.members[0]!;
    const firstFrame = {
      objective: "Make your first point.",
      transcript: [],
    };
    const secondTurn = createTurn({
      kind: "opening",
      participant: input.coordinator,
      model: input.coordinator.model,
      content: "Opening frame",
    });
    const secondFrame = {
      objective: "Answer the moderator opening.",
      transcript: [secondTurn],
    };

    const firstMessages = buildPromptMessages(input, participant, "member", firstFrame, [
      { role: "user", content: "Produce your next turn now." },
    ]);
    const secondMessages = buildPromptMessages(input, participant, "member", secondFrame, [
      { role: "user", content: "Produce your next turn now." },
    ]);

    expect(firstMessages[0]).toEqual(secondMessages[0]);
    expect(firstMessages[1]).toEqual(secondMessages[1]);
    expect(firstMessages[2]?.content).not.toEqual(secondMessages[2]?.content);
    expect(firstMessages[1]?.content).not.toContain(input.prompt);
    expect(firstMessages[1]?.content).not.toContain(input.sharedDirective);
  });

  it("retries transient provider failures and falls back on model availability errors", () => {
    expect(shouldRetryOpenRouterRequest(429, "rate limit")).toBe(true);
    expect(shouldFallbackToAnotherModel(503, "provider routing failed")).toBe(true);
    expect(shouldFallbackToAnotherModel(400, "plain validation error")).toBe(false);
  });

  it("pins the next-round speaking order in moderator interventions", () => {
    const input = createDefaultInput();
    const transcriptTurn = createTurn({
      kind: "member_turn",
      round: 1,
      participant: input.members[1]!,
      model: input.members[1]!.model,
      content: "I disagree with your efficiency argument.",
    });

    const packet = buildModeratorInterventionPacket({
      round: 1,
      totalRounds: 2,
      transcript: [transcriptTurn],
      speakingOrder: input.members,
    });

    expect(packet.frame.speakingOrder).toEqual(input.members);
    expect(packet.frame.objective).toContain(`it must be ${input.members[0]!.name}`);
    expect(packet.userMessage).toContain(`Next round first speaker: ${input.members[0]!.name}.`);
  });

  it("emits streaming turn updates before the final turn event", async () => {
    const input = createDefaultInput();
    input.rounds = 1;
    input.members = input.members.slice(0, 2);

    const streamedContents = [
      "Opening line one.\n<<<BALLOON>>>\nOpening line two.",
      "Debater one answers directly.",
      "Debater two pushes back.",
      "Balanced closing summary.",
    ];

    streamedContents.forEach((content, index) => {
      const chunks = [
        `data: ${JSON.stringify({
          model: input.coordinator.model,
          choices: [{ delta: { content: content.slice(0, Math.ceil(content.length / 2)) } }],
        })}\n\n`,
        `data: ${JSON.stringify({
          model: input.coordinator.model,
          choices: [{ delta: { content: content.slice(Math.ceil(content.length / 2)) }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 10 + index,
            completion_tokens: 20 + index,
            total_tokens: 30 + index,
            cost: 0.01,
          },
        })}\n\n`,
        "data: [DONE]\n\n",
      ];

      fetchMock.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)));
              controller.close();
            },
          }),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      );
    });

    const progressEvents: Array<{ type: string; turnId?: string; content?: string }> = [];

    const result = await runPitWorkflow(input, {
      apiKey: "test-key",
      siteUrl: "https://aipit.example",
      onProgress: (event) => {
        if (event.type === "stream") {
          progressEvents.push({
            type: "stream",
            turnId: event.turn.id,
            content: event.turn.content,
          });
          return;
        }

        if ("turn" in event) {
          progressEvents.push({
            type: event.type,
            turnId: event.turn.id,
            content: event.turn.content,
          });
        }
      },
    });

    expect(result.opening?.content).toBe(streamedContents[0]);
    expect(result.rounds?.[0]?.turns.map((turn) => turn.content)).toEqual(streamedContents.slice(1, 3));
    expect(result.consensus?.content).toBe(streamedContents[3]);

    const openingStreamEvents = progressEvents.filter((event) => event.type === "stream" && event.content?.includes("Opening"));
    expect(openingStreamEvents.length).toBeGreaterThan(0);
    expect(openingStreamEvents[0]?.content).not.toBe(streamedContents[0]);

    const finalOpeningEvent = progressEvents.find((event) => event.type === "opening");
    expect(finalOpeningEvent?.turnId).toBe(openingStreamEvents[0]?.turnId);
    expect(finalOpeningEvent?.content).toBe(streamedContents[0]);
  });
});
