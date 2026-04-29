import { describe, expect, it } from "vitest";
import { isShareCreationResponse } from "@/lib/share-response";

describe("share response contract", () => {
  it("accepts only successful share creation payloads", () => {
    expect(isShareCreationResponse({ slug: "abc123", url: "https://aipit.example/s/abc123" })).toBe(true);
    expect(isShareCreationResponse({ slug: "abc123" })).toBe(false);
    expect(isShareCreationResponse({ url: "https://aipit.example/s/abc123" })).toBe(false);
    expect(isShareCreationResponse({ slug: "abc123", url: "https://aipit.example/s/abc123", error: {} })).toBe(false);
    expect(isShareCreationResponse(null)).toBe(false);
  });
});
