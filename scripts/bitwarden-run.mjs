#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

const commands = {
  dev: "node scripts/dev-server.mjs next dev --port auto",
  build: "npm run build",
  start: "npm run start -- --port auto",
  check: "node scripts/check-bitwarden-secrets.mjs",
};
const operation = process.argv[2];

if (!Object.hasOwn(commands, operation) || process.argv.length !== 3) {
  console.error("Usage: node scripts/bitwarden-run.mjs <dev|build|start|check>");
  process.exit(1);
}

async function readConfiguration() {
  try {
    const contents = await readFile(new URL("../.bitwarden.local.json", import.meta.url), "utf8");
    const configuration = JSON.parse(contents);
    if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
      throw new Error("Invalid configuration");
    }
    return configuration;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("Could not read .bitwarden.local.json. Use the format in bitwarden.config.example.json.");
  }
}

async function readAccessToken() {
  if (process.env.BWS_ACCESS_TOKEN?.trim()) return process.env.BWS_ACCESS_TOKEN.trim();
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error("Run this command in an interactive terminal for the hidden token prompt, or supply BWS_ACCESS_TOKEN through your secret provider.");
  }

  // Discard readline's terminal output so pasted tokens cannot be echoed.
  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const reader = createInterface({
    input: process.stdin,
    output: mutedOutput,
    terminal: true,
    historySize: 0,
  });
  process.stderr.write("Bitwarden machine token (hidden): ");
  try {
    return await new Promise((resolve, reject) => {
      let answered = false;
      reader.on("SIGINT", () => reader.close());
      reader.once("close", () => {
        if (!answered) reject(new Error("Bitwarden token entry cancelled."));
      });
      reader.question("", (token) => {
        answered = true;
        reader.close();
        if (!token.trim()) reject(new Error("A Bitwarden machine token is required."));
        else resolve(token.trim());
      });
    });
  } finally {
    reader.close();
    process.stderr.write("\n");
  }
}

async function main() {
  const configuration = await readConfiguration();
  const projectId = process.env.BWS_PROJECT_ID ?? configuration.projectId;
  if (typeof projectId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId.trim())) {
    throw new Error("Set the development project UUID in .bitwarden.local.json or BWS_PROJECT_ID. See docs/bitwarden-secrets.md.");
  }
  const serverUrl = process.env.BWS_SERVER_URL ?? configuration.serverUrl;
  if (serverUrl && !["https://vault.bitwarden.com", "https://vault.bitwarden.eu"].includes(serverUrl)) {
    throw new Error("Set serverUrl to https://vault.bitwarden.com or https://vault.bitwarden.eu.");
  }

  const accessToken = await readAccessToken();
  const child = spawn("bws", [
    "run",
    "--project-id", projectId.trim(),
    ...(serverUrl ? ["--server-url", serverUrl] : []),
    "--no-inherit-env",
    "--shell", "sh",
    "--", commands[operation],
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, BWS_ACCESS_TOKEN: accessToken },
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("error", (error) => {
    console.error(error.code === "ENOENT"
      ? "Install the Bitwarden Secrets Manager CLI (bws) and add it to PATH. See docs/bitwarden-secrets.md."
      : "Could not launch the Bitwarden Secrets Manager CLI.");
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
