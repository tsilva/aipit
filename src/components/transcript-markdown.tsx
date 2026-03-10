"use client";

import ReactMarkdown from "react-markdown";

export default function TranscriptMarkdown({
  markdown,
}: {
  markdown: string;
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="transcript-markdown-h1">{children}</h1>,
        h2: ({ children }) => <h2 className="transcript-markdown-h2">{children}</h2>,
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
