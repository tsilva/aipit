import { describe, expect, it } from "vitest";
import {
  hasAnalyticsPermission,
  requiresAnalyticsConsent,
} from "@/lib/analytics-consent";

describe("analytics consent helpers", () => {
  it("requires analytics consent for EU country codes", () => {
    expect(requiresAnalyticsConsent("PT")).toBe(true);
    expect(requiresAnalyticsConsent("de")).toBe(true);
  });

  it("does not require analytics consent for non-EU country codes", () => {
    expect(requiresAnalyticsConsent("US")).toBe(false);
    expect(requiresAnalyticsConsent("BR")).toBe(false);
  });

  it("defaults unknown country codes to requiring consent", () => {
    expect(requiresAnalyticsConsent()).toBe(true);
    expect(requiresAnalyticsConsent("")).toBe(true);
    expect(requiresAnalyticsConsent("unknown")).toBe(true);
  });

  it("always allows analytics after explicit grant", () => {
    expect(hasAnalyticsPermission({ consent: "granted", requireConsent: true })).toBe(true);
    expect(hasAnalyticsPermission({ consent: "granted", requireConsent: false })).toBe(true);
  });

  it("always blocks analytics after explicit denial", () => {
    expect(hasAnalyticsPermission({ consent: "denied", requireConsent: true })).toBe(false);
    expect(hasAnalyticsPermission({ consent: "denied", requireConsent: false })).toBe(false);
  });

  it("treats unset consent as allowed only when consent is not required", () => {
    expect(hasAnalyticsPermission({ consent: "unset", requireConsent: true })).toBe(false);
    expect(hasAnalyticsPermission({ consent: "unset", requireConsent: false })).toBe(true);
  });
});
