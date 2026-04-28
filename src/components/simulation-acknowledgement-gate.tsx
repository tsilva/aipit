"use client";

import { usePathname } from "next/navigation";
import { type RefObject, useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  AI_SIMULATION_ACCEPTANCE_TEXT,
  AI_SIMULATION_DISCLOSURE_TEXT,
  AI_SIMULATION_MISUSE_NOTICE_TEXT,
  AI_SIMULATION_NOTICE_TITLE,
  AI_SIMULATION_PROCESSING_NOTICE_TEXT,
} from "@/lib/legal-notice";
import {
  acknowledgeSimulationNotice,
  hasAcknowledgedSimulationNotice,
  subscribeToSimulationAcknowledgement,
} from "@/lib/simulation-acknowledgement";

const EXIT_URL = "https://www.google.com/";

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
  const acknowledgeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const hasHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const isAcknowledged = useSyncExternalStore(
    subscribeToSimulationAcknowledgement,
    hasAcknowledgedSimulationNotice,
    () => true,
  );
  const isLegalRoute = pathname === "/legal" || pathname === "/terms" || pathname === "/privacy";
  const isVisible = hasHydrated && !isLegalRoute && !isAcknowledged;

  useBodyScrollLock(isVisible);
  useRequiredDialogFocusTrap(panelRef, acknowledgeButtonRef, isVisible);

  if (!isVisible) {
    return null;
  }

  function handleAcknowledge() {
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
        <div className="simulation-acknowledgement-copy">
          <p className="hero-kicker">Required Notice</p>
          <h2 id={titleId}>{AI_SIMULATION_NOTICE_TITLE}</h2>
          <div id={descriptionId} className="simulation-acknowledgement-text">
            <p>{AI_SIMULATION_DISCLOSURE_TEXT}</p>
            <p>{AI_SIMULATION_MISUSE_NOTICE_TEXT}</p>
            <p>{AI_SIMULATION_PROCESSING_NOTICE_TEXT}</p>
            <p>
              {AI_SIMULATION_ACCEPTANCE_TEXT}{" "}
              <a href="/legal#terms">Terms</a>
              {" · "}
              <a href="/legal#privacy">Privacy Policy</a>
            </p>
          </div>
        </div>
        <div className="simulation-acknowledgement-actions">
          <button type="button" className="action-button" onClick={handleLeaveSite}>
            Leave site
          </button>
          <button
            ref={acknowledgeButtonRef}
            type="button"
            className="action-button action-button-primary"
            onClick={handleAcknowledge}
          >
            I understand and agree
          </button>
        </div>
      </section>
    </div>
  );
}
