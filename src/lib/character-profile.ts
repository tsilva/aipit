export interface CharacterVoiceProfile {
  cadence: string;
  syntax: string;
  rhetoricalMoves: string;
  disfluencies: string;
  segueStyle: string;
  lexicalHabits: string;
  forbiddenCleanups: string;
  relevanceFloor: string;
}

export interface ParticipantCharacterProfile {
  role: string;
  personality: string;
  perspective: string;
  temperament: string;
  debateStyle: string;
  speechStyle: string;
  guardrails: string;
  language: string;
  gender: string;
  nationality: string;
  birthDate: string;
  promptNotes: string;
  voiceProfile: CharacterVoiceProfile;
}

type ParticipantCharacterProfileOverrides = Omit<Partial<ParticipantCharacterProfile>, "voiceProfile"> & {
  voiceProfile?: Partial<CharacterVoiceProfile>;
};

export function createVoiceProfile(overrides: Partial<CharacterVoiceProfile> = {}): CharacterVoiceProfile {
  return {
    cadence: "",
    syntax: "",
    rhetoricalMoves: "",
    disfluencies: "",
    segueStyle: "",
    lexicalHabits: "",
    forbiddenCleanups: "",
    relevanceFloor: "",
    ...overrides,
  };
}

function resolveCharacterLanguage(profile: ParticipantCharacterProfile): string {
  if (profile.language) {
    const primaryLanguage = profile.language
      .split(/[;,/]/)[0]
      ?.replace(/\s+first\b.*$/i, "")
      .replace(/\s+(?:when|if|for)\b.*$/i, "")
      .trim();

    if (primaryLanguage) {
      return primaryLanguage;
    }
  }

  if (/^portuguese$/i.test(profile.nationality)) {
    return "European Portuguese";
  }

  return "";
}
export function createCharacterProfile(
  overrides: ParticipantCharacterProfileOverrides = {},
): ParticipantCharacterProfile {
  const { voiceProfile, ...profileOverrides } = overrides;

  return {
    role: "",
    personality: "",
    perspective: "",
    temperament: "",
    debateStyle: "",
    speechStyle: "",
    guardrails: "",
    language: "",
    gender: "",
    nationality: "",
    birthDate: "",
    promptNotes: "",
    ...profileOverrides,
    voiceProfile: createVoiceProfile(voiceProfile),
  };
}

export function cloneCharacterProfile(profile: ParticipantCharacterProfile): ParticipantCharacterProfile {
  return createCharacterProfile(profile);
}

export function buildCompactCharacterPrompt(profile: ParticipantCharacterProfile): string {
  const characterParts = [profile.personality, profile.temperament].filter(Boolean);
  const styleParts = [profile.debateStyle, profile.speechStyle].filter(Boolean);

  const lines = [
    profile.role ? `Role: ${profile.role}` : "",
    characterParts.length > 0 ? `Character: ${characterParts.join("; ")}` : "",
    profile.perspective ? `Perspective: ${profile.perspective}` : "",
    styleParts.length > 0 ? `Style: ${styleParts.join("; ")}` : "",
    profile.guardrails ? `Guardrails: ${profile.guardrails}` : "",
    profile.promptNotes ? `Additional guidance: ${profile.promptNotes}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildCharacterVoiceProfilePrompt(profile: ParticipantCharacterProfile): string {
  const voiceProfile = createVoiceProfile(profile.voiceProfile);
  const lines = [
    voiceProfile.cadence ? `Cadence: ${voiceProfile.cadence}` : "",
    voiceProfile.syntax ? `Syntax: ${voiceProfile.syntax}` : "",
    voiceProfile.rhetoricalMoves ? `Rhetorical moves: ${voiceProfile.rhetoricalMoves}` : "",
    voiceProfile.disfluencies ? `Disfluencies: ${voiceProfile.disfluencies}` : "",
    voiceProfile.segueStyle ? `Segues: ${voiceProfile.segueStyle}` : "",
    voiceProfile.lexicalHabits ? `Lexical habits: ${voiceProfile.lexicalHabits}` : "",
    voiceProfile.forbiddenCleanups ? `Forbidden cleanups: ${voiceProfile.forbiddenCleanups}` : "",
    voiceProfile.relevanceFloor ? `Relevance floor: ${voiceProfile.relevanceFloor}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildCharacterLanguageDirective(profile: ParticipantCharacterProfile): string {
  const language = resolveCharacterLanguage(profile);

  if (!language) {
    return "";
  }

  return `Speak only in ${language}. Translators handle mutual understanding; never switch languages.`;
}

export function buildCharacterProfileSummary(profile: ParticipantCharacterProfile): string {
  const parts = [
    profile.role,
    profile.personality,
    profile.language,
    profile.gender,
    profile.nationality,
    profile.birthDate ? `Born ${profile.birthDate}` : "",
  ].filter(Boolean);

  return parts.join(" • ");
}

export function buildCharacterProfilePreview(profile: ParticipantCharacterProfile): string {
  const parts = [
    profile.role,
    profile.personality,
    profile.language,
    profile.nationality,
    profile.birthDate ? `Born ${profile.birthDate}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  return profile.perspective || profile.promptNotes;
}
