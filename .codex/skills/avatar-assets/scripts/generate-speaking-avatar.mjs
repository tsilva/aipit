#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const participantPresetFile = path.join(repoRoot, "src/lib/character-presets.ts");
const moderatorPresetFile = path.join(repoRoot, "src/lib/pit.ts");
const attributionFile = path.join(repoRoot, "public/avatars/presets/ATTRIBUTION.md");
const speakingOutputDir = path.join(repoRoot, "public/avatars/presets/speaking");
const finalStatuses = new Set(["succeeded", "failed", "canceled"]);
const defaultPrompt =
  "Subtle direct-to-camera talking animation for a portrait avatar. Natural mouth movement, small blinks, slight head motion, stable framing, and no camera movement.";
const defaultNegativePrompt =
  "camera movement, scene change, extra people, duplicated face, warped mouth, distorted eyes, heavy body motion, hands over face, text, watermark";

function usage(message) {
  if (message) {
    console.error(message);
    console.error("");
  }

  console.error(`Usage:
node .codex/skills/avatar-assets/scripts/generate-speaking-avatar.mjs \\
  --preset-id <preset-id> \\
  --avatar <avatar-path-or-url> [options]

Options:
  --prompt <text>
  --negative-prompt <text>
  --duration <seconds>          Default: 6
  --resolution <720p|1080p>     Default: 720p
  --output-size <px>            Default: 256
  --seed <number>
  --force
  --skip-wire
  --skip-attribution
`);

  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    duration: 6,
    resolution: "720p",
    outputSize: 256,
    force: false,
    skipWire: false,
    skipAttribution: false,
    prompt: defaultPrompt,
    negativePrompt: defaultNegativePrompt,
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
      case "--prompt":
        parsed.prompt = argv[++index];
        break;
      case "--negative-prompt":
        parsed.negativePrompt = argv[++index];
        break;
      case "--duration":
        parsed.duration = Number(argv[++index]);
        break;
      case "--resolution":
        parsed.resolution = argv[++index];
        break;
      case "--output-size":
        parsed.outputSize = Number(argv[++index]);
        break;
      case "--seed":
        parsed.seed = Number(argv[++index]);
        break;
      case "--force":
        parsed.force = true;
        break;
      case "--skip-wire":
        parsed.skipWire = true;
        break;
      case "--skip-attribution":
        parsed.skipAttribution = true;
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

  if (!Number.isFinite(parsed.duration) || parsed.duration < 2 || parsed.duration > 15) {
    usage("--duration must be a number between 2 and 15.");
  }

  if (!["720p", "1080p"].includes(parsed.resolution)) {
    usage("--resolution must be either 720p or 1080p.");
  }

  if (!Number.isFinite(parsed.outputSize) || parsed.outputSize < 128) {
    usage("--output-size must be a number >= 128.");
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
  const response = await fetch("https://api.replicate.com/v1/models/wan-video/wan-2.7-i2v/predictions", {
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

  throw new Error("Replicate output did not contain a downloadable video URL.");
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, bytes);
}

function resolvePresetSourceFile(presetId) {
  const candidates = [participantPresetFile, moderatorPresetFile];

  for (const filePath of candidates) {
    // These preset objects all declare a stable id near the top of the object literal.
    const contents = requireText(filePath);

    if (contents.includes(`id: "${presetId}"`)) {
      return filePath;
    }
  }

  throw new Error(`Could not find preset "${presetId}" in ${path.relative(repoRoot, participantPresetFile)} or ${path.relative(repoRoot, moderatorPresetFile)}.`);
}

function requireText(filePath) {
  return requireText.cache.get(filePath);
}

requireText.cache = new Map();

async function primeTextCache(filePath) {
  requireText.cache.set(filePath, await readFile(filePath, "utf8"));
}

function upsertSpeakingAvatarUrl(sourceText, presetId, publicUrl) {
  const presetMarker = `id: "${presetId}"`;
  const presetIndex = sourceText.indexOf(presetMarker);

  if (presetIndex === -1) {
    throw new Error(`Preset block for "${presetId}" was not found.`);
  }

  const characterProfileIndex = sourceText.indexOf("characterProfile:", presetIndex);

  if (characterProfileIndex === -1) {
    throw new Error(`Could not locate characterProfile block for "${presetId}".`);
  }

  const head = sourceText.slice(0, presetIndex);
  const objectHeader = sourceText.slice(presetIndex, characterProfileIndex);
  const tail = sourceText.slice(characterProfileIndex);
  const existingPattern = /^(\s*)speakingAvatarUrl:\s*"[^"]+",\n/m;

  if (existingPattern.test(objectHeader)) {
    return `${head}${objectHeader.replace(existingPattern, `$1speakingAvatarUrl: "${publicUrl}",\n`)}${tail}`;
  }

  const avatarMatch = objectHeader.match(/^(\s*)avatarUrl:\s*"[^"]+",\n/m);

  if (avatarMatch) {
    const [avatarLine, indent] = avatarMatch;
    return `${head}${objectHeader.replace(avatarLine, `${avatarLine}${indent}speakingAvatarUrl: "${publicUrl}",\n`)}${tail}`;
  }

  const profileMatch = tail.match(/^(\s*)characterProfile:/m);

  if (!profileMatch) {
    throw new Error(`Could not determine indentation for "${presetId}".`);
  }

  const indent = profileMatch[1];
  return `${head}${objectHeader}${indent}speakingAvatarUrl: "${publicUrl}",\n${tail}`;
}

function upsertAttributionEntry(sourceText, outputFilename, avatarInput, outputSize, duration) {
  const sectionHeading = "## Speaking avatar videos";
  const entry =
    `- \`${outputFilename}\`: ${duration}s muted speaking clip generated with [wan-video/wan-2.7-i2v](https://replicate.com/wan-video/wan-2.7-i2v) ` +
    `from the source avatar \`${avatarInput}\` as both the first and last frame, then center-cropped and compressed to ${outputSize}x${outputSize} H.264 MP4 for live speaking playback.\n`;
  const entryPattern = new RegExp(`- \\\`${outputFilename.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\\`:.*\\n`, "g");

  if (!sourceText.includes(sectionHeading)) {
    return `${sourceText.trimEnd()}\n\n${sectionHeading}\n\n${entry}`;
  }

  if (entryPattern.test(sourceText)) {
    return sourceText.replace(entryPattern, entry);
  }

  return sourceText.replace(sectionHeading, `${sectionHeading}\n\n${entry}`.trimEnd());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is required.");
  }

  await Promise.all([
    ensureTool("magick"),
    ensureTool("ffmpeg"),
    ensureTool("ffprobe"),
    primeTextCache(participantPresetFile),
    primeTextCache(moderatorPresetFile),
  ]);

  await mkdir(speakingOutputDir, { recursive: true });

  const publicUrl = `/avatars/presets/speaking/${args.presetId}.mp4`;
  const outputPath = path.join(speakingOutputDir, `${args.presetId}.mp4`);

  if (!args.force) {
    try {
      await stat(outputPath);
      throw new Error(`Output already exists at ${path.relative(repoRoot, outputPath)}. Re-run with --force to overwrite.`);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        // Expected when the file does not exist.
      } else if (error instanceof Error) {
        throw error;
      } else {
        throw error;
      }
    }
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "aipit-speaking-avatar-"));

  try {
    const localAvatarPath = await loadAvatarToLocalFile(args.avatar, tempDir);
    const preparedInputPath = path.join(tempDir, "prepared-first-frame.jpg");
    const rawVideoPath = path.join(tempDir, "raw-output.mp4");

    await runCommand("magick", [
      localAvatarPath,
      "-auto-orient",
      "-resize",
      "720x720^",
      "-gravity",
      "center",
      "-extent",
      "720x720",
      "-strip",
      "-quality",
      "92",
      preparedInputPath,
    ]);

    const predictionInput = {
      first_frame: await readAsDataUrl(preparedInputPath),
      last_frame: await readAsDataUrl(preparedInputPath),
      prompt: args.prompt,
      negative_prompt: args.negativePrompt,
      resolution: args.resolution,
      duration: args.duration,
      enable_prompt_expansion: false,
    };

    if (args.seed !== undefined) {
      predictionInput.seed = args.seed;
    }

    console.log(`Creating Replicate prediction for ${args.presetId}...`);
    const prediction = await pollPrediction(token, await createPrediction(token, predictionInput));
    const outputUrl = extractOutputUrl(prediction.output);

    console.log(`Downloading ${outputUrl}`);
    await downloadFile(outputUrl, rawVideoPath);

    await runCommand("ffmpeg", [
      "-y",
      "-i",
      rawVideoPath,
      "-an",
      "-t",
      String(args.duration),
      "-vf",
      `trim=duration=${args.duration},setpts=PTS-STARTPTS,fps=24,scale=${args.outputSize}:${args.outputSize}:force_original_aspect_ratio=increase,crop=${args.outputSize}:${args.outputSize},setsar=1`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-movflags",
      "+faststart",
      "-preset",
      "slow",
      "-crf",
      "28",
      outputPath,
    ]);

    const probe = await runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height,r_frame_rate",
      "-show_entries",
      "format=duration,size",
      "-of",
      "json",
      outputPath,
    ]);

    if (!args.skipWire) {
      const presetFilePath = resolvePresetSourceFile(args.presetId);
      const nextSource = upsertSpeakingAvatarUrl(requireText(presetFilePath), args.presetId, publicUrl);
      await writeFile(presetFilePath, nextSource);
      requireText.cache.set(presetFilePath, nextSource);
      console.log(`Updated ${path.relative(repoRoot, presetFilePath)} with ${publicUrl}`);
    }

    if (!args.skipAttribution) {
      const existingAttribution = await readFile(attributionFile, "utf8");
      const avatarLabel = isHttpUrl(args.avatar) ? args.avatar : path.relative(repoRoot, localAvatarPath);
      const nextAttribution = upsertAttributionEntry(
        existingAttribution,
        path.basename(outputPath),
        avatarLabel,
        args.outputSize,
        args.duration,
      );
      await writeFile(attributionFile, nextAttribution);
      console.log(`Updated ${path.relative(repoRoot, attributionFile)}`);
    }

    console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
    console.log(probe.stdout.trim());
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
