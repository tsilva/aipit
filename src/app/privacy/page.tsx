import type { Metadata } from "next";
import Link from "next/link";

import { SITE_CONTACT_EMAIL, SITE_CONTACT_MAILTO } from "@/lib/site";
import { buildStaticPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildStaticPageMetadata({
  title: "Privacy | The AI Pit",
  description:
    "Privacy details for The AI Pit, including hosted OpenRouter processing, simulation acknowledgement storage, region-aware analytics consent, and service providers.",
  path: "/privacy",
  index: false,
  follow: true,
});

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <p className="legal-eyebrow">Privacy</p>
        <h1 className="legal-title">Privacy policy</h1>
        <div className="legal-copy">
          <p>
            The AI Pit is provided by the operator of this deployment. Questions about this policy should be directed
            to{" "}
            <a href={SITE_CONTACT_MAILTO} className="underline decoration-white/30 underline-offset-4">
              {SITE_CONTACT_EMAIL}
            </a>
            .
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
            If you create a public replay link, the app stores the debate prompt, character configuration, generated
            output, and related replay data needed to display that replay. Public replay links are accessible to anyone
            with the URL and contain user-requested, fictionalized AI-generated speech.
          </p>
          <p>
            Before using the site, visitors must acknowledge that portrayed characters are AI simulations and do not
            represent real opinions, beliefs, endorsements, positions, or statements of the people or entities they may
            resemble. That acknowledgement is stored only in this browser&apos;s localStorage under{" "}
            <code>aipit.simulation-acknowledgement</code> so the notice is not shown on every visit. If you choose to
            leave instead, the app redirects you away and does not store that acknowledgement.
          </p>
          <p>
            Server logs and abuse-prevention systems may temporarily process operational metadata such as request ID,
            route name, response status, timing, and IP-derived rate-limit or security signals. These records are used
            for debugging, abuse prevention, reliability, and incident response.
          </p>
          <p>
            If analytics is configured for the deployment, visitors in European Union countries are asked for explicit
            consent before Google Analytics loads. Outside the European Union, analytics may load by default unless
            you have already declined analytics in this browser. Declining analytics keeps the app functional and
            prevents analytics scripts from loading. If Sentry is configured, runtime errors may also be sent to
            Sentry for debugging.
          </p>
          <p>
            Service providers may include OpenRouter for model access, Vercel or another hosting provider for serving
            the application and route handlers, Google Analytics when analytics is enabled for your browser under the
            rules above, and Sentry if error reporting is enabled for the deployment.
          </p>
          <p>
            This app is intended for interactive experimentation, not regulated or high-sensitivity processing. If you
            need stronger confidentiality guarantees, use your own API key or do not submit the content.
          </p>
          <p>
            To request removal of a public replay, email{" "}
            <a href={SITE_CONTACT_MAILTO} className="underline decoration-white/30 underline-offset-4">
              {SITE_CONTACT_EMAIL}
            </a>{" "}
            with the replay URL and the basis for removal, including any copyright, image-rights, privacy, defamation,
            or other legal concern.
          </p>
          <p>
            Privacy requests or questions about this policy can be sent to{" "}
            <a href={SITE_CONTACT_MAILTO} className="underline decoration-white/30 underline-offset-4">
              {SITE_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
        <div className="legal-actions">
          <Link href="/">Back to The AI Pit</Link>
        </div>
      </div>
    </main>
  );
}
