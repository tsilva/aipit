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
  {
    id: "tourism-overdose-portugal",
    name: "Tourism Overdose Portugal",
    prompt: "Should Lisbon and Porto cap short-term rentals and tourist beds even if that kills investment and nightlife?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "luis-montenegro", "joao-cotrim-de-figueiredo"],
  },
  {
    id: "national-service-showdown",
    name: "National Service Showdown",
    prompt: "Should Portugal require one year of mandatory national service for every 18-year-old?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["henrique-gouveia-e-melo", "andre-ventura", "catarina-martins"],
  },
  {
    id: "retirement-age-riot",
    name: "Retirement Age Riot",
    prompt: "Should Portugal raise the retirement age above 70 to keep the pension system alive?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["luis-marques-mendes", "paulo-raimundo", "antonio-costa"],
  },
  {
    id: "rail-vs-roads-portugal",
    name: "Rail vs Roads Portugal",
    prompt: "Should Portugal pour billions into free rail and cut airport and highway expansion instead?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["pedro-nuno-santos", "ines-sousa-real", "joao-cotrim-de-figueiredo"],
  },
  {
    id: "social-media-age-ban",
    name: "Social Media Age Ban",
    prompt: "Should governments ban social media for everyone under 16 even if parents strongly object?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["dr-phil", "joe-rogan", "eric-cartman"],
  },
  {
    id: "office-return-bloodsport",
    name: "Office Return Bloodsport",
    prompt: "Should companies be allowed to fire employees who refuse to return to the office full time?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["dwight-schrute", "saul-goodman", "homer-simpson"],
  },
  {
    id: "mars-before-earth",
    name: "Mars Before Earth",
    prompt: "Should governments subsidize Mars colonies before they have fixed homelessness, hospitals, and schools on Earth?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["elon-musk", "rick-sanchez", "mariana-mortagua"],
  },
  {
    id: "deepfake-defamation-war",
    name: "Deepfake Defamation War",
    prompt: "Should publishing AI deepfakes of real people carry criminal penalties even when the creator claims it was satire?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["saul-goodman", "elon-musk", "alex-jones"],
  },
  {
    id: "meat-tax-firestorm",
    name: "Meat Tax Firestorm",
    prompt: "Should governments heavily tax meat and dairy to hit climate goals faster?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["ines-sousa-real", "gordon-ramsay", "joe-rogan"],
  },
  {
    id: "college-scam-tribunal",
    name: "College Scam Tribunal",
    prompt: "Is college now a luxury-status scam that most young people should skip?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["joe-rogan", "lex-fridman", "saul-goodman"],
  },
];

export const STARTER_BUNDLE_ALIAS_MAP = new Map<string, string>([
  ["silliest", SILLIEST_STARTER_BUNDLE_ID],
]);
