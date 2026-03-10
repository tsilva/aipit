export interface ParticipantPersonaProfile {
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
}

type LegacySectionLabel =
  | "Core worldview"
  | "Temperament"
  | "Debate style"
  | "Debate habits"
  | "Speech pattern";

const LEGACY_SECTION_PATTERN = /\b(Core worldview|Temperament|Debate style|Debate habits|Speech pattern):/g;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolvePersonaLanguage(profile: ParticipantPersonaProfile): string {
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

function extractLegacyLanguage(text: string): { language: string; remainder: string; matched: boolean } {
  const match = text.match(/^(Speak(?:\s+\w+)*\s+in|Use)\s+([^.]+)\.\s*/i);

  if (!match) {
    return { language: "", remainder: text, matched: false };
  }

  return {
    language: match[2].trim(),
    remainder: text.slice(match[0].length).trim(),
    matched: true,
  };
}

function parseLegacySections(text: string): {
  leading: string;
  perspective: string;
  temperament: string;
  debateStyle: string;
  speechStyle: string;
} {
  const matches = Array.from(text.matchAll(LEGACY_SECTION_PATTERN));

  if (matches.length === 0) {
    return {
      leading: text.trim(),
      perspective: "",
      temperament: "",
      debateStyle: "",
      speechStyle: "",
    };
  }

  let perspective = "";
  let temperament = "";
  let debateStyle = "";
  let speechStyle = "";

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const label = match[1] as LegacySectionLabel;
    const sectionStart = (match.index ?? 0) + match[0].length;
    const sectionEnd = nextMatch?.index ?? text.length;
    const content = text.slice(sectionStart, sectionEnd).trim();

    if (!content) {
      continue;
    }

    if (label === "Core worldview") {
      perspective = content;
      continue;
    }

    if (label === "Temperament") {
      temperament = content;
      continue;
    }

    if (label === "Debate style" || label === "Debate habits") {
      debateStyle = content;
      continue;
    }

    speechStyle = content;
  }

  return {
    leading: text.slice(0, matches[0]?.index ?? 0).trim(),
    perspective,
    temperament,
    debateStyle,
    speechStyle,
  };
}

function migrateLegacyPromptNotes(profile: ParticipantPersonaProfile): ParticipantPersonaProfile {
  const originalNotes = profile.promptNotes;

  if (!originalNotes) {
    return profile;
  }

  let working = originalNotes.trim();
  let migrated = false;

  if (/^Emulate\b/i.test(working)) {
    working = working.replace(/^Emulate\b[\s\S]*?\.\s*/, "");
    migrated = true;
  }

  const extractedLanguage = extractLegacyLanguage(working);
  if (extractedLanguage.matched) {
    working = extractedLanguage.remainder;
    migrated = true;
  }

  let guardrails = "";
  const avoidMatch = working.match(/(?:^|\s)(Avoid\b[\s\S]*)$/i);
  if (avoidMatch) {
    guardrails = avoidMatch[1].replace(/^Avoid\s+/i, "").trim();
    working = working.slice(0, avoidMatch.index ?? 0).trim();
    migrated = true;
  }

  const sections = parseLegacySections(working);
  if (sections.perspective || sections.temperament || sections.debateStyle || sections.speechStyle) {
    migrated = true;
  }

  if (!migrated) {
    return profile;
  }

  const leftoverNotes =
    sections.leading && sections.leading !== sections.perspective ? sections.leading : "";

  return {
    ...profile,
    language: profile.language || extractedLanguage.language,
    perspective: profile.perspective || sections.perspective || sections.leading,
    temperament: profile.temperament || sections.temperament,
    debateStyle: profile.debateStyle || sections.debateStyle,
    speechStyle: profile.speechStyle || sections.speechStyle,
    guardrails: profile.guardrails || guardrails,
    promptNotes: leftoverNotes,
  };
}

export function createPersonaProfile(
  overrides: Partial<ParticipantPersonaProfile> = {},
): ParticipantPersonaProfile {
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
    ...overrides,
  };
}

export function clonePersonaProfile(profile: ParticipantPersonaProfile): ParticipantPersonaProfile {
  return { ...profile };
}

export function normalizePersonaProfile(
  value: unknown,
  fallbackPromptNotes = "",
): ParticipantPersonaProfile {
  const raw = (value ?? {}) as Record<string, unknown>;

  return migrateLegacyPromptNotes(
    createPersonaProfile({
      role: normalizeText(raw.role),
      personality: normalizeText(raw.personality),
      perspective: normalizeText(raw.perspective),
      temperament: normalizeText(raw.temperament),
      debateStyle: normalizeText(raw.debateStyle),
      speechStyle: normalizeText(raw.speechStyle),
      guardrails: normalizeText(raw.guardrails),
      language: normalizeText(raw.language),
      gender: normalizeText(raw.gender),
      nationality: normalizeText(raw.nationality),
      birthDate: normalizeText(raw.birthDate),
      promptNotes: normalizeText(raw.promptNotes) || fallbackPromptNotes,
    }),
  );
}

export function hasPersonaProfileContent(profile: ParticipantPersonaProfile): boolean {
  return Object.values(profile).some((value) => value.trim().length > 0);
}

export function buildPersonaProfilePrompt(profile: ParticipantPersonaProfile): string {
  const lines = [
    profile.role ? `Role: ${profile.role}` : "",
    profile.personality ? `Personality: ${profile.personality}` : "",
    profile.perspective ? `Perspective: ${profile.perspective}` : "",
    profile.temperament ? `Temperament: ${profile.temperament}` : "",
    profile.debateStyle ? `Debate style: ${profile.debateStyle}` : "",
    profile.speechStyle ? `Speech style: ${profile.speechStyle}` : "",
    profile.guardrails ? `Guardrails: ${profile.guardrails}` : "",
    profile.nationality ? `Nationality: ${profile.nationality}` : "",
    profile.gender ? `Gender: ${profile.gender}` : "",
    profile.birthDate ? `Birth date: ${profile.birthDate}` : "",
    profile.promptNotes ? `Additional guidance: ${profile.promptNotes}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildCompactPersonaPrompt(profile: ParticipantPersonaProfile): string {
  const characterParts = [profile.personality, profile.temperament].filter(Boolean);
  const styleParts = [profile.debateStyle, profile.speechStyle].filter(Boolean);
  const populatedFields = [
    profile.role,
    profile.personality,
    profile.perspective,
    profile.temperament,
    profile.debateStyle,
    profile.speechStyle,
    profile.guardrails,
  ].filter(Boolean).length;

  const lines = [
    profile.role ? `Role: ${profile.role}` : "",
    characterParts.length > 0 ? `Character: ${characterParts.join("; ")}` : "",
    profile.perspective ? `Perspective: ${profile.perspective}` : "",
    styleParts.length > 0 ? `Style: ${styleParts.join("; ")}` : "",
    profile.guardrails ? `Guardrails: ${profile.guardrails}` : "",
    profile.promptNotes && populatedFields < 3 ? `Additional guidance: ${profile.promptNotes}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildPersonaLanguageDirective(profile: ParticipantPersonaProfile): string {
  const language = resolvePersonaLanguage(profile);

  if (!language) {
    return "";
  }

  return `Speak only in ${language}. Translators handle mutual understanding; never switch languages.`;
}

export function buildPersonaProfileSummary(profile: ParticipantPersonaProfile): string {
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

export function buildPersonaProfilePreview(profile: ParticipantPersonaProfile): string {
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
