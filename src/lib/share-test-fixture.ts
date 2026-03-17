import {
  createDefaultInput,
  createRosterSnapshot,
  createTurn,
  emptyUsage,
  type RunInput,
  type RunResult,
} from "@/lib/pit";

export function createCompletedShareFixture(): { input: RunInput; result: RunResult } {
  const input = createDefaultInput("global");
  const roster = createRosterSnapshot(input);
  const [coordinator, ...members] = roster;

  if (!coordinator || members.length === 0) {
    throw new Error("The share fixture requires a coordinator and at least one member.");
  }

  const rounds = Array.from({ length: input.rounds }, (_, roundIndex) => {
    const round = roundIndex + 1;

    return {
      round,
      turns: members.map((member, memberIndex) =>
        createTurn({
          kind: "member_turn",
          round,
          participant: member,
          model: member.model,
          content: `Round ${round} argument ${memberIndex + 1}`,
          rawPrompt: `member secret ${round}-${memberIndex + 1}`,
        }),
      ),
      intervention:
        round < input.rounds
          ? createTurn({
              kind: "intervention",
              round,
              participant: coordinator,
              model: coordinator.model,
              content: `Moderator intervention after round ${round}`,
              rawPrompt: `intervention secret ${round}`,
            })
          : undefined,
    };
  });

  const result: RunResult = {
    mode: input.mode,
    prompt: input.prompt,
    roster,
    opening: createTurn({
      kind: "opening",
      participant: coordinator,
      model: coordinator.model,
      content: "Opening statement",
      rawPrompt: "opening secret",
    }),
    rounds,
    consensus: createTurn({
      kind: "consensus",
      participant: coordinator,
      model: coordinator.model,
      content: "Closing statement",
      rawPrompt: "consensus secret",
    }),
    usage: {
      ...emptyUsage(),
      totalTokens: 120,
      completionTokens: 80,
      promptTokens: 40,
      cost: 0.04,
    },
    warnings: [],
  };

  return { input, result };
}
