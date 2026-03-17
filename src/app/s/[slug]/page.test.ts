import { describe, expect, it, vi } from "vitest";
import { createCompletedShareFixture } from "@/lib/share-test-fixture";
import { createSharedConversationSnapshot } from "@/lib/share-snapshot";

const { readSharedConversationSnapshot, notFound, redirect } = vi.hoisted(() => ({
  readSharedConversationSnapshot: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("next/navigation", () => ({
  notFound,
  redirect,
}));

vi.mock("@/lib/share-storage", () => ({
  createShareUrl: (slug: string) => `https://aipit.example/s/${slug}`,
  readSharedConversationSnapshot,
}));

vi.mock("@/components/pit-studio-entry", () => ({
  PitStudioEntry: () => null,
}));

import SharedReplayPage from "@/app/s/[slug]/page";

describe("/s/[slug]", () => {
  it("loads a valid shared replay into read-only simulation mode", async () => {
    const { input, result } = createCompletedShareFixture();
    readSharedConversationSnapshot.mockResolvedValue({
      status: "ok",
      snapshot: createSharedConversationSnapshot({ input, result }),
    });

    const page = await SharedReplayPage({
      params: Promise.resolve({ slug: "mock-share-1" }),
    });

    expect((page as { props: { initialState: { isReplayOnly: boolean; initialStudioView: string } } }).props.initialState.isReplayOnly).toBe(true);
    expect((page as { props: { initialState: { isReplayOnly: boolean; initialStudioView: string } } }).props.initialState.initialStudioView).toBe("simulation");
  });

  it("redirects unsupported shared snapshots back home", async () => {
    readSharedConversationSnapshot.mockResolvedValue({ status: "unsupported" });

    await expect(
      SharedReplayPage({
        params: Promise.resolve({ slug: "mock-share-1" }),
      }),
    ).rejects.toThrow("REDIRECT:/?share=unsupported");
  });

  it("returns not found for missing snapshots", async () => {
    readSharedConversationSnapshot.mockResolvedValue({ status: "missing" });

    await expect(
      SharedReplayPage({
        params: Promise.resolve({ slug: "mock-share-1" }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
