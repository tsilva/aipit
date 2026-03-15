export type PresetAudience = "global" | "portugal";

export const DEFAULT_PRESET_AUDIENCE: PresetAudience = "global";

const AUDIENCE_LABELS: Record<PresetAudience, string> = {
  global: "Global",
  portugal: "Portugal",
};

const AUDIENCE_CONTEXT_LABELS: Record<PresetAudience, string> = {
  global: "Global media & pop culture",
  portugal: "Portugal politics",
};

export function detectAudienceFromAcceptLanguage(acceptLanguage: string | null | undefined): PresetAudience {
  const preferredLanguage = acceptLanguage
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  return preferredLanguage?.startsWith("pt") ? "portugal" : DEFAULT_PRESET_AUDIENCE;
}

export function resolveInitialAudience({
  acceptLanguage,
  starterBundleAudience,
}: {
  acceptLanguage?: string | null | undefined;
  starterBundleAudience?: PresetAudience | undefined;
}): PresetAudience {
  return starterBundleAudience ?? detectAudienceFromAcceptLanguage(acceptLanguage);
}

export function getAudienceLabel(audience: PresetAudience): string {
  return AUDIENCE_LABELS[audience];
}

export function getAudienceContextLabel(audience: PresetAudience): string {
  return AUDIENCE_CONTEXT_LABELS[audience];
}
