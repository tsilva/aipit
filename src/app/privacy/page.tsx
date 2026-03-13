import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | The AI Pit",
  description: "Privacy details for The AI Pit, including OpenRouter proxying and optional analytics consent.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <p className="legal-eyebrow">Privacy</p>
        <h1 className="legal-title">Privacy policy</h1>
        <div className="legal-copy">
          <p>
            The AI Pit proxies debate requests to OpenRouter through internal Next.js API routes. Debate content is
            processed only to complete the current request and is not stored as an account-backed transcript history.
          </p>
          <p>
            If analytics is enabled for the deployment, Google Analytics is loaded only after explicit consent.
            Declining analytics keeps the app functional and prevents analytics scripts from loading.
          </p>
          <p>
            Server logs may include request metadata such as request ID, route, upstream status, and latency for
            debugging and incident response. Personal OpenRouter API keys remain transient and are not persisted across
            reloads.
          </p>
        </div>
        <div className="legal-actions">
          <Link href="/">Back to The AI Pit</Link>
        </div>
      </div>
    </main>
  );
}
