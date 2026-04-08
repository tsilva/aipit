#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_BASE_URL = "https://sentry.io";
const DEFAULT_LIMIT = 10;
const PLACEHOLDER_AUTH_TOKEN = "sntrys_your_token_here";
const HELP_TEXT = `Usage: node scripts/sentry-issues.mjs [options]

List Sentry issues for one configured project.

Options:
  --help            Show this help output
  --limit <count>   Maximum issues to return (default: 10)
  --query <value>   Structured Sentry issue query (default: is:unresolved)
  --all             Disable the default unresolved-only query
  --json            Print the raw JSON response

Environment:
  Copy .env.sentry-mcp.example to .env.sentry-mcp and set:
    SENTRY_AUTH_TOKEN   Read-only token with org:read, project:read, and event:read
    SENTRY_ORG          Optional, defaults to tsilva
    SENTRY_PROJECT      Optional, defaults to aipit
    SENTRY_BASE_URL   Optional, defaults to https://sentry.io
`;

function stripWrappingQuotes(value) {
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

function parseEnvFile(content) {
  const entries = {};

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

function loadOptionalEnvFile(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  return parseEnvFile(readFileSync(absolutePath, "utf8"));
}

function parseArgs(argv) {
  const args = {
    help: false,
    json: false,
    limit: DEFAULT_LIMIT,
    query: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--all":
        args.query = "";
        break;
      case "--limit": {
        const value = argv[index + 1];
        const parsedValue = Number.parseInt(value ?? "", 10);

        if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
          throw new Error(`Invalid --limit value: ${value ?? "<missing>"}`);
        }

        args.limit = parsedValue;
        index += 1;
        break;
      }
      case "--query": {
        const value = argv[index + 1];

        if (value === undefined) {
          throw new Error("Missing value for --query");
        }

        args.query = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return args;
}

function normalizeBaseUrl(value) {
  if (!value) {
    return DEFAULT_BASE_URL;
  }

  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function formatIssue(issue) {
  const title = issue.title ?? issue.metadata?.title ?? "Untitled issue";
  const shortId = issue.shortId ?? issue.id ?? "unknown";
  const level = issue.level ?? "unknown";
  const count = issue.count ?? "0";
  const users = issue.userCount ?? 0;
  const lastSeen = issue.lastSeen ?? "unknown";
  const permalink = issue.permalink ?? "";

  return `${shortId} [${level}] events=${count} users=${users} lastSeen=${lastSeen}\n${title}${permalink ? `\n${permalink}` : ""}`;
}

async function main() {
  let args;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error(HELP_TEXT);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const fileEnv = loadOptionalEnvFile(".env.sentry-mcp");
  const mergedEnv = {
    ...fileEnv,
    ...process.env,
  };

  const authToken = mergedEnv.SENTRY_AUTH_TOKEN?.trim();
  const org = mergedEnv.SENTRY_ORG?.trim() || "tsilva";
  const project = mergedEnv.SENTRY_PROJECT?.trim() || "aipit";
  const baseUrl = normalizeBaseUrl(mergedEnv.SENTRY_BASE_URL?.trim() || mergedEnv.SENTRY_URL?.trim());

  if (!authToken || authToken === PLACEHOLDER_AUTH_TOKEN) {
    console.error("Missing Sentry credentials. Configure SENTRY_AUTH_TOKEN in .env.sentry-mcp or the shell environment.");
    process.exitCode = 1;
    return;
  }

  const url = new URL(`/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/`, baseUrl);
  url.searchParams.set("limit", String(args.limit));

  if (args.query !== undefined) {
    url.searchParams.set("query", args.query);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sentry API request failed (${response.status}): ${body}`);
  }

  const issues = await response.json();

  if (!Array.isArray(issues)) {
    throw new Error("Unexpected Sentry API response shape.");
  }

  if (args.json) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  const queryLabel = args.query === undefined ? "is:unresolved" : args.query || "<all issues>";
  console.log(`Project ${org}/${project} (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
  console.log(`Query: ${queryLabel}`);

  if (issues.length === 0) {
    console.log("No issues returned.");
    return;
  }

  for (const issue of issues) {
    console.log("");
    console.log(formatIssue(issue));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
