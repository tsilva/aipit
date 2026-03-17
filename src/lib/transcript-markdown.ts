import type { PitTurn } from "@/lib/pit";

const MARKDOWN_SPECIAL_CHARACTERS = /[\\`*_{}\[\]()#+\-!>|]/g;

function escapeMarkdownText(text: string): string {
  return text.replace(MARKDOWN_SPECIAL_CHARACTERS, "\\$&");
}

function buildTranscriptTurnBody(turn: PitTurn): string {
  const segments = turn.bubbles.length > 0 ? turn.bubbles.map((bubble) => bubble.content.trim()).filter(Boolean) : [turn.content];

  return segments.map((segment) => escapeMarkdownText(segment)).join("\n\n");
}

export function buildTranscriptMarkdown({
  prompt,
  turns,
  isRunning,
  chapterLabelForTurn,
}: {
  prompt: string;
  turns: PitTurn[];
  isRunning: boolean;
  chapterLabelForTurn: (turn: PitTurn) => string;
}): string {
  const normalizedPrompt = prompt.trim();
  const lines = [
    "## Prompt",
    "",
    normalizedPrompt ? escapeMarkdownText(normalizedPrompt) : "_No prompt set yet._",
  ];

  if (turns.length === 0) {
    return lines.join("\n");
  }

  for (const turn of turns) {
    const heading = [
      chapterLabelForTurn(turn),
      turn.speakerName.trim(),
      turn.model.trim(),
    ]
      .filter(Boolean)
      .map((value) => escapeMarkdownText(value))
      .join(" · ");

    lines.push("", `## ${heading}`, "", buildTranscriptTurnBody(turn));
  }

  if (isRunning) {
    lines.push("", "_Transcript updates live as each turn completes._");
  }

  return lines.join("\n");
}
