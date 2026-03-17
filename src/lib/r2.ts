import { createHash, createHmac } from "node:crypto";

type R2Config = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectPrefix: string;
};

export class R2StorageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "R2StorageError";
    this.status = status;
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeObjectPrefix(value: string | undefined): string {
  const trimmed = normalizeOptional(value);

  if (!trimmed) {
    return "shares/";
  }

  const normalized = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");

  return normalized ? `${normalized}/` : "";
}

function resolveR2Config(source: Record<string, string | undefined> = process.env): R2Config {
  const accountId = normalizeOptional(source.R2_ACCOUNT_ID);
  const bucketName = normalizeOptional(source.R2_BUCKET_NAME);
  const accessKeyId = normalizeOptional(source.R2_ACCESS_KEY_ID);
  const secretAccessKey = normalizeOptional(source.R2_SECRET_ACCESS_KEY);

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    throw new R2StorageError("Cloudflare R2 storage is not configured.", 503);
  }

  return {
    accountId,
    bucketName,
    accessKeyId,
    secretAccessKey,
    objectPrefix: normalizeObjectPrefix(source.R2_OBJECT_PREFIX),
  };
}

function hashSha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function encodeUriPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function formatAmzDate(date: Date): { amzDate: string; shortDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    shortDate: iso.slice(0, 8),
  };
}

function buildSignedHeaders(headers: Record<string, string>): {
  canonicalHeaders: string;
  signedHeaders: string;
} {
  const headerEntries = Object.entries(headers).sort(([left], [right]) => left.localeCompare(right));

  return {
    canonicalHeaders: headerEntries.map(([name, value]) => `${name}:${value.trim()}\n`).join(""),
    signedHeaders: headerEntries.map(([name]) => name).join(";"),
  };
}

function buildAuthorizationHeader({
  method,
  url,
  payloadHash,
  accessKeyId,
  secretAccessKey,
  contentType,
  now,
}: {
  method: "GET" | "PUT";
  url: URL;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType?: string;
  now: Date;
}): Record<string, string> {
  const { amzDate, shortDate } = formatAmzDate(now);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (contentType) {
    headers["content-type"] = contentType;
  }

  const { canonicalHeaders, signedHeaders } = buildSignedHeaders(headers);
  const credentialScope = `${shortDate}/auto/s3/aws4_request`;
  const canonicalRequest = [
    method,
    encodeUriPath(url.pathname),
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashSha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmacSha256(
    hmacSha256(hmacSha256(hmacSha256(`AWS4${secretAccessKey}`, shortDate), "auto"), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function buildObjectUrl(config: R2Config, key: string): URL {
  const normalizedKey = key.replace(/^\/+/, "");
  return new URL(`/${config.bucketName}/${normalizedKey}`, `https://${config.accountId}.r2.cloudflarestorage.com`);
}

export async function putR2Object({
  key,
  body,
  contentType,
  signal,
}: {
  key: string;
  body: string;
  contentType: string;
  signal?: AbortSignal;
}): Promise<void> {
  const config = resolveR2Config();
  const url = buildObjectUrl(config, key);
  const headers = buildAuthorizationHeader({
    method: "PUT",
    url,
    payloadHash: hashSha256Hex(body),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    contentType,
    now: new Date(),
  });

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body,
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new R2StorageError("Failed to write the shared conversation to Cloudflare R2.", 502);
  }
}

export async function getR2ObjectText({
  key,
  signal,
}: {
  key: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const config = resolveR2Config();
  const url = buildObjectUrl(config, key);
  const emptyPayloadHash = hashSha256Hex("");
  const headers = buildAuthorizationHeader({
    method: "GET",
    url,
    payloadHash: emptyPayloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    now: new Date(),
  });

  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new R2StorageError("Failed to read the shared conversation from Cloudflare R2.", 502);
  }

  return response.text();
}

export function buildR2ObjectKey(slug: string): string {
  const config = resolveR2Config();
  return `${config.objectPrefix}${slug}.json`;
}
