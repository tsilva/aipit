import { env } from "./env";

export const SITE_URL = env.siteUrl;
export const SITE_HOSTNAME = new URL(SITE_URL).host;
export const SITE_CONTACT_EMAIL = "clone-coffee-mangy@duck.com";
export const SITE_CONTACT_MAILTO = `mailto:${SITE_CONTACT_EMAIL}`;
export const SITE_TWITTER_HANDLE = "@tiagosilva";
