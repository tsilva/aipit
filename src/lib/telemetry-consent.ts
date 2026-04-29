import { GEO_COUNTRY_COOKIE, isEuropeanUnionCountry, normalizeCountryCode } from "@/lib/region";

export type TelemetryPurpose = "analytics" | "errorReporting";
export type TelemetryConsentState = "unset" | "granted" | "denied";

type HeaderRecord = Record<string, string | string[] | undefined>;
type HeaderReader = {
  get(name: string): string | null;
};

const TELEMETRY_CONSENT_EVENT = "aipit:telemetry-consent-change";
const LEGACY_ANALYTICS_CONSENT_KEY = "aipit.analytics-consent";
const TELEMETRY_CONSENT_LOCAL_STORAGE_KEYS: Record<TelemetryPurpose, string> = {
  analytics: "aipit.telemetry.analytics",
  errorReporting: "aipit.telemetry.error-reporting",
};
const TELEMETRY_CONSENT_COOKIE_NAMES: Record<TelemetryPurpose, string> = {
  analytics: "aipit-analytics-consent",
  errorReporting: "aipit-error-reporting-consent",
};
const TELEMETRY_CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const TELEMETRY_CONSENT_CHANGE_EVENT = TELEMETRY_CONSENT_EVENT;

function isValidConsentState(value: string | null | undefined): value is TelemetryConsentState {
  return value === "unset" || value === "granted" || value === "denied";
}

function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;

  for (const cookie of cookieHeader.split(";")) {
    const trimmedCookie = cookie.trim();

    if (trimmedCookie.startsWith(encodedName)) {
      return decodeURIComponent(trimmedCookie.slice(encodedName.length));
    }
  }

  return null;
}

function readDocumentCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  return readCookieValue(document.cookie, name);
}

function writeDocumentCookie(name: string, value: TelemetryConsentState): void {
  if (typeof document === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${TELEMETRY_CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function readHeader(headers: HeaderReader | HeaderRecord | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  const reader = headers as HeaderReader;
  if (typeof reader.get === "function") {
    return reader.get(name) ?? undefined;
  }

  const record = headers as HeaderRecord;
  const value = record[name] ?? record[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value;
}

function readTelemetryConsentCookie(
  purpose: TelemetryPurpose,
  cookieHeader: string | null | undefined,
): TelemetryConsentState {
  const value = readCookieValue(cookieHeader, TELEMETRY_CONSENT_COOKIE_NAMES[purpose]);
  return isValidConsentState(value) ? value : "unset";
}

export function requiresTelemetryConsent(countryCode?: string | null | undefined): boolean {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  return normalizedCountryCode ? isEuropeanUnionCountry(normalizedCountryCode) : true;
}

export function hasTelemetryPermission({
  consent,
  requireConsent,
}: {
  consent: TelemetryConsentState;
  requireConsent: boolean;
}): boolean {
  return consent === "granted" || (!requireConsent && consent !== "denied");
}

export function readTelemetryConsent(purpose: TelemetryPurpose): TelemetryConsentState {
  if (typeof window === "undefined") {
    return "unset";
  }

  const storedValue = window.localStorage.getItem(TELEMETRY_CONSENT_LOCAL_STORAGE_KEYS[purpose]);
  if (isValidConsentState(storedValue)) {
    return storedValue;
  }

  if (purpose === "analytics") {
    const legacyStoredValue = window.localStorage.getItem(LEGACY_ANALYTICS_CONSENT_KEY);
    if (isValidConsentState(legacyStoredValue)) {
      return legacyStoredValue;
    }
  }

  return readTelemetryConsentCookie(purpose, typeof document === "undefined" ? null : document.cookie);
}

export function writeTelemetryConsent(
  purpose: TelemetryPurpose,
  value: Exclude<TelemetryConsentState, "unset">,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TELEMETRY_CONSENT_LOCAL_STORAGE_KEYS[purpose], value);

  if (purpose === "analytics") {
    window.localStorage.setItem(LEGACY_ANALYTICS_CONSENT_KEY, value);
  }

  writeDocumentCookie(TELEMETRY_CONSENT_COOKIE_NAMES[purpose], value);
  window.dispatchEvent(new Event(TELEMETRY_CONSENT_EVENT));
}

export function writeTelemetryConsentForPurposes(
  purposes: TelemetryPurpose[],
  value: Exclude<TelemetryConsentState, "unset">,
): void {
  for (const purpose of purposes) {
    writeTelemetryConsent(purpose, value);
  }
}

export function readTelemetryConsentRequirement(): boolean {
  return requiresTelemetryConsent(readDocumentCookie(GEO_COUNTRY_COOKIE));
}

export function readTelemetryConsentFromHeaders(
  purpose: TelemetryPurpose,
  headers: HeaderReader | HeaderRecord | undefined,
): TelemetryConsentState {
  return readTelemetryConsentCookie(purpose, readHeader(headers, "cookie"));
}

export function readTelemetryConsentRequirementFromHeaders(
  headers: HeaderReader | HeaderRecord | undefined,
): boolean {
  const cookieHeader = readHeader(headers, "cookie");
  const cookieCountryCode = readCookieValue(cookieHeader, GEO_COUNTRY_COOKIE);
  const headerCountryCode = readHeader(headers, "cf-ipcountry") ?? readHeader(headers, "x-vercel-ip-country");

  return requiresTelemetryConsent(cookieCountryCode ?? headerCountryCode);
}

export function hasTelemetryPermissionForHeaders(
  purpose: TelemetryPurpose,
  headers: HeaderReader | HeaderRecord | undefined,
): boolean {
  return hasTelemetryPermission({
    consent: readTelemetryConsentFromHeaders(purpose, headers),
    requireConsent: readTelemetryConsentRequirementFromHeaders(headers),
  });
}

export function subscribeToTelemetryConsent(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(TELEMETRY_CONSENT_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(TELEMETRY_CONSENT_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
