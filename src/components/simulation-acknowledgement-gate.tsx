"use client";

import { usePathname } from "next/navigation";
import { type RefObject, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { GA_MEASUREMENT_ID } from "@/lib/google-analytics";
import {
  AI_SIMULATION_ACCEPTANCE_TEXT,
  AI_SIMULATION_DISCLOSURE_TEXT,
  AI_SIMULATION_MISUSE_NOTICE_TEXT,
  AI_SIMULATION_NOTICE_TITLE,
  AI_SIMULATION_PROCESSING_NOTICE_TEXT,
  SYNTHETIC_MEDIA_DISCLOSURE_TEXT,
} from "@/lib/legal-notice";
import {
  acknowledgeSimulationNotice,
  hasAcknowledgedSimulationNotice,
  subscribeToSimulationAcknowledgement,
} from "@/lib/simulation-acknowledgement";
import {
  type TelemetryPurpose,
  writeTelemetryConsent,
} from "@/lib/telemetry-consent";

const EXIT_URL = "https://www.google.com/";
const SENTRY_CLIENT_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";
const CONFIGURED_TELEMETRY_PURPOSES: TelemetryPurpose[] = [
  ...(GA_MEASUREMENT_ID ? (["analytics"] as const) : []),
  ...(SENTRY_CLIENT_DSN ? (["errorReporting"] as const) : []),
];
const TELEMETRY_PREFERENCE_COPY: Record<TelemetryPurpose, { title: string; description: string }> = {
  analytics: {
    title: "Help improve aipit",
    description: "Share basic usage signals so we can see what is helpful and what needs work.",
  },
  errorReporting: {
    title: "Share crash reports",
    description: "Send details when something breaks so we can find and fix problems faster.",
  },
};

function subscribeToHydration() {
  return () => {};
}

function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked || typeof document === "undefined") {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isLocked]);
}

function useRequiredDialogFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  isActive: boolean,
) {
  useEffect(() => {
    if (!isActive || typeof document === "undefined") {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const resolveFocusableElements = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

    (initialFocusRef.current ?? resolveFocusableElements()[0] ?? container).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = resolveFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement || !container.contains(document.activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, initialFocusRef, isActive]);
}

export function SimulationAcknowledgementGate() {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [step, setStep] = useState<"notice" | "privacy">("notice");
  const [telemetrySelections, setTelemetrySelections] = useState<Record<TelemetryPurpose, boolean>>({
    analytics: true,
    errorReporting: true,
  });
  const pathname = usePathname();
  const hasHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => true);
  const isAcknowledged = useSyncExternalStore(
    subscribeToSimulationAcknowledgement,
    hasAcknowledgedSimulationNotice,
    () => false,
  );
  const isLegalRoute = pathname === "/legal" || pathname === "/terms" || pathname === "/privacy";
  const isVisible = hasHydrated && !isLegalRoute && !isAcknowledged;
  const hasTelemetryPurposes = CONFIGURED_TELEMETRY_PURPOSES.length > 0;

  useBodyScrollLock(isVisible);
  useRequiredDialogFocusTrap(panelRef, panelRef, isVisible);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    panelRef.current?.scrollTo({ top: 0 });
    panelRef.current?.focus();
  }, [isVisible, step]);

  if (!isVisible) {
    return null;
  }

  function setTelemetrySelection(purpose: TelemetryPurpose, value: boolean) {
    setTelemetrySelections((current) => ({
      ...current,
      [purpose]: value,
    }));
  }

  function setAllTelemetrySelections(value: boolean) {
    setTelemetrySelections((current) => ({
      ...current,
      ...Object.fromEntries(CONFIGURED_TELEMETRY_PURPOSES.map((purpose) => [purpose, value])),
    }));
  }

  function writeSelectedTelemetryConsent() {
    for (const purpose of CONFIGURED_TELEMETRY_PURPOSES) {
      writeTelemetryConsent(purpose, telemetrySelections[purpose] ? "granted" : "denied");
    }
  }

  function handleNoticeContinue() {
    if (!hasAcceptedLegal) {
      return;
    }

    if (hasTelemetryPurposes) {
      setStep("privacy");
      return;
    }

    acknowledgeSimulationNotice();
  }

  function handlePrivacyDone() {
    writeSelectedTelemetryConsent();
    acknowledgeSimulationNotice();
  }

  function handleLeaveSite() {
    window.location.assign(EXIT_URL);
  }

  return (
    <div className="simulation-acknowledgement-backdrop">
      <section
        ref={panelRef}
        className="settings-sheet simulation-acknowledgement-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {step === "notice" ? (
          <>
            <div className="simulation-acknowledgement-copy">
              <p className="hero-kicker">Required Notice</p>
              <h2 id={titleId}>{AI_SIMULATION_NOTICE_TITLE}</h2>
              <div id={descriptionId} className="simulation-acknowledgement-text">
                <p>{AI_SIMULATION_DISCLOSURE_TEXT}</p>
                <p>{SYNTHETIC_MEDIA_DISCLOSURE_TEXT}</p>
                <p>{AI_SIMULATION_MISUSE_NOTICE_TEXT}</p>
                <p>{AI_SIMULATION_PROCESSING_NOTICE_TEXT}</p>
                <p>
                  {AI_SIMULATION_ACCEPTANCE_TEXT}{" "}
                  <a href="/legal#terms">Terms</a>
                  {" · "}
                  <a href="/legal#privacy">Privacy Policy</a>
                </p>
                {hasTelemetryPurposes ? (
                  <p>
                    After accepting, you can choose whether this browser shares usage signals or crash reports.
                  </p>
                ) : null}
              </div>
            </div>
            <label className="simulation-acknowledgement-checkbox">
              <input
                type="checkbox"
                checked={hasAcceptedLegal}
                onChange={(event) => setHasAcceptedLegal(event.target.checked)}
              />
              <span>I accept The AI Pit Terms and Privacy Policy.</span>
            </label>
            <div className="simulation-acknowledgement-actions">
              <button type="button" className="action-button" onClick={handleLeaveSite}>
                Leave site
              </button>
              <button
                type="button"
                className="action-button action-button-primary"
                disabled={!hasAcceptedLegal}
                onClick={handleNoticeContinue}
              >
                {hasTelemetryPurposes ? "Continue" : "I agree and continue"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="settings-modal-header">
              <div>
                <p className="hero-kicker">Privacy</p>
                <h2 id={titleId} className="hero-panel-title">
                  Privacy preferences
                </h2>
              </div>
            </div>
            <div id={descriptionId} className="telemetry-preferences-body">
              <p>
                Choose what aipit can use from this browser. Turning these off will not affect your debates, saved
                settings, or access to the app.
              </p>
              {CONFIGURED_TELEMETRY_PURPOSES.map((purpose) => {
                const copy = TELEMETRY_PREFERENCE_COPY[purpose];

                return (
                  <label key={purpose} className="telemetry-preference-row">
                    <span className="telemetry-preference-copy">
                      <strong>{copy.title}</strong>
                      <span>{copy.description}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={telemetrySelections[purpose]}
                      onChange={(event) => setTelemetrySelection(purpose, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="telemetry-preferences-actions">
              <button type="button" className="action-button" onClick={() => setAllTelemetrySelections(false)}>
                Turn both off
              </button>
              <button type="button" className="action-button" onClick={() => setAllTelemetrySelections(true)}>
                Allow both
              </button>
              <button type="button" className="action-button action-button-primary" onClick={handlePrivacyDone}>
                Done
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
