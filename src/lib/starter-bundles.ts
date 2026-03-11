export interface StarterBundleDefinition {
  id: string;
  name: string;
  prompt: string;
  moderatorPresetId: string;
  memberPresetIds: readonly [string, string, string];
}

export const DEFAULT_COORDINATOR_PRESET_ID = "jose-rodrigues-dos-santos";
export const COORDINATOR_PRESET_ID = DEFAULT_COORDINATOR_PRESET_ID;
export const US_COORDINATOR_PRESET_ID = "anderson-cooper";
export const SILLIEST_STARTER_BUNDLE_ID = "ocean-democracy-meltdown";

export const STARTER_BUNDLES: StarterBundleDefinition[] = [
  {
    id: "portugal-housing-war",
    name: "Portugal Housing War",
    prompt: "Should governments criminalize street camping even when housing supply is still broken?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["luis-montenegro", "mariana-mortagua", "andre-ventura"],
  },
  {
    id: "property-war-portugal",
    name: "Property War Portugal",
    prompt: "Should governments impose hard limits on how many homes one person or fund can own?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "joao-cotrim-de-figueiredo", "henrique-gouveia-e-melo"],
  },
  {
    id: "security-state-pressure",
    name: "Security State Pressure",
    prompt: "Should governments make DNA databases mandatory for all citizens to solve future crimes?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["henrique-gouveia-e-melo", "andre-ventura", "mariana-mortagua"],
  },
  {
    id: "gender-identity-flashpoint",
    name: "Gender Identity Flashpoint",
    prompt: "Can men get pregnant?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "andre-ventura", "luis-montenegro"],
  },
  {
    id: "podcaster-free-speech-war",
    name: "Podcaster Free Speech War",
    prompt: "Should online anonymity be abolished for accounts with more than a million followers?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["alex-jones", "lex-fridman", "joe-rogan"],
  },
  {
    id: "ai-liability-meltdown",
    name: "AI Liability Meltdown",
    prompt: "Should AI companies be held criminally liable when their models enable mass fraud or suicide coaching?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["elon-musk", "lex-fridman", "rick-sanchez"],
  },
  {
    id: "border-prime-time",
    name: "Border Prime Time",
    prompt: "Should rich democracies deport migrants who enter illegally even if they have built families locally?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["donald-trump", "joe-rogan", "alex-jones"],
  },
  {
    id: "absurdity-welfare-panel",
    name: "Absurdity Welfare Panel",
    prompt: "Should universal basic income replace most targeted welfare programs even if some vulnerable groups lose out?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["homer-simpson", "rick-sanchez", "knight-who-says-ni"],
  },
  {
    id: "toilet-paper-emergency",
    name: "Toilet Paper Emergency",
    prompt:
      "Should governments maintain strategic toilet paper reserves for national emergencies, or is that proof civilization has already collapsed?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["cornholio", "homer-simpson", "rick-sanchez"],
  },
  {
    id: "ocean-democracy-meltdown",
    name: "Ocean Democracy Meltdown",
    prompt: "Should dolphins get voting rights in coastal cities if they can consistently recognize corrupt politicians?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["rick-sanchez", "homer-simpson", "knight-who-says-ni"],
  },
];

export const STARTER_BUNDLE_ALIAS_MAP = new Map<string, string>([
  ["silliest", SILLIEST_STARTER_BUNDLE_ID],
]);
