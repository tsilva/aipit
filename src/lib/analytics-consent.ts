"use client";

export type AnalyticsConsentState = "unset" | "granted" | "denied";

const ANALYTICS_CONSENT_KEY = "aipit.analytics-consent";
const ANALYTICS_CONSENT_EVENT = "aipit:analytics-consent-change";

function isValidConsentState(value: string | null): value is AnalyticsConsentState {
  return value === "unset" || value === "granted" || value === "denied";
}

export function readAnalyticsConsent(): AnalyticsConsentState {
  if (typeof window === "undefined") {
    return "unset";
  }

  const storedValue = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  return isValidConsentState(storedValue) ? storedValue : "unset";
}

export function writeAnalyticsConsent(value: Exclude<AnalyticsConsentState, "unset">): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
}

export function subscribeToAnalyticsConsent(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(ANALYTICS_CONSENT_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
