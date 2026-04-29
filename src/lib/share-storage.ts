import { randomBytes } from "node:crypto";
import { getR2ObjectText, putR2Object, R2StorageError, buildR2ObjectKey } from "@/lib/r2";
import {
  createSharedConversationSnapshot,
  parseSharedConversationSnapshot,
  SharedConversationSnapshotError,
  type SharedConversationSnapshot,
} from "@/lib/share-snapshot";
import type { ShareCreationResponse } from "@/lib/share-response";
import { SITE_URL } from "@/lib/site";

const SHARE_SLUG_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export class ShareStorageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ShareStorageError";
    this.status = status;
  }
}

export type ReadSharedConversationSnapshotResult =
  | { status: "ok"; snapshot: SharedConversationSnapshot }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "unsupported" };

function generateShareSlug(): string {
  return randomBytes(9).toString("base64url");
}

export function createShareUrl(slug: string): string {
  return new URL(`/s/${slug}`, SITE_URL).toString();
}

export async function writeSharedConversationSnapshot({
  input,
  result,
  signal,
}: {
  input: unknown;
  result: unknown;
  signal?: AbortSignal;
}): Promise<ShareCreationResponse> {
  let snapshot: SharedConversationSnapshot;

  try {
    snapshot = createSharedConversationSnapshot({ input, result });
  } catch (error) {
    if (error instanceof SharedConversationSnapshotError) {
      throw new ShareStorageError(error.message, 400);
    }

    throw error;
  }

  const slug = generateShareSlug();

  try {
    await putR2Object({
      key: buildR2ObjectKey(slug),
      body: JSON.stringify(snapshot),
      contentType: "application/json; charset=utf-8",
      signal,
    });
  } catch (error) {
    if (error instanceof R2StorageError) {
      throw new ShareStorageError(error.message, error.status);
    }

    throw error;
  }

  return { slug, url: createShareUrl(slug) };
}

export async function readSharedConversationSnapshot(
  slug: string,
  signal?: AbortSignal,
): Promise<ReadSharedConversationSnapshotResult> {
  if (!SHARE_SLUG_PATTERN.test(slug)) {
    return { status: "missing" };
  }

  let payloadText: string | null;

  try {
    payloadText = await getR2ObjectText({
      key: buildR2ObjectKey(slug),
      signal,
    });
  } catch (error) {
    if (error instanceof R2StorageError) {
      throw new ShareStorageError(error.message, error.status);
    }

    throw error;
  }

  if (payloadText === null) {
    return { status: "missing" };
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(payloadText);
  } catch {
    return { status: "invalid" };
  }

  try {
    return {
      status: "ok",
      snapshot: parseSharedConversationSnapshot(parsedPayload),
    };
  } catch (error) {
    if (error instanceof SharedConversationSnapshotError) {
      return { status: error.reason === "unsupported_version" ? "unsupported" : "invalid" };
    }

    throw error;
  }
}
