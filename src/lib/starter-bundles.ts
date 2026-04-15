import type { PresetAudience } from "@/lib/audience";

export interface StarterBundleDefinition {
  id: string;
  name: string;
  prompt: string;
  moderatorPresetId: string;
  memberPresetIds: readonly [string, string, string];
  audience: PresetAudience;
}

export const DEFAULT_COORDINATOR_PRESET_ID = "jose-rodrigues-dos-santos";
export const US_COORDINATOR_PRESET_ID = "anderson-cooper";
const SILLIEST_STARTER_BUNDLE_ID = "ocean-democracy-meltdown";

export const STARTER_BUNDLES: StarterBundleDefinition[] = [
  {
    id: "portugal-housing-war",
    name: "Portugal Housing War",
    prompt: "Should governments criminalize street camping even when housing supply is still broken?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["luis-montenegro", "mariana-mortagua", "andre-ventura"],
    audience: "portugal",
  },
  {
    id: "property-war-portugal",
    name: "Property War Portugal",
    prompt: "Should governments impose hard limits on how many homes one person or fund can own?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "joao-cotrim-de-figueiredo", "henrique-gouveia-e-melo"],
    audience: "portugal",
  },
  {
    id: "security-state-pressure",
    name: "Security State Pressure",
    prompt: "Should governments make DNA databases mandatory for all citizens to solve future crimes?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["henrique-gouveia-e-melo", "andre-ventura", "mariana-mortagua"],
    audience: "portugal",
  },
  {
    id: "gender-identity-flashpoint",
    name: "Gender Identity Flashpoint",
    prompt: "Can men get pregnant?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "andre-ventura", "luis-montenegro"],
    audience: "portugal",
  },
  {
    id: "podcaster-free-speech-war",
    name: "Podcaster Free Speech War",
    prompt: "Should online anonymity be abolished for accounts with more than a million followers?",
    moderatorPresetId: "jon-stewart",
    memberPresetIds: ["alex-jones", "lex-fridman", "joe-rogan"],
    audience: "global",
  },
  {
    id: "ai-liability-meltdown",
    name: "AI Liability Meltdown",
    prompt: "Should AI companies be held criminally liable when their models enable mass fraud or suicide coaching?",
    moderatorPresetId: "fareed-zakaria",
    memberPresetIds: ["elon-musk", "lex-fridman", "rick-sanchez"],
    audience: "global",
  },
  {
    id: "border-prime-time",
    name: "Border Prime Time",
    prompt: "Should rich democracies deport migrants who enter illegally even if they have built families locally?",
    moderatorPresetId: "christiane-amanpour",
    memberPresetIds: ["donald-trump", "joe-rogan", "alex-jones"],
    audience: "global",
  },
  {
    id: "absurdity-welfare-panel",
    name: "Absurdity Welfare Panel",
    prompt: "Should universal basic income replace most targeted welfare programs even if some vulnerable groups lose out?",
    moderatorPresetId: "jon-stewart",
    memberPresetIds: ["homer-simpson", "rick-sanchez", "knight-who-says-ni"],
    audience: "global",
  },
  {
    id: "toilet-paper-emergency",
    name: "Toilet Paper Emergency",
    prompt:
      "Should governments maintain strategic toilet paper reserves for national emergencies, or is that proof civilization has already collapsed?",
    moderatorPresetId: "jon-stewart",
    memberPresetIds: ["cornholio", "homer-simpson", "rick-sanchez"],
    audience: "global",
  },
  {
    id: "ocean-democracy-meltdown",
    name: "Ocean Democracy Meltdown",
    prompt: "Should dolphins get voting rights in coastal cities if they can consistently recognize corrupt politicians?",
    moderatorPresetId: "david-attenborough",
    memberPresetIds: ["rick-sanchez", "homer-simpson", "knight-who-says-ni"],
    audience: "global",
  },
  {
    id: "tourism-overdose-portugal",
    name: "Tourism Overdose Portugal",
    prompt: "Should Lisbon and Porto cap short-term rentals and tourist beds even if that kills investment and nightlife?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["mariana-mortagua", "luis-montenegro", "joao-cotrim-de-figueiredo"],
    audience: "portugal",
  },
  {
    id: "national-service-showdown",
    name: "National Service Showdown",
    prompt: "Should Portugal require one year of mandatory national service for every 18-year-old?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["henrique-gouveia-e-melo", "andre-ventura", "catarina-martins"],
    audience: "portugal",
  },
  {
    id: "retirement-age-riot",
    name: "Retirement Age Riot",
    prompt: "Should Portugal raise the retirement age above 70 to keep the pension system alive?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["luis-marques-mendes", "paulo-raimundo", "antonio-costa"],
    audience: "portugal",
  },
  {
    id: "rail-vs-roads-portugal",
    name: "Rail vs Roads Portugal",
    prompt: "Should Portugal pour billions into free rail and cut airport and highway expansion instead?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["pedro-nuno-santos", "ines-sousa-real", "joao-cotrim-de-figueiredo"],
    audience: "portugal",
  },
  {
    id: "revolving-door-purge",
    name: "Revolving Door Purge",
    prompt:
      "Should Portugal ban former ministers, regulators, and senior judges from taking corporate, lobbying, or prime-time media jobs for 10 years after leaving office?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["ana-gomes", "paulo-portas", "ricardo-costa"],
    audience: "portugal",
  },
  {
    id: "chega-firewall-lab",
    name: "Chega Firewall Lab",
    prompt:
      "Should Portugal's democratic parties refuse any governing deal with Chega even if voters keep producing deadlocked elections and political paralysis?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["rui-tavares", "miguel-morgado", "pacheco-pereira"],
    audience: "portugal",
  },
  {
    id: "austerity-second-coming",
    name: "Austerity Second Coming",
    prompt:
      "If Portugal hits another debt crisis, should it cut public spending fast even if that means lower pensions, weaker services, and years of social anger?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["francisco-louca", "pedro-passos-coelho", "antonio-jose-seguro"],
    audience: "portugal",
  },
  {
    id: "liberal-shock-portugal",
    name: "Liberal Shock Portugal",
    prompt:
      "Should Portugal slash taxes, deregulate labor, and radically shrink bureaucracy in one legislature to break out of permanent stagnation?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["luis-montenegro", "rui-rocha", "mario-amorim-lopes"],
    audience: "portugal",
  },
  {
    id: "prime-time-populism-ban",
    name: "Prime-Time Populism Ban",
    prompt:
      "Should Portuguese television stop booking anti-system populists for prime-time panels even if ratings and online attention collapse?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["joao-miguel-tavares", "pedro-marques-lopes", "daniel-oliveira"],
    audience: "portugal",
  },
  {
    id: "founder-free-speech-backlash",
    name: "Founder Free Speech Backlash",
    prompt:
      "Should consumers and sponsors punish company founders for inflammatory political speech, or is that just censorship by market mob?",
    moderatorPresetId: DEFAULT_COORDINATOR_PRESET_ID,
    memberPresetIds: ["miguel-milhao", "daniel-oliveira", "joao-miguel-tavares"],
    audience: "portugal",
  },
  {
    id: "social-media-age-ban",
    name: "Social Media Age Ban",
    prompt: "Should governments ban social media for everyone under 16 even if parents strongly object?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["dr-phil", "joe-rogan", "eric-cartman"],
    audience: "global",
  },
  {
    id: "office-return-bloodsport",
    name: "Office Return Bloodsport",
    prompt: "Should companies be allowed to fire employees who refuse to return to the office full time?",
    moderatorPresetId: "fareed-zakaria",
    memberPresetIds: ["dwight-schrute", "saul-goodman", "homer-simpson"],
    audience: "global",
  },
  {
    id: "mars-before-earth",
    name: "Mars Before Earth",
    prompt: "Should governments subsidize Mars colonies before they have fixed homelessness, hospitals, and schools on Earth?",
    moderatorPresetId: "david-attenborough",
    memberPresetIds: ["elon-musk", "rick-sanchez", "mariana-mortagua"],
    audience: "portugal",
  },
  {
    id: "deepfake-defamation-war",
    name: "Deepfake Defamation War",
    prompt: "Should publishing AI deepfakes of real people carry criminal penalties even when the creator claims it was satire?",
    moderatorPresetId: US_COORDINATOR_PRESET_ID,
    memberPresetIds: ["saul-goodman", "elon-musk", "alex-jones"],
    audience: "global",
  },
  {
    id: "meat-tax-firestorm",
    name: "Meat Tax Firestorm",
    prompt: "Should governments heavily tax meat and dairy to hit climate goals faster?",
    moderatorPresetId: "david-attenborough",
    memberPresetIds: ["ines-sousa-real", "gordon-ramsay", "joe-rogan"],
    audience: "portugal",
  },
  {
    id: "college-scam-tribunal",
    name: "College Scam Tribunal",
    prompt: "Is college now a luxury-status scam that most young people should skip?",
    moderatorPresetId: "tucker-carlson",
    memberPresetIds: ["joe-rogan", "lex-fridman", "saul-goodman"],
    audience: "global",
  },
  {
    id: "war-peace-reckoning",
    name: "War Peace Reckoning",
    prompt: "Should democracies accept an ugly negotiated peace with an invading power if the alternative is years more war and mass death?",
    moderatorPresetId: "christiane-amanpour",
    memberPresetIds: ["donald-trump", "mariana-mortagua", "henrique-gouveia-e-melo"],
    audience: "global",
  },
  {
    id: "rewilding-last-exit",
    name: "Rewilding Last Exit",
    prompt: "Should rich countries force people and industry out of fragile ecosystems to restore biodiversity, even at major economic cost?",
    moderatorPresetId: "david-attenborough",
    memberPresetIds: ["ines-sousa-real", "gordon-ramsay", "elon-musk"],
    audience: "global",
  },
  {
    id: "corruption-comedy-court",
    name: "Corruption Comedy Court",
    prompt: "Should politicians be banned from trading stocks, taking lobbying jobs, and cashing in on media fame for five years after leaving office?",
    moderatorPresetId: "jon-stewart",
    memberPresetIds: ["saul-goodman", "donald-trump", "alex-jones"],
    audience: "global",
  },
  {
    id: "china-dependency-trap",
    name: "China Dependency Trap",
    prompt: "Should democracies accept higher prices and slower growth to break their dependence on Chinese manufacturing and strategic supply chains?",
    moderatorPresetId: "fareed-zakaria",
    memberPresetIds: ["elon-musk", "joao-cotrim-de-figueiredo", "mariana-mortagua"],
    audience: "global",
  },
  {
    id: "elite-trust-collapse",
    name: "Elite Trust Collapse",
    prompt: "Should public institutions lose funding if they are seen as politically biased by a large share of the population, even if experts defend their standards?",
    moderatorPresetId: "tucker-carlson",
    memberPresetIds: ["joe-rogan", "alex-jones", "luis-marques-mendes"],
    audience: "global",
  },
  {
    id: "robot-cop-circus",
    name: "Robot Cop Circus",
    prompt:
      "Should democracies replace most police patrols and border screening with autonomous machines if they are cheaper, less corruptible, and more obedient than humans?",
    moderatorPresetId: "jon-stewart",
    memberPresetIds: ["t-800", "borat", "saul-goodman"],
    audience: "global",
  },
];

export const STARTER_BUNDLE_ALIAS_MAP = new Map<string, string>([
  ["silliest", SILLIEST_STARTER_BUNDLE_ID],
]);
