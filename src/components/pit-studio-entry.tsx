"use client";

import dynamic from "next/dynamic";

function PitStudioLoadingFallback() {
  return (
    <main className="studio-page">
      <div className="mx-auto w-full max-w-[90rem] px-2 py-2 sm:px-5 lg:px-6 lg:py-5">
        <section className="hero-shell" aria-busy="true">
          <section className="hero-panel hero-copy-panel">
            <div className="hero-copy-stack">
              <h1 className="hero-title">The AI Pit</h1>
              <p className="hero-body">Choose a topic, select debaters, hit start, get some popcorn 🍿.</p>
            </div>
          </section>

          <section className="hero-panel hero-roster-shell">
            <div className="hero-roster-header">
              <div>
                <p className="hero-kicker">Pit Lineup</p>
                <h2 className="hero-panel-title">Select the moderator and debaters</h2>
              </div>

              <div className="hero-roster-loading-indicator" role="status" aria-live="polite">
                <span className="hero-roster-loading-spinner" aria-hidden="true" />
                <span>Loading lineup...</span>
              </div>
            </div>

            <div className="hero-roster-grid hero-roster-grid-loading" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="hero-roster-card hero-roster-card-loading">
                  <div className="hero-roster-select">
                    <div className="hero-roster-card-top">
                      <div className="hero-roster-avatar hero-roster-avatar-loading" />
                      <div className="hero-roster-copy">
                        <div className="hero-roster-skeleton hero-roster-skeleton-role" />
                        <div className="hero-roster-skeleton hero-roster-skeleton-name" />
                        <div className="hero-roster-skeleton hero-roster-skeleton-model" />
                      </div>
                    </div>
                    <div className="hero-roster-skeleton hero-roster-skeleton-persona" />
                    <div className="hero-roster-skeleton hero-roster-skeleton-persona hero-roster-skeleton-persona-short" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="hero-panel hero-prompt-shell">
            <div>
              <p className="hero-kicker">Debate Topic</p>
              <h2 className="hero-panel-title">What is the debate topic about?</h2>
            </div>

            <div className="hero-loading-block hero-loading-block-prompt" aria-hidden="true" />
          </section>

          <section className="hero-panel hero-api-shell">
            <div>
              <p className="hero-kicker">OpenRouter Access</p>
              <h2 className="hero-panel-title">API key</h2>
              <p className="hero-panel-copy">Loading access controls...</p>
            </div>

            <div className="hero-loading-block hero-loading-block-api" aria-hidden="true" />
          </section>

          <button type="button" disabled className="action-button action-button-primary hero-start-button">
            START
          </button>
        </section>
      </div>
    </main>
  );
}

const PitStudio = dynamic(() => import("@/components/pit-studio").then((module) => module.PitStudio), {
  ssr: false,
  loading: () => <PitStudioLoadingFallback />,
});

export function PitStudioEntry() {
  return <PitStudio />;
}
