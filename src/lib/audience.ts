export type PresetAudience = "global" | "portugal";

const DEFAULT_PRESET_AUDIENCE: PresetAudience = "global";

const AUDIENCE_CONTEXT_LABELS: Record<PresetAudience, string> = {
  global: "Global media & pop culture",
  portugal: "Portugal politics",
};

export function detectAudience({
  acceptLanguage,
  countryCode,
}: {
  acceptLanguage?: string | null | undefined;
  countryCode?: string | null | undefined;
}): PresetAudience {
  const preferredLanguage = acceptLanguage
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const normalizedCountryCode = countryCode?.trim().toUpperCase();

  return preferredLanguage?.startsWith("pt") || normalizedCountryCode === "PT"
    ? "portugal"
    : DEFAULT_PRESET_AUDIENCE;
}

export function resolveInitialAudience({
  acceptLanguage,
  countryCode,
  starterBundleAudience,
}: {
  acceptLanguage?: string | null | undefined;
  countryCode?: string | null | undefined;
  starterBundleAudience?: PresetAudience | undefined;
}): PresetAudience {
  return starterBundleAudience ?? detectAudience({ acceptLanguage, countryCode });
}

export function getAudienceContextLabel(audience: PresetAudience): string {
  return AUDIENCE_CONTEXT_LABELS[audience];
}
