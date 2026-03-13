function fallbackRequestId(): string {
  return `req-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveRequestId(request: Request): string {
  const forwardedRequestId = request.headers.get("x-request-id")?.trim();

  if (forwardedRequestId) {
    return forwardedRequestId;
  }

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return fallbackRequestId();
}

export function buildResponseHeaders(
  requestId: string,
  headers: HeadersInit = {},
): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("X-Request-Id", requestId);
  return nextHeaders;
}
