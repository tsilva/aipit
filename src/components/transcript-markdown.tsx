"use client";

import { Children, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

function renderTranscriptHeading(children: ReactNode): ReactNode {
  const childParts = Children.toArray(children);

  if (childParts.length !== 1 || typeof childParts[0] !== "string") {
    return children;
  }

  const headingParts = childParts[0].split(" · ");

  if (headingParts.length < 3) {
    return children;
  }

  const model = headingParts.pop()?.trim();
  const title = headingParts.join(" · ").trim();

  if (!model || !title) {
    return children;
  }

  return (
    <>
      <span className="transcript-markdown-heading-title">{title}</span>
      <span className="transcript-markdown-heading-model">· {model}</span>
    </>
  );
}

export default function TranscriptMarkdown({
  markdown,
}: {
  markdown: string;
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="transcript-markdown-h1">{children}</h1>,
        h2: ({ children }) => <h2 className="transcript-markdown-h2">{renderTranscriptHeading(children)}</h2>,
        p: ({ children }) => <p className="transcript-markdown-p">{children}</p>,
        em: ({ children }) => <em className="transcript-markdown-em">{children}</em>,
        ul: ({ children }) => <ul className="transcript-markdown-ul">{children}</ul>,
        ol: ({ children }) => <ol className="transcript-markdown-ol">{children}</ol>,
        li: ({ children }) => <li className="transcript-markdown-li">{children}</li>,
        code: ({ children }) => <code className="transcript-markdown-code">{children}</code>,
        blockquote: ({ children }) => <blockquote className="transcript-markdown-blockquote">{children}</blockquote>,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
