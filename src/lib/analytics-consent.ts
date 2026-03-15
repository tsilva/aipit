"use client";

import { GEO_COUNTRY_COOKIE, isEuropeanUnionCountry, normalizeCountryCode } from "@/lib/region";

export type AnalyticsConsentState = "unset" | "granted" | "denied";

const ANALYTICS_CONSENT_KEY = "aipit.analytics-consent";
const ANALYTICS_CONSENT_EVENT = "aipit:analytics-consent-change";

function isValidConsentState(value: string | null): value is AnalyticsConsentState {
  return value === "unset" || value === "granted" || value === "denied";
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined" || document.cookie.length === 0) {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;

  for (const cookie of document.cookie.split(";")) {
    const trimmedCookie = cookie.trim();

    if (trimmedCookie.startsWith(encodedName)) {
      return decodeURIComponent(trimmedCookie.slice(encodedName.length));
    }
  }

  return null;
}

export function requiresAnalyticsConsent(countryCode?: string | null | undefined): boolean {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  return normalizedCountryCode ? isEuropeanUnionCountry(normalizedCountryCode) : true;
}

export function hasAnalyticsPermission({
  consent,
  requireConsent,
}: {
  consent: AnalyticsConsentState;
  requireConsent: boolean;
}): boolean {
  return consent === "granted" || (!requireConsent && consent !== "denied");
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

export function readAnalyticsConsentRequirement(): boolean {
  return requiresAnalyticsConsent(readCookie(GEO_COUNTRY_COOKIE));
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
