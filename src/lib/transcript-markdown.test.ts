import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TranscriptMarkdown from "@/components/transcript-markdown";
import type { PitTurn } from "@/lib/pit";
import { buildTranscriptMarkdown } from "@/lib/transcript-markdown";

function createTurn(overrides: Partial<PitTurn> = {}): PitTurn {
  return {
    id: "turn-1",
    kind: "member_turn",
    round: 1,
    speakerId: "speaker-1",
    speakerName: "Speaker",
    model: "model-name",
    character: "Character",
    content: "Fallback content",
    bubbles: [{ id: "bubble-1", content: "Bubble content" }],
    rawPrompt: "Raw prompt",
    ...overrides,
  };
}

describe("transcript markdown safety", () => {
  it("renders turn model as low-emphasis heading metadata", () => {
    const markdown = buildTranscriptMarkdown({
      prompt: "Prompt",
      turns: [createTurn()],
      isRunning: false,
      chapterLabelForTurn: () => "Round 1",
    });

    const html = renderToStaticMarkup(createElement(TranscriptMarkdown, { markdown }));

    expect(html).toContain('<span class="transcript-markdown-heading-title">Round 1 · Speaker</span>');
    expect(html).toContain('<span class="transcript-markdown-heading-model">· model-name</span>');
  });

  it("renders model-authored markdown as literal text", () => {
    const markdown = buildTranscriptMarkdown({
      prompt: "[x](https://example.com)\n# heading",
      turns: [
        createTurn({
          speakerName: "![img](https://example.com/pixel.png)",
          model: "```unsafe```",
          bubbles: [
            {
              id: "bubble-1",
              content: "[x](https://example.com)\n![img](https://example.com/pixel.png)\n# heading\n```code```",
            },
          ],
        }),
      ],
      isRunning: false,
      chapterLabelForTurn: () => "Round 1",
    });

    const html = renderToStaticMarkup(createElement(TranscriptMarkdown, { markdown }));

    expect(html).toContain('<h2 class="transcript-markdown-h2">Prompt</h2>');
    expect(html).toContain('[x](https://example.com)');
    expect(html).toContain('![img](https://example.com/pixel.png)');
    expect(html).toContain("# heading");
    expect(html).toContain("```code```");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('<h1 class="transcript-markdown-h1">heading</h1>');
  });
});
