export type PresetAudience = "global" | "portugal";

const DEFAULT_PRESET_AUDIENCE: PresetAudience = "global";

const AUDIENCE_CONTEXT_LABELS: Record<PresetAudience, string> = {
  global: "Global media & pop culture",
  portugal: "Portugal politics",
};

export function detectAudience({
  countryCode,
}: {
  acceptLanguage?: string | null | undefined;
  countryCode?: string | null | undefined;
}): PresetAudience {
  const normalizedCountryCode = countryCode?.trim().toUpperCase();

  return normalizedCountryCode === "PT" ? "portugal" : DEFAULT_PRESET_AUDIENCE;
}

export function resolveInitialAudience({
  countryCode,
}: {
  acceptLanguage?: string | null | undefined;
  countryCode?: string | null | undefined;
  starterBundleAudience?: PresetAudience | undefined;
}): PresetAudience {
  return detectAudience({ countryCode });
}

export function getAudienceContextLabel(audience: PresetAudience): string {
  return AUDIENCE_CONTEXT_LABELS[audience];
}
