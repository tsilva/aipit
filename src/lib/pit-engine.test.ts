import { describe, expect, it } from "vitest";
import { createDefaultInput, createTurn } from "@/lib/pit";
import {
  buildPromptMessages,
  buildSystemPrompt,
  shouldFallbackToAnotherModel,
  shouldRetryOpenRouterRequest,
} from "@/lib/pit-engine";

describe("pit-engine helpers", () => {
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
});
