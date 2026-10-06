#!/usr/bin/env node

if (process.env.BWS_ACCESS_TOKEN) {
  console.error("The application environment unexpectedly includes the Bitwarden access token.");
  process.exit(1);
}

console.log("Bitwarden environment check completed. No secret values were displayed.");
for (const name of ["OPENROUTER_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SENTRY_AUTH_TOKEN"]) {
  console.log(`${name}: ${process.env[name]?.trim() ? "configured" : "not configured (optional)"}`);
}
if (!process.env.OPENROUTER_API_KEY?.trim()) {
  console.log("Enter a personal OpenRouter key in the app to run debates.");
}
