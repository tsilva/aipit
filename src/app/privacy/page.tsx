import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | The AI Pit",
  description:
    "Privacy details for The AI Pit, including hosted OpenRouter processing, optional analytics consent, and service providers.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <p className="legal-eyebrow">Privacy</p>
        <h1 className="legal-title">Privacy policy</h1>
        <div className="legal-copy">
          <p>
            The AI Pit is provided by the operator of this deployment. Questions about this policy should be directed
            to the contact channel made available with the deployment.
          </p>
          <p>
            The AI Pit supports two OpenRouter usage modes. If you provide your own OpenRouter API key, requests are
            proxied through the app only to complete the request you initiated. If you do not provide your own key and
            the app offers a hosted key, your prompts, character settings, and model outputs are processed through The
            AI Pit&apos;s server-side proxy and then through The AI Pit&apos;s OpenRouter account.
          </p>
          <p>
            Debate content is processed to generate the requested debate session. The AI Pit does not provide
            account-backed transcript storage, and personal OpenRouter API keys are not intentionally persisted across
            reloads. Do not submit secrets, credentials, payment data, health data, or other sensitive personal data
            through the hosted-key path.
          </p>
          <p>
            Server logs and abuse-prevention systems may temporarily process operational metadata such as request ID,
            route name, response status, timing, and IP-derived rate-limit or security signals. These records are used
            for debugging, abuse prevention, reliability, and incident response.
          </p>
          <p>
            If analytics is configured for the deployment, Google Analytics is loaded only after explicit consent.
            Declining analytics keeps the app functional and prevents analytics scripts from loading. If Sentry is
            configured, runtime errors may also be sent to Sentry for debugging.
          </p>
          <p>
            Service providers may include OpenRouter for model access, Vercel or another hosting provider for serving
            the application and route handlers, Google Analytics if you consent to analytics, and Sentry if error
            reporting is enabled for the deployment.
          </p>
          <p>
            This app is intended for interactive experimentation, not regulated or high-sensitivity processing. If you
            need stronger confidentiality guarantees, use your own API key or do not submit the content.
          </p>
        </div>
        <div className="legal-actions">
          <Link href="/">Back to The AI Pit</Link>
        </div>
      </div>
    </main>
  );
}
