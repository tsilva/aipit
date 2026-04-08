import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeConfig } from "./src/lib/sentry";

Sentry.init({
  ...resolveSentryRuntimeConfig("edge"),
});
