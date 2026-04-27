"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  type TelemetryConsentState,
  type TelemetryPurpose,
  hasTelemetryPermission,
  readTelemetryConsent,
  readTelemetryConsentRequirement,
  subscribeToTelemetryConsent,
  writeTelemetryConsent,
  writeTelemetryConsentForPurposes,
} from "@/lib/telemetry-consent";

const PREFERENCE_COPY: Record<TelemetryPurpose, { title: string; description: string }> = {
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

function useTelemetryState(purpose: TelemetryPurpose): TelemetryConsentState {
  return useSyncExternalStore(
    subscribeToTelemetryConsent,
    () => readTelemetryConsent(purpose),
    (): TelemetryConsentState => "unset",
  );
}

function TelemetryToggle({ purpose }: { purpose: TelemetryPurpose }) {
  const consent = useTelemetryState(purpose);
  const requiresConsent = readTelemetryConsentRequirement();
  const isEnabled = hasTelemetryPermission({ consent, requireConsent: requiresConsent });
  const copy = PREFERENCE_COPY[purpose];

  return (
    <label className="telemetry-preference-row">
      <span className="telemetry-preference-copy">
        <strong>{copy.title}</strong>
        <span>{copy.description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={isEnabled}
        onChange={(event) => writeTelemetryConsent(purpose, event.target.checked ? "granted" : "denied")}
      />
    </label>
  );
}

export function TelemetryPreferencesButton({
  className,
  label = "Privacy preferences",
}: {
  className?: string;
  label?: string;
}) {
  const hasMounted = useSyncExternalStore(subscribeToHydration, () => true, () => true);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!hasMounted) {
    return null;
  }

  return (
    <>
      <button type="button" className={className ?? "privacy-preferences-button"} onClick={() => setIsOpen(true)}>
        {label}
      </button>
      {isOpen ? (
        <div className="settings-modal-backdrop">
          <button
            type="button"
            className="settings-modal-dismiss"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
          />
          <section
            ref={dialogRef}
            className="settings-sheet settings-modal-panel telemetry-preferences-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <div className="settings-modal-header">
              <div>
                <p className="hero-kicker">Privacy</p>
                <h2 id={titleId} className="hero-panel-title">
                  Privacy preferences
                </h2>
              </div>
            </div>
            <div className="telemetry-preferences-body">
              <p>
                Choose what aipit can use from this browser. Turning these off will not affect your debates, saved
                settings, or access to the app.
              </p>
              <TelemetryToggle purpose="analytics" />
              <TelemetryToggle purpose="errorReporting" />
            </div>
            <div className="telemetry-preferences-actions">
              <button
                type="button"
                className="action-button"
                onClick={() => writeTelemetryConsentForPurposes(["analytics", "errorReporting"], "denied")}
              >
                Turn both off
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => writeTelemetryConsentForPurposes(["analytics", "errorReporting"], "granted")}
              >
                Allow both
              </button>
              <button type="button" className="action-button action-button-primary" onClick={() => setIsOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
