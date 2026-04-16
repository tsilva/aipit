import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AVATAR_ASSET_VERSIONS } from "@/lib/avatar-asset-versions";
import { getAvatarAssetVersion, withAvatarAssetVersion } from "@/lib/avatar-assets";

const cacheBustedExtensions = new Set([".mp4", ".webp"]);

function listAvatarAssets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) {
      return [];
    }

    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listAvatarAssets(filePath);
    }

    return entry.isFile() && cacheBustedExtensions.has(path.extname(entry.name)) ? [filePath] : [];
  });
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex").slice(0, 16);
}

describe("avatar asset cache busting", () => {
  it("appends content-hash versions only to known local avatar assets", () => {
    expect(withAvatarAssetVersion("/avatars/presets/anderson-cooper.webp")).toMatch(
      /^\/avatars\/presets\/anderson-cooper\.webp\?v=[a-f0-9]{16}$/,
    );
    expect(withAvatarAssetVersion(" /avatars/presets/anderson-cooper.webp?size=small#face ")).toMatch(
      /^\/avatars\/presets\/anderson-cooper\.webp\?size=small&v=[a-f0-9]{16}#face$/,
    );
    expect(withAvatarAssetVersion("https://example.com/avatar.webp")).toBe("https://example.com/avatar.webp");
    expect(withAvatarAssetVersion("/uploads/custom-avatar.webp")).toBe("/uploads/custom-avatar.webp");
    expect(withAvatarAssetVersion(undefined)).toBeUndefined();
  });

  it("has a current content hash for every public avatar media asset", () => {
    const repoRoot = process.cwd();
    const publicRoot = path.join(repoRoot, "public");
    const avatarRoot = path.join(publicRoot, "avatars");
    const assetPaths = listAvatarAssets(avatarRoot)
      .map((filePath) => `/${path.relative(publicRoot, filePath).split(path.sep).join("/")}`)
      .sort();

    expect(Object.keys(AVATAR_ASSET_VERSIONS).sort()).toEqual(assetPaths);

    for (const assetPath of assetPaths) {
      const filePath = path.join(publicRoot, assetPath);

      expect(getAvatarAssetVersion(assetPath)).toBe(hashFile(filePath));
    }
  });
});
