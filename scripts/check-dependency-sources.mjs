import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const forbiddenSpec = /^(?:git(?:\+[^:]+)?|https?|file|link|workspace|github|gitlab|bitbucket|npm):|\.(?:tgz|tar\.gz)(?:$|#)/i;

for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
    if (forbiddenSpec.test(spec)) {
      throw new Error(`${section}.${name} uses forbidden dependency source: ${spec}`);
    }
  }
}

for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (entry.resolved && !entry.resolved.startsWith("https://registry.npmjs.org/")) {
    throw new Error(`${path || "lock root"} resolves outside the npm registry: ${entry.resolved}`);
  }
}

console.log("Dependency sources are registry-only.");
