const EUROPEAN_UNION_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

export const GEO_COUNTRY_COOKIE = "aipit-country";

type HeaderReader = {
  get(name: string): string | null;
};

export function normalizeCountryCode(countryCode?: string | null | undefined): string | undefined {
  const normalizedCountryCode = countryCode?.trim().toUpperCase();

  return normalizedCountryCode && /^[A-Z]{2}$/.test(normalizedCountryCode)
    ? normalizedCountryCode
    : undefined;
}

export function readCountryCodeFromHeaders(headers: HeaderReader): string | undefined {
  return normalizeCountryCode(headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country"));
}

export function isEuropeanUnionCountry(countryCode?: string | null | undefined): boolean {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  return normalizedCountryCode ? EUROPEAN_UNION_COUNTRY_CODES.has(normalizedCountryCode) : false;
}
