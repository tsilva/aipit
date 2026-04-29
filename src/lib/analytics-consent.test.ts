import { describe, expect, it } from "vitest";
import {
  hasTelemetryPermission,
  hasTelemetryPermissionForHeaders,
  readTelemetryConsentFromHeaders,
  readTelemetryConsentRequirementFromHeaders,
  requiresTelemetryConsent,
} from "@/lib/telemetry-consent";

describe("telemetry consent helpers", () => {
  it("requires analytics consent for EU country codes", () => {
    expect(requiresTelemetryConsent("PT")).toBe(true);
    expect(requiresTelemetryConsent("de")).toBe(true);
  });

  it("does not require analytics consent for non-EU country codes", () => {
    expect(requiresTelemetryConsent("US")).toBe(false);
    expect(requiresTelemetryConsent("BR")).toBe(false);
  });

  it("defaults unknown country codes to requiring consent", () => {
    expect(requiresTelemetryConsent()).toBe(true);
    expect(requiresTelemetryConsent("")).toBe(true);
    expect(requiresTelemetryConsent("unknown")).toBe(true);
  });

  it("always allows analytics after explicit grant", () => {
    expect(hasTelemetryPermission({ consent: "granted", requireConsent: true })).toBe(true);
    expect(hasTelemetryPermission({ consent: "granted", requireConsent: false })).toBe(true);
  });

  it("always blocks analytics after explicit denial", () => {
    expect(hasTelemetryPermission({ consent: "denied", requireConsent: true })).toBe(false);
    expect(hasTelemetryPermission({ consent: "denied", requireConsent: false })).toBe(false);
  });

  it("treats unset consent as allowed only when consent is not required", () => {
    expect(hasTelemetryPermission({ consent: "unset", requireConsent: true })).toBe(false);
    expect(hasTelemetryPermission({ consent: "unset", requireConsent: false })).toBe(true);
  });

  it("reads explicit telemetry choices from request cookies", () => {
    const headers = {
      cookie: "aipit-analytics-consent=denied; aipit-error-reporting-consent=granted; aipit-country=PT",
    };

    expect(readTelemetryConsentFromHeaders("analytics", headers)).toBe("denied");
    expect(readTelemetryConsentFromHeaders("errorReporting", headers)).toBe("granted");
    expect(hasTelemetryPermissionForHeaders("analytics", headers)).toBe(false);
    expect(hasTelemetryPermissionForHeaders("errorReporting", headers)).toBe(true);
  });

  it("uses request country headers for server-side telemetry defaults", () => {
    expect(readTelemetryConsentRequirementFromHeaders({ "x-vercel-ip-country": "US" })).toBe(false);
    expect(hasTelemetryPermissionForHeaders("errorReporting", { "x-vercel-ip-country": "US" })).toBe(true);
    expect(readTelemetryConsentRequirementFromHeaders({ "x-vercel-ip-country": "PT" })).toBe(true);
    expect(hasTelemetryPermissionForHeaders("errorReporting", { "x-vercel-ip-country": "PT" })).toBe(false);
  });
});
