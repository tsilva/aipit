import { env } from "./env";
export { SITE_CONTACT_EMAIL, SITE_CONTACT_MAILTO } from "./contact";

export const SITE_URL = env.siteUrl;
export const SITE_HOSTNAME = new URL(SITE_URL).host;
export const SITE_TWITTER_HANDLE = "@tiagosilva";
