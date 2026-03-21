import { describe, expect, it } from "vitest";
import { PARTICIPANT_CHARACTER_PRESET_MAP } from "@/lib/character-presets";
import {
  buildCharacterVoiceProfilePrompt,
  buildCompactCharacterPrompt,
  createCharacterProfile,
} from "@/lib/character-profile";

describe("character-profile helpers", () => {
  it("keeps prompt notes even when the profile is richly populated", () => {
    const profile = createCharacterProfile({
      role: "Public figure",
      personality: "Combative and theatrical",
      perspective: "Treat politics as leverage and image warfare.",
      temperament: "Reactive and performative",
      debateStyle: "Overwhelm the frame and repeat key claims.",
      speechStyle: "Short, emphatic rally cadence.",
      guardrails: "Avoid technocratic dryness.",
      promptNotes: "Let the messy cadence and digressions show when the character would really talk that way.",
    });

    expect(buildCompactCharacterPrompt(profile)).toContain(
      "Additional guidance: Let the messy cadence and digressions show when the character would really talk that way.",
    );
  });

  it("renders a high-disfluency voice prompt for donald trump", () => {
    const preset = PARTICIPANT_CHARACTER_PRESET_MAP.get("donald-trump");

    expect(preset).toBeDefined();
    expect(buildCharacterVoiceProfilePrompt(preset!.characterProfile)).toMatchInlineSnapshot(`
      "Cadence: Short, emphatic sentences; repetition; superlatives; taunts; confidence-heavy phrasing; blunt conversational English that sounds like a rally, TV hit, or improvised stump speech.
      Syntax: Fragments, restarts, stacked emphasis, repeated adjectives, and self-interruptions are normal. Let sentences lurch forward through confidence and instinct instead of formal structure.
      Rhetorical moves: Overpower the frame, brand opponents as weak or dishonest, repeat core claims until they stick, and treat concession as a tactical loss unless it can be turned into a larger win. Keep the tone forceful, image-conscious, and transactional; arguments should emphasize strength, leverage, public perception, and whether something looks like a win or a humiliation.
      Disfluencies: Allow verbal clutter, repeated fillers, abrupt restarts, and half-finished clauses. Do not clean obvious tangents or jumbled transitions into polished argument prose.
      Segues: Pivot through vibes, status comparisons, grievances, anecdotes, and crowd-energy jumps rather than neat logical bridges.
      Lexical habits: Reuse superlatives, winner-loser framing, public-image language, and simple brand-like descriptors instead of precise technocratic vocabulary.
      Forbidden cleanups: Do not rewrite this voice into tidy moderator prose, generic debate-club transitions, balanced essay structure, or polished broadcast-neutral wording.
      Relevance floor: However messy the cadence gets, answer at least one live claim, accusation, or pressure point from the transcript and stay understandable enough that a listener can follow the point."
    `);
  });

  it("renders a low-disfluency voice prompt for luis montenegro", () => {
    const preset = PARTICIPANT_CHARACTER_PRESET_MAP.get("luis-montenegro");

    expect(preset).toBeDefined();
    expect(buildCharacterVoiceProfilePrompt(preset!.characterProfile)).toMatchInlineSnapshot(`
      "Cadence: Medium-length sentences, crisp transitions, little slang, few metaphors, frequent appeals to trust and stability. He sounds like someone defending a governing majority, not like an activist or pundit.
      Syntax: Mostly complete spoken sentences with deliberate sequencing and controlled clause structure. Keep it human, but do not inject clutter the character would not naturally produce.
      Rhetorical moves: Acknowledge constraints, insist on seriousness, reject improvisation, and return to confidence, moderation, responsibility, and results. Assume he is speaking from the standpoint of an incumbent national leader balancing party management with governing responsibility; prefer cabinet-level framing and implementation detail.
      Disfluencies: Keep disfluencies light and selective. Small pauses or restarts are fine, but the voice should mostly stay composed and controlled.
      Segues: Move between points with spoken momentum instead of tidy debate-club transitions.
      Lexical habits: Reuse a few favored framing words, contrasts, and recurring terms instead of paraphrasing every idea into neutral synonyms. Let the word choice sound natively European Portuguese first; competent English when needed.
      Forbidden cleanups: Do not rewrite this voice into tidy moderator prose, generic debate-club transitions, balanced essay structure, or polished broadcast-neutral wording.
      Relevance floor: However messy the cadence gets, answer at least one live claim, accusation, or pressure point from the transcript and stay understandable enough that a listener can follow the point."
    `);
  });
});
