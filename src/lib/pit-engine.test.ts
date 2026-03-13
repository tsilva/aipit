import { describe, expect, it } from "vitest";
import { createDefaultInput, createTurn } from "@/lib/pit";
import {
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
    expect(prompt).toContain("First point");
  });

  it("retries transient provider failures and falls back on model availability errors", () => {
    expect(shouldRetryOpenRouterRequest(429, "rate limit")).toBe(true);
    expect(shouldFallbackToAnotherModel(503, "provider routing failed")).toBe(true);
    expect(shouldFallbackToAnotherModel(400, "plain validation error")).toBe(false);
  });
});
