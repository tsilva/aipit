import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'");
  }

  return value;
}

export function parseEnvFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
    const separatorIndex = withoutExport.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    const value = withoutExport.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    entries[key] = stripWrappingQuotes(value);
  }

  return entries;
}

export function loadOptionalEnvFile(relativePath: string, target: NodeJS.ProcessEnv = process.env): boolean {
  const absolutePath = resolve(process.cwd(), relativePath);

  if (!existsSync(absolutePath)) {
    return false;
  }

  const content = readFileSync(absolutePath, "utf8");
  const parsed = parseEnvFile(content);

  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }

  return true;
}
