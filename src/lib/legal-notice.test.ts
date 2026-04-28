import { describe, expect, it } from "vitest";
import {
  AI_SIMULATION_DISCLOSURE_TEXT,
  LEGAL_ACKNOWLEDGEMENT_PAYLOAD,
  LEGAL_ACKNOWLEDGEMENT_TOKEN,
  PUBLIC_REPLAY_VISIBILITY_NOTICE_TEXT,
} from "@/lib/legal-notice";
import { SIMULATION_ACKNOWLEDGEMENT_VALUE } from "@/lib/simulation-acknowledgement";

describe("legal notice acknowledgement", () => {
  it("uses a content-derived acknowledgement token instead of the legacy static value", () => {
    expect(LEGAL_ACKNOWLEDGEMENT_PAYLOAD).toContain(AI_SIMULATION_DISCLOSURE_TEXT);
    expect(LEGAL_ACKNOWLEDGEMENT_PAYLOAD).toContain(PUBLIC_REPLAY_VISIBILITY_NOTICE_TEXT);
    expect(LEGAL_ACKNOWLEDGEMENT_TOKEN).toMatch(/^legal-notice-[a-z0-9]+$/);
    expect(LEGAL_ACKNOWLEDGEMENT_TOKEN).not.toBe("acknowledged");
    expect(SIMULATION_ACKNOWLEDGEMENT_VALUE).toBe(LEGAL_ACKNOWLEDGEMENT_TOKEN);
  });
});
