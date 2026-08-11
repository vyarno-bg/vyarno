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
 * Eight pages, and that is the whole site: four routes, each at a Bulgarian and
 * an English address. `/404.html` is deliberately absent (it is `noindex`, and
 * listing an error page is a crawl-budget bug), and `/data/published/*` is
 * absent because `robots.txt` disallows it — a sitemap that lists a disallowed
 * path is a contradiction a crawler reports back as an error.
 *
 * **Both languages are listed, and neither is a duplicate of the other.** They
 * are separate documents with separate canonicals, each declaring the other as
 * its `hreflang` alternate; a sitemap naming only the Bulgarian half would
 * leave the English one discoverable by link alone, which is what the whole
 * `/en/` tree exists to stop being true (docs/seo.md).
 *
 * A page and its counterpart take the SAME `lastmod`, and that is a statement
 * about the pair rather than a convenience: they are one component prerendered
 * from one set of payloads in one build, so nothing can move on one and not the
 * other. `/how/` takes the calculator's for the same reason.
 *
 * `/support/` carries no `lastmod`, in either language. Its content changes
 * when a channel opens or the copy is edited, and neither is a date anything in
 * this build can read; a hand-maintained constant beside `LEGAL_LASTMOD` would
 * be wrong from the first commit that forgot it. The field is optional, and an
 * omitted `lastmod` costs a crawler nothing next to a false one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";

import { PAYLOAD_FILES } from "../src/lib/payloads.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../../data/published");
const DIST = resolve(__dirname, "../dist");

export const ORIGIN = "https://vyarno.bg";

/** The legal documents' effective date — see `src/lib/legal.js`. */
export const LEGAL_LASTMOD = "2026-08-01";

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
//
// `pathToFileURL`, never `` `file://${process.argv[1]}` ``. Node hands argv[1]
// an absolute native path, and on Windows that is `D:\a\...` — concatenating
// it produces `file://D:\a\...` against an `import.meta.url` of
// `file:///D:/a/...`, so the guard is false and the step silently does nothing
// while the build reports success. That is the one failure mode a post-build
// step must not have, and it is invisible to every suite that does not read
// the artefact afterwards.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
  const pages = [
    { loc: "/", lastmod: dataLastmod, changefreq: "monthly" },
    { loc: "/how/", lastmod: dataLastmod, changefreq: "monthly" },
    { loc: "/legal/", lastmod: LEGAL_LASTMOD, changefreq: "yearly" },
    { loc: "/support/", changefreq: "yearly" },
    { loc: "/en/", lastmod: dataLastmod, changefreq: "monthly" },
    { loc: "/en/how/", lastmod: dataLastmod, changefreq: "monthly" },
    { loc: "/en/legal/", lastmod: LEGAL_LASTMOD, changefreq: "yearly" },
    { loc: "/en/support/", changefreq: "yearly" },
  ];

  await writeFile(join(DIST, "sitemap.xml"), sitemapXml(pages), "utf8");
  console.log(
    `[gen-sitemap] wrote dist/sitemap.xml — ${pages.length} pages, ` +
      `data lastmod ${dataLastmod ?? "omitted"}`
  );
}
