export type ShareCreationResponse = {
  slug: string;
  url: string;
};

export function isShareCreationResponse(value: unknown): value is ShareCreationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).every((key) => key === "slug" || key === "url") &&
    typeof (value as { slug?: unknown }).slug === "string" &&
    typeof (value as { url?: unknown }).url === "string"
  );
}
