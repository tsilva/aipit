import Link from "next/link";
import { PARTICIPANT_CHARACTER_PRESETS } from "@/lib/character-presets";
import {
  LANDING_FAQ_ITEMS,
  buildBundleDescription,
  getFeaturedStarterBundles,
} from "@/lib/seo";
import { US_COORDINATOR_PRESET_ID } from "@/lib/starter-bundles";

const participantNameById = new Map(
  PARTICIPANT_CHARACTER_PRESETS.map((preset) => [preset.id, preset.name] as const),
);

function getBundleHref(bundleId: string): string {
  return `/?id=${encodeURIComponent(bundleId)}`;
}

function getCastLabel(memberPresetIds: readonly string[]): string {
  const names = memberPresetIds
    .map((presetId) => participantNameById.get(presetId))
    .filter((name): name is string => Boolean(name));

  return names.join(" • ");
}

export function LandingSeoContent() {
  const featuredBundles = getFeaturedStarterBundles();

  return (
    <section className="landing-seo-shell" aria-label="The AI Pit overview">
      <section className="hero-panel landing-seo-panel">
        <div className="landing-seo-grid">
          <div className="landing-seo-column">
            <p className="hero-kicker">AI Debate Simulator</p>
            <h2 className="hero-panel-title">Start moderator-led AI debates with distinct AI characters</h2>
            <p className="hero-panel-copy">
              The AI Pit is a browser-based AI debate simulator for turning one prompt into a moderated
              clash between distinct voices. Build your own lineup, remix characters, and watch the
              debate unfold in structured rounds without leaving the page.
            </p>
          </div>

          <ul className="landing-seo-list" aria-label="Core platform highlights">
            <li>Run live AI debates with a moderator, multiple debaters, and a tracked transcript.</li>
            <li>Swap between recognizable presets, political voices, and custom character profiles.</li>
            <li>Use an OpenRouter key or a hosted server key when one is configured for the app.</li>
          </ul>
        </div>
      </section>

      <section className="hero-panel landing-seo-panel">
        <div className="landing-seo-column">
          <p className="hero-kicker">How It Works</p>
          <h2 className="hero-panel-title">From prompt to playable debate in three steps</h2>
        </div>

        <ol className="landing-seo-steps">
          <li>
            <strong>Choose the debate topic.</strong> Start from a curated scenario or write your own
            prompt for the moderator and debaters to attack.
          </li>
          <li>
            <strong>Set the cast.</strong> Pick the moderator, rotate debaters, and shape the clash with
            very different voices and worldviews.
          </li>
          <li>
            <strong>Play the debate.</strong> Watch opening statements, member turns, moderator
            interventions, and the final synthesis with transcript export built in.
          </li>
        </ol>
      </section>

      <section className="hero-panel landing-seo-panel">
        <div className="landing-seo-column">
          <p className="hero-kicker">Featured Prompts</p>
          <h2 className="hero-panel-title">Deep-linkable AI debate setups</h2>
          <p className="hero-panel-copy">
            These starter bundles render as shareable landing URLs, which makes them useful both for
            discovery and for dropping someone directly into a debate premise.
          </p>
        </div>

        <div className="landing-seo-featured-grid">
          {featuredBundles.map((bundle) => (
            <Link key={bundle.id} href={getBundleHref(bundle.id)} className="landing-seo-card">
              <p className="landing-seo-card-eyebrow">
                {bundle.audience === "portugal" ? "Portugal audience" : "Global audience"}
              </p>
              <h3 className="landing-seo-card-title">{bundle.name}</h3>
              <p className="landing-seo-card-copy">{bundle.prompt}</p>
              <p className="landing-seo-card-meta">
                {bundle.moderatorPresetId === US_COORDINATOR_PRESET_ID ? "Anderson Cooper" : "José Rodrigues dos Santos"} moderates
              </p>
              <p className="landing-seo-card-cast">{getCastLabel(bundle.memberPresetIds)}</p>
              <p className="landing-seo-card-description">{buildBundleDescription(bundle)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="hero-panel landing-seo-panel" id="faq">
        <div className="landing-seo-column">
          <p className="hero-kicker">FAQ</p>
          <h2 className="hero-panel-title">Common questions about The AI Pit</h2>
        </div>

        <div className="landing-seo-faq-list">
          {LANDING_FAQ_ITEMS.map((item) => (
            <article key={item.question} className="landing-seo-faq-item">
              <h3 className="landing-seo-faq-question">{item.question}</h3>
              <p className="landing-seo-faq-answer">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
