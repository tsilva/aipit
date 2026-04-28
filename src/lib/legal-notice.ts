export const LEGAL_TERMS_EFFECTIVE_DATE = "2026-04-28";
export const LEGAL_PRIVACY_EFFECTIVE_DATE = "2026-04-28";

export const AI_SIMULATION_NOTICE_TITLE = "AI simulation notice";

export const AI_SIMULATION_DISCLOSURE_TEXT =
  "The AI Pit generates fictional AI debate simulations. Outputs are not real quotes, endorsements, beliefs, statements, or official communications from any person, character, brand, organization, rights holder, or estate.";

export const AI_SIMULATION_MISUSE_NOTICE_TEXT =
  "Do not use outputs to deceive, impersonate, harass, defame, infringe rights, expose private or confidential information, or make legal, medical, financial, employment, compliance, or other high-stakes decisions.";

export const AI_SIMULATION_PROCESSING_NOTICE_TEXT =
  "Prompts and outputs may be processed by OpenRouter, model providers, hosting, security, telemetry, and replay storage services as described in Terms & Privacy. Public replay links are unlisted, not private.";

export const AI_SIMULATION_ACCEPTANCE_TEXT = "By continuing, you agree to the Terms and Privacy Policy.";

export const SIMULATION_NOTICE_TEXT =
  "AI simulation experiment. Generated content is fictionalized and is not a real quote, endorsement, belief, statement, or official communication from anyone depicted or referenced.";

export const PUBLIC_REPLAY_VISIBILITY_NOTICE_TEXT =
  "Public replay links are unlisted, not private. Anyone with the URL can view the debate prompt, character configuration, generated output, and related replay data.";

export const PUBLIC_REPLAY_MISUSE_NOTICE_TEXT =
  "By creating the link, you confirm you will not use the replay for unlawful, infringing, defamatory, deceptive, harassing, private, confidential, sensitive, or otherwise harmful purposes.";

export const LEGAL_ACKNOWLEDGEMENT_PAYLOAD = [
  LEGAL_TERMS_EFFECTIVE_DATE,
  LEGAL_PRIVACY_EFFECTIVE_DATE,
  AI_SIMULATION_DISCLOSURE_TEXT,
  AI_SIMULATION_MISUSE_NOTICE_TEXT,
  AI_SIMULATION_PROCESSING_NOTICE_TEXT,
  AI_SIMULATION_ACCEPTANCE_TEXT,
  PUBLIC_REPLAY_VISIBILITY_NOTICE_TEXT,
  PUBLIC_REPLAY_MISUSE_NOTICE_TEXT,
].join("\n");

function hashLegalAcknowledgementPayload(payload: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `legal-notice-${(hash >>> 0).toString(36)}`;
}

export const LEGAL_ACKNOWLEDGEMENT_TOKEN = hashLegalAcknowledgementPayload(LEGAL_ACKNOWLEDGEMENT_PAYLOAD);
