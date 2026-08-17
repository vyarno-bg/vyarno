#!/usr/bin/env node
/**
 * Post-build step: fill the `dateModified` slot in each entry's JSON-LD.
 *
 * ## Why the date is not written into the entry
 *
 * Freshness is what this product claims, and `dateModified` is where a machine
 * reads it: Google takes it off the node, and so do the answer surfaces that
 * weight recency. Neither reads the sitemap for it, so `lastmod` there answers
 * a different consumer and leaves this one with nothing.
 *
 * The entries are static `.html` with no templating, so a literal date in them
 * would be a second copy of one that moves on every pipeline refresh — wrong
 * from the first refresh that forgot it, and wrong in the one place a crawler
 * treats as authoritative. So each entry carries a token and this step
 * substitutes, in the shape of `vite.config.js`'s `__BUILD_ID__` define.
 *
 * **`npm run dev` therefore serves the token verbatim.** It is a wart and it is
 * the cheap side of the trade: dev has no post-build step to run, and the
 * alternative is a date maintained by hand in three files.
 *
 * ## What decides the value
 *
 * The same rule the prerender follows — **what a published payload decides may
 * be filled in, what the CLOCK decides may not**. `newestAsOf()` is the newest
 * `as_of` across the eight committed payloads, which is genuinely when what a
 * visitor sees last changed; it is imported from `gen-sitemap.mjs` rather than
 * reimplemented, so `<lastmod>` and `dateModified` cannot answer the same
 * question differently. `new Date()` never appears here: a page stamped with
 * the day it was built claims a freshness the data does not have.
 *
 * `/legal/` takes `LEGAL_LASTMOD`, which tracks the documents' effective date
 * in `src/lib/legal.js`. `/support/` takes nothing, on `gen-sitemap.mjs`'s own
 * reasoning: its content changes when a channel opens or the copy is edited,
 * and neither is a date anything in this build can read. An omitted field costs
 * a crawler nothing next to a false one.
 *
 * ## Why an unfilled slot fails the build
 *
 * A sitemap can omit an optional `<lastmod>`. An entry cannot omit anything —
 * the token is already inside its JSON-LD, so a step that declined to run
 * serves `"dateModified": "__DATA_LASTMOD__"` to every parser that reads the
 * node. Failing is unreachable in practice: `prerender.mjs` runs first and
 * fails the build on a payload it cannot read, so by the time this runs the
 * eight have parsed.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";

import { LEGAL_LASTMOD, newestAsOf } from "./gen-sitemap.mjs";
import { readPayloads } from "./prerender.mjs";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Which entry takes which date, and the token that marks the slot.
 *
 * A page absent from this list is a page whose JSON-LD carries no
 * `dateModified`, which is the correct answer for `/support/` and the wrong one
 * for anything a payload dates. `verify_render_prerender.mjs` reads the served
 * value back against the payloads shipped in the same `dist/`.
 *
 * A page and its English counterpart take the same date from the same slot.
 * They are one component rendered from one set of payloads in one build, so a
 * pair whose dates could differ would be two answers to a question with one.
 */
export const DATED = Object.freeze(
  [
    { page: ["index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["how", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["market", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["credit", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["legal", "index.html"], slot: "__LEGAL_LASTMOD__" },
    { page: ["en", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["en", "how", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["en", "market", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["en", "credit", "index.html"], slot: "__DATA_LASTMOD__" },
    { page: ["en", "legal", "index.html"], slot: "__LEGAL_LASTMOD__" },
  ].map(Object.freeze)
);

/**
 * `html` with every occurrence of `slot` replaced by `value`.
 *
 * Kept pure and exported so `verify_static_assets.mjs` can test it without a
 * build — a generator with no test is a file nobody checks
 * (docs/testing-strategy.md). It throws on a slot that is not there rather than
 * returning the input unchanged, for the reason every post-build step in this
 * directory throws: a step that quietly did nothing looks exactly like a build
 * that worked, and the artefact it did not write is the only evidence.
 *
 * @param {string} html  the built entry
 * @param {string} slot  the token to substitute
 * @param {string | null} value  an ISO day
 * @returns {string}
 */
export function fillDate(html, slot, value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    throw new Error(
      `gen-jsonld: ${JSON.stringify(value)} is not an ISO day, and ` +
        `${slot} names the field a crawler reads this page's freshness off. ` +
        "The date is what a payload decided, so an unreadable one is a broken " +
        "checkout rather than a field to invent."
    );
  }
  if (!html.includes(slot)) {
    throw new Error(
      `gen-jsonld: no ${slot} in the built entry. The token and this step move ` +
        "together — without it the page's JSON-LD carries no dateModified, and " +
        "nothing else in the build would report that."
    );
  }
  // A replacer function, not a replacement string: `$&` in a value would be
  // read as a capture reference.
  return html.replaceAll(slot, () => value);
}

// --- The build step itself. Skipped when imported by the test. --------------
//
// `pathToFileURL`, never `` `file://${process.argv[1]}` ``. Node hands argv[1]
// an absolute native path, and on Windows that is `D:\a\...` — concatenating
// it produces `file://D:\a\...` against an `import.meta.url` of
// `file:///D:/a/...`, so the guard is false and the step silently does nothing
// while the build reports success.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dates = {
    __DATA_LASTMOD__: newestAsOf(Object.values(await readPayloads())),
    __LEGAL_LASTMOD__: LEGAL_LASTMOD,
  };

  for (const { page, slot } of DATED) {
    const file = join(SITE, "dist", ...page);
    await writeFile(file, fillDate(await readFile(file, "utf8"), slot, dates[slot]), "utf8");
    console.log(`[gen-jsonld] dist/${page.join("/")} — dateModified ${dates[slot]}`);
  }
}
