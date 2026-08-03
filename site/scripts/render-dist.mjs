/**
 * What the render suites need from `dist/` without opening a browser.
 *
 * Kept apart from `render-harness.mjs` on purpose. Importing that module
 * launches a Chromium at evaluation time, and the prerender assertions — the
 * built HTML as a crawler reads it, before any bundle runs — have no use for
 * one. `node --test` runs each file in its own process, so a suite that
 * imported the browser to reach `shipped()` would pay for a browser per run and
 * hold a core while asserting on a file it read from disk.
 *
 * Nothing here has a `test()` in it, and the filename carries no `verify_`
 * prefix, which is what keeps `verify_suites.mjs` from expecting an npm script
 * to run it. `docs/site.md`'s tree names it, which `verify_docs_map.mjs`
 * checks.
 */
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

export const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = join(SITE, "dist");

/** Whether `npm run build` has run. Every assertion here is about its output. */
export const built = await stat(join(DIST, "index.html")).then(
  () => true,
  () => false
);

/** The skip reason for anything that reads `dist/`, or false when it is there. */
export const needsBuild = built ? false : "no dist/ — run `npm run build` first";

/**
 * `content.js` as the built page carries it, or nulls where there is no build.
 *
 * Imported rather than quoted, so the suites check the rule — the page carries
 * its own copy — instead of pinning sentences that can be rewritten for a good
 * reason tomorrow.
 */
export const { COPY, t } = built
  ? await import(pathToFileURL(join(SITE, "src", "lib", "content.js")).href)
  : { COPY: null, t: null };

/** A payload as the deploy serves it, from `dist/`, not from the repo. */
export async function shipped(name) {
  return JSON.parse(await readFile(join(DIST, "data", "published", `${name}.json`), "utf8"));
}

/**
 * A built page's HTML with the entity escapes undone.
 *
 * `&` in a division's name («Food & soft drinks») is `&amp;` in the served
 * markup, so a substring check against the payload's own string fails on a
 * page that is rendering it perfectly. Undoing the escapes is what makes these
 * assertions about the FIGURE rather than about the encoder.
 */
export async function servedText(...page) {
  const html = await readFile(join(DIST, ...page), "utf8");
  return html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * The attribution line as it is actually served, year filled in.
 *
 * `COPY.footerNote` carries a `{year}` slot rather than a literal, so a
 * prerendered page holds the year the build ran in and a reader's browser holds
 * theirs. Substituting the same way `SiteFooter` does keeps this checking that
 * the five publishers reached the HTML, which is what it is for — a test
 * comparing against the raw template would fail on the slot and say nothing
 * about the credit.
 */
export const attribution = (lang) => t(COPY.footerNote, lang, { year: new Date().getFullYear() });
