#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const avatarOutputDir = path.join(repoRoot, "public/avatars/presets");
const finalStatuses = new Set(["succeeded", "failed", "canceled"]);
const defaultPrompt =
  "Return exactly the same portrait image with the same person, identity, pose, face, expression, clothing, lighting, colors, and background. Do not stylize, modernize, beautify, change age, change hair, change clothing, or change identity. Only extend or crop the canvas as needed to make a square high-resolution avatar. The person's full face must be fully visible, prominent, and centered in the square frame, with forehead, chin, ears, and hairline not awkwardly cropped. Preserve realistic photographic detail. No text, no watermark.";

function usage(message) {
  if (message) {
    console.error(message);
    console.error("");
  }

  console.error(`Usage:
node .codex/skills/avatar-assets/scripts/square-avatar-image.mjs \\
  --preset-id <preset-id> \\
  --avatar <avatar-path-or-url> [options]

Options:
  --output <path>              Default: public/avatars/presets/<preset-id>.webp
  --output-size <px>           Default: 1024
  --model-size <size>          Default: 1024*1024
  --prompt <text>
  --seed <number>
  --force
`);

  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    outputSize: 1024,
    modelSize: "1024*1024",
    force: false,
    prompt: defaultPrompt,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--preset-id":
        parsed.presetId = argv[++index];
        break;
      case "--avatar":
        parsed.avatar = argv[++index];
        break;
      case "--output":
        parsed.output = argv[++index];
        break;
      case "--output-size":
        parsed.outputSize = Number(argv[++index]);
        break;
      case "--model-size":
        parsed.modelSize = argv[++index];
        break;
      case "--prompt":
        parsed.prompt = argv[++index];
        break;
      case "--seed":
        parsed.seed = Number(argv[++index]);
        break;
      case "--force":
        parsed.force = true;
        break;
      default:
        usage(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.presetId) {
    usage("Missing required --preset-id.");
  }

  if (!parsed.avatar) {
    usage("Missing required --avatar.");
  }

  if (!Number.isInteger(parsed.outputSize) || parsed.outputSize < 512) {
    usage("--output-size must be an integer >= 512.");
  }

  if (parsed.seed !== undefined && !Number.isInteger(parsed.seed)) {
    usage("--seed must be an integer.");
  }

  return parsed;
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}\n${stderr || stdout}`.trim()));
    });
  });
}

async function ensureTool(toolName) {
  try {
    await runCommand("which", [toolName]);
  } catch {
    throw new Error(`Missing required tool: ${toolName}`);
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function loadAvatarToLocalFile(avatarInput, tempDir) {
  if (isHttpUrl(avatarInput)) {
    const response = await fetch(avatarInput);

    if (!response.ok) {
      throw new Error(`Failed to download avatar image: ${response.status} ${response.statusText}`);
    }

    const extension = path.extname(new URL(avatarInput).pathname) || ".img";
    const targetPath = path.join(tempDir, `source${extension}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(targetPath, bytes);
    return targetPath;
  }

  return path.isAbsolute(avatarInput) ? avatarInput : path.join(repoRoot, avatarInput);
}

async function readAsDataUrl(filePath) {
  const bytes = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".bmp"
          ? "image/bmp"
          : "image/jpeg";

  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

async function createPrediction(token, input) {
  const response = await fetch("https://api.replicate.com/v1/models/wan-video/wan-2.7-image/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ input }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Replicate prediction request failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function pollPrediction(token, prediction) {
  let current = prediction;

  while (!finalStatuses.has(current.status)) {
    if (!current.urls?.get) {
      throw new Error("Replicate prediction response did not include a polling URL.");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const response = await fetch(current.urls.get, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    current = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to poll prediction ${prediction.id}: ${response.status} ${JSON.stringify(current)}`);
    }
  }

  if (current.status !== "succeeded") {
    throw new Error(`Prediction ${current.id} ended with status "${current.status}". ${current.error ?? ""}`.trim());
  }

  return current;
}

function extractOutputUrl(output) {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output) && typeof output[0] === "string") {
    return output[0];
  }

  throw new Error("Replicate output did not contain a downloadable image URL.");
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, bytes);
}

async function assertWritableOutput(outputPath, force) {
  if (force) {
    return;
  }

  try {
    await stat(outputPath);
    throw new Error(`Output already exists at ${path.relative(repoRoot, outputPath)}. Re-run with --force to overwrite.`);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is required.");
  }

  await ensureTool("magick");
  await mkdir(avatarOutputDir, { recursive: true });

  const outputPath = args.output
    ? path.resolve(repoRoot, args.output)
    : path.join(avatarOutputDir, `${args.presetId}.webp`);

  await assertWritableOutput(outputPath, args.force);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "aipit-square-avatar-"));

  try {
    const localAvatarPath = await loadAvatarToLocalFile(args.avatar, tempDir);
    const rawImagePath = path.join(tempDir, "raw-output");
    const downloadedPath = `${rawImagePath}.png`;

    const predictionInput = {
      images: [await readAsDataUrl(localAvatarPath)],
      prompt: args.prompt,
      size: args.modelSize,
      num_outputs: 1,
    };

    if (args.seed !== undefined) {
      predictionInput.seed = args.seed;
    }

    console.log(`Creating Replicate image prediction for ${args.presetId}...`);
    const prediction = await pollPrediction(token, await createPrediction(token, predictionInput));
    const outputUrl = extractOutputUrl(prediction.output);

    console.log(`Downloading ${outputUrl}`);
    await downloadFile(outputUrl, downloadedPath);

    await runCommand("magick", [
      downloadedPath,
      "-auto-orient",
      "-resize",
      `${args.outputSize}x${args.outputSize}^`,
      "-gravity",
      "center",
      "-extent",
      `${args.outputSize}x${args.outputSize}`,
      "-strip",
      "-quality",
      "92",
      outputPath,
    ]);

    const identify = await runCommand("identify", ["-format", "%m %w %h %[size]", outputPath]);
    console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
    console.log(identify.stdout.trim());
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
