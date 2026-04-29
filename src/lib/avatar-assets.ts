import { AVATAR_ASSET_VERSIONS, type AvatarAssetPath } from "@/lib/avatar-asset-versions";

const LOCAL_AVATAR_ORIGIN = "https://aipit.local";

function isLocalPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

function isAvatarAssetPath(pathname: string): pathname is AvatarAssetPath {
  return Object.prototype.hasOwnProperty.call(AVATAR_ASSET_VERSIONS, pathname);
}

export function getAvatarAssetVersion(url: string): string | undefined {
  if (!isLocalPath(url)) {
    return undefined;
  }

  const parsedUrl = new URL(url, LOCAL_AVATAR_ORIGIN);

  return isAvatarAssetPath(parsedUrl.pathname) ? AVATAR_ASSET_VERSIONS[parsedUrl.pathname] : undefined;
}

export function withAvatarAssetVersion(url: string | undefined): string | undefined {
  const normalizedUrl = url?.trim();

  if (!normalizedUrl || !isLocalPath(normalizedUrl)) {
    return normalizedUrl;
  }

  const parsedUrl = new URL(normalizedUrl, LOCAL_AVATAR_ORIGIN);
  const version = isAvatarAssetPath(parsedUrl.pathname) ? AVATAR_ASSET_VERSIONS[parsedUrl.pathname] : undefined;

  if (!version) {
    return normalizedUrl;
  }

  parsedUrl.searchParams.delete("v");
  parsedUrl.searchParams.append("v", version);

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}
