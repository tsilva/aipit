import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STARTER_BUNDLES } from "../src/lib/starter-bundles.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sitemapPath = path.join(repoRoot, "public", "sitemap.xml");
const bundlesPath = path.join(repoRoot, "src", "lib", "starter-bundles.ts");

function normalizeOptional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toHttps(host) {
  return host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
}

function resolveSiteUrl() {
  const explicitSiteUrl = normalizeOptional(process.env.NEXT_PUBLIC_SITE_URL);
  const previewUrl = normalizeOptional(process.env.VERCEL_URL);
  const productionUrl = normalizeOptional(process.env.VERCEL_PROJECT_PRODUCTION_URL);

  if (explicitSiteUrl) {
    return toHttps(explicitSiteUrl);
  }

  if (previewUrl) {
    return toHttps(previewUrl);
  }

  if (productionUrl) {
    return toHttps(productionUrl);
  }

  return "http://localhost:3000";
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(input) {
  return input.toISOString().slice(0, 10);
}

async function resolveLastModifiedDate() {
  const bundleStats = await stat(bundlesPath);
  return formatDate(bundleStats.mtime);
}

async function main() {
  const siteUrl = resolveSiteUrl();
  const lastModified = await resolveLastModifiedDate();
  const urls = [
    {
      loc: new URL("/", siteUrl).toString(),
      changefreq: "monthly",
      priority: "1.0",
    },
    ...STARTER_BUNDLES.map((bundle) => {
      const url = new URL("/", siteUrl);
      url.searchParams.set("id", bundle.id);

      return {
        loc: url.toString(),
        changefreq: "weekly",
        priority: "0.8",
      };
    }),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (entry) =>
        [
          "  <url>",
          `    <loc>${escapeXml(entry.loc)}</loc>`,
          `    <lastmod>${lastModified}</lastmod>`,
          `    <changefreq>${entry.changefreq}</changefreq>`,
          `    <priority>${entry.priority}</priority>`,
          "  </url>",
        ].join("\n"),
    ),
    "</urlset>",
    "",
  ].join("\n");

  await mkdir(path.dirname(sitemapPath), { recursive: true });
  await writeFile(sitemapPath, xml, "utf8");
}

await main();
