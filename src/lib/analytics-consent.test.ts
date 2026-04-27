import { describe, expect, it } from "vitest";
import {
  hasAnalyticsPermission,
  requiresAnalyticsConsent,
} from "@/lib/analytics-consent";
import {
  hasTelemetryPermissionForHeaders,
  readTelemetryConsentFromHeaders,
  readTelemetryConsentRequirementFromHeaders,
} from "@/lib/telemetry-consent";

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
