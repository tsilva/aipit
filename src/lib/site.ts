import { env } from "./env";

export const SITE_URL = env.siteUrl;
export const SITE_HOSTNAME = new URL(SITE_URL).host;
