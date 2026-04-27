"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body className="error-body">
        <main className="error-shell">
          <div className="error-panel">
            <p className="legal-eyebrow">Fatal error</p>
            <h1 className="legal-title">The app hit a fatal error.</h1>
            <p className="hero-panel-copy">
              Reload the page or return home. The failure was captured for debugging when app-level error reporting is
              enabled.
            </p>
            <div className="legal-actions">
              <button type="button" className="action-button action-button-primary" onClick={() => reset()}>
                Reload app
              </button>
              <Link href="/">Go home</Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
