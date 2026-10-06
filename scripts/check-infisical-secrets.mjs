#!/usr/bin/env node

for (const name of ["BWS_ACCESS_TOKEN", "INFISICAL_TOKEN", "INFISICAL_CLIENT_SECRET", "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET", "INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN"]) {
  if (process.env[name]) {
    console.error("The application environment unexpectedly includes a secrets-manager credential.");
    process.exit(1);
  }
}

console.log("Infisical Development access verified. No secret values were displayed.");
for (const name of ["OPENROUTER_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SENTRY_AUTH_TOKEN"]) {
  console.log(`${name}: ${process.env[name]?.trim() ? "configured" : "not configured (optional)"}`);
}
if (!process.env.OPENROUTER_API_KEY?.trim()) {
  console.log("Enter a personal OpenRouter key in the app to run debates.");
}
