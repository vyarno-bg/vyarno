#!/usr/bin/env node
/**
 * Post-build step: write `dist/sitemap.xml`.
 *
 * Generated rather than committed, for one reason: `lastmod`. A hand-written
 * sitemap's dates are wrong the day after they are written, and a sitemap that
 * lies about freshness is worse than none — it teaches a crawler to ignore the
 * field. The calculator's `lastmod` is the newest `as_of` across the published
 * payloads, which is genuinely when the page's content last changed; the legal
 * page's is its effective date.
 *
 * Two pages, and that is the whole site: `/` and `/legal/`. `/404.html` is
 * deliberately absent (it is `noindex`, and listing an error page is a
 * crawl-budget bug), and `/data/published/*` is absent because `robots.txt`
 * disallows it — a sitemap that lists a disallowed path is a contradiction a
 * crawler reports back as an error.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { PAYLOAD_FILES } from "../src/lib/payloads.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../../data/published");
const DIST = resolve(__dirname, "../dist");

export const ORIGIN = "https://vyarno.bg";

/** The legal documents' effective date — see `src/lib/legal.js`. */
export const LEGAL_LASTMOD = "2026-07-26";

/**
 * Newest `as_of` across the published payloads, as `YYYY-MM-DD`.
 *
 * Newest, not oldest: this answers "when did what a visitor sees last change",
 * and one refreshed payload does change the page. (The staleness banner asks
 * the opposite question and correctly uses the oldest — see `view.js#dataAge`.)
 * Falls back to `null` when there is nothing to read, and a `lastmod` is then
 * omitted rather than invented.
 *
 * @param {Array<{as_of?: string}>} payloads
 * @returns {string | null}
 */
export function newestAsOf(payloads) {
  const dates = payloads
    .map((p) => p?.as_of)
    .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    .map((d) => d.slice(0, 10))
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * The sitemap XML for a list of `{ loc, lastmod, priority }` entries.
 *
 * Kept pure and exported so `verify_static_assets.mjs` can test it without a
 * build. A generator with no test is a file nobody checks
 * (docs/testing-strategy.md).
 *
 * @param {Array<{loc: string, lastmod?: string|null, changefreq?: string}>} pages
 * @returns {string}
 */
export function sitemapXml(pages) {
  const body = pages
    .map(({ loc, lastmod, changefreq }) => {
      const lines = [`    <loc>${ORIGIN}${loc}</loc>`];
      if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
      if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${body}\n` +
    "</urlset>\n"
  );
}

// --- The build step itself. Skipped when imported by the test. --------------
if (import.meta.url === `file://${process.argv[1]}`) {
  // The manifest, not a directory listing: `lastmod` follows the payloads the
  // page actually serves, so a published file with no figure on the page cannot
  // date it.
  const payloads = [];
  for (const stem of PAYLOAD_FILES) {
    try {
      payloads.push(JSON.parse(await readFile(join(DATA, `${stem}.json`), "utf8")));
    } catch {
      // A malformed or missing payload is CI's problem (the `data` job parses
      // every one); it must not take the sitemap down with it.
    }
  }

  const dataLastmod = newestAsOf(payloads);
  const xml = sitemapXml([
    { loc: "/", lastmod: dataLastmod, changefreq: "monthly" },
    { loc: "/legal/", lastmod: LEGAL_LASTMOD, changefreq: "yearly" },
  ]);

  await writeFile(join(DIST, "sitemap.xml"), xml, "utf8");
  console.log(
    `[gen-sitemap] wrote dist/sitemap.xml — 2 pages, data lastmod ${dataLastmod ?? "omitted"}`
  );
}
