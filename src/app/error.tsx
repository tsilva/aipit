"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="error-shell">
      <div className="error-panel">
        <p className="legal-eyebrow">Runtime error</p>
        <h1 className="legal-title">Something broke in The AI Pit.</h1>
        <p className="hero-panel-copy">
          The error was captured for debugging when app-level error reporting is enabled. Try the action again, or reload
          if the app still feels stuck.
        </p>
        <div className="legal-actions">
          <button type="button" className="action-button action-button-primary" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
