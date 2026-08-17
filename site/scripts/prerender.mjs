#!/usr/bin/env node
/**
 * Post-build step: render every indexable page into `dist/`, with the published
 * figures already in them, so there is a page before the bundle runs.
 *
 * ## The failure this fixes
 *
 * An entry's `<body>` is `<div id="app"></div>` and a `<noscript>`. Every word
 * a page says — «лична инфлация» and «данъчна тежест» on the calculator, the
 * terms of use and the ЗЕТ чл. 4 identity on `/legal/` — is inside the
 * JavaScript bundle, so a crawler that does not execute scripts sees a page
 * with no subject. Googlebot renders JavaScript on a second pass and gets there
 * eventually; Bingbot's second pass is slower and less reliable, and a
 * Bulgarian-language product that search engines cannot read is invisible to
 * the people it is for.
 *
 * ## What may be prerendered, and what may not
 *
 * **What a published payload decides may be prerendered. What the READER
 * decides, and what the CLOCK decides, may not.**
 *
 * The figures are safe because of how the build is assembled, not because
 * somebody judged them stable: `npm run build` runs `vite build`, then this
 * step, then `copy-data.mjs`, which copies the same `data/published/*.json`
 * into `dist/data/published/`. The JSON the bundle fetches at runtime and the
 * HTML a crawler reads therefore come out of one build from one set of files.
 * A prerendered figure is exactly as fresh as the payload the bundle fetches
 * from that deploy, and it carries its own reference period and `as_of` on
 * screen — so a deploy that ever did fall behind its data is visibly behind
 * rather than silently wrong (docs/seo.md §"What this costs, and the one way
 * it can go wrong").
 *
 * Two things stay out, and both are things the build cannot know:
 *
 *   - **the calculator region.** Its output is a function of what the reader
 *     typed, and the defaults are not survey figures — the €900 in the pay
 *     field is a placeholder the copy asks people to replace
 *     (docs/principles.md P7). Freezing a result computed from it into served
 *     HTML publishes an answer to a question nobody asked. `App.svelte`
 *     renders that region empty under `prerender`;
 *   - **the freshness verdict.** `view/freshness.js#dataAge` compares each payload's
 *     `as_of` against its cadence and the current time, and the build's clock
 *     is not the reader's. A page stamped "fresh" at build time still says so
 *     three months later. `Calculator`'s seeded constructor therefore leaves
 *     `dataRows` empty and the staleness banner down; the bundle computes both
 *     against the reader's own clock, which is the only one that answers the
 *     question.
 *
 * ## One language in the crawler's copy
 *
 * Every string on the site is authored as a pair — `<span class="l-bg">` beside
 * `<span class="l-en">` — and the rule in `tokens.css` hides whichever one
 * `html[data-lang]` does not name. That rule is CSS, so it reaches a browser
 * and Googlebot and nothing else. An agent that fetches the HTML and strips the
 * tags gets both halves run together: «Твоите числа. Твоята реалност. Your
 * numbers. Your reality.» is one `<h1>`, and every heading and sentence under
 * it reads the same way. The six agents `robots.txt` allows by name are exactly
 * that kind of consumer, and doubled prose is the worst input they could be
 * handed.
 *
 * So the written page keeps the language its entry declares in `data-lang` and
 * drops the other. **This is the crawler's copy and no reader's**, in either
 * state a reader can be in: the bundle calls `replaceChildren()` before
 * `mount()`, so anyone running JavaScript never sees this markup, and with
 * JavaScript off the half this step dropped is not what a reader is missing —
 * the counterpart page is a URL, and the header's language control is an
 * anchor pointing at it. The live DOM still carries both, because every string
 * in the tree is authored as a pair; what the step decides is only which half
 * is SERVED (docs/seo.md §"The bilingual DOM, and the copy a crawler gets").
 *
 * Each page is written twice — once per language, into the two entries that
 * declare them — from one rendered body. See `PRERENDERED`.
 *
 * ## Why a second build rather than hydration
 *
 * `mount()` appends to its target, so each page's bootstrap empties `#app`
 * first and the client renders from scratch. `hydrate()` is the conventional answer and it
 * is not what this wants: the server deliberately renders LESS than the client
 * does on its first frame, which is a hydration mismatch by construction, and
 * `<svelte:head>` would have to be injected too — leaving the page with two
 * `<title>` tags, the trap `App.svelte` already carries a comment about for
 * `<meta name="description">`. Discarding the already-parsed DOM costs a
 * repaint of markup the same stylesheet draws the same way, which is cheaper
 * than a hydration that can be wrong.
 *
 * The SSR compile reuses `vite.config.js` rather than restating it, so the
 * `$lib` alias, the Svelte plugin and the `__BUILD_ID__` define cannot drift
 * from the client build's. Both compiles hash a component's scoped classes
 * from its CSS, so `svelte-1n46o8q` in the emitted HTML is the same class the
 * shipped stylesheet carries.
 */
import { build } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";

import { PAYLOADS } from "../src/lib/payloads.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const DATA = resolve(SITE, "..", "data", "published");

/**
 * Where the SSR bundle lands.
 *
 * Inside `node_modules/` for two reasons: it is already ignored by git, and
 * Node has to be able to resolve `svelte` and `clsx` from wherever the bundle
 * sits — Vite externalises them for an SSR build, so a temporary directory
 * under `/tmp` produces a bundle that cannot be imported.
 */
const SSR_OUT = resolve(SITE, "node_modules/.vyarno-prerender");

/**
 * The empty mount point in every entry, and the one thing this step needs to
 * find. A build that renamed or reshaped it would otherwise write a page whose
 * markup is silently unchanged.
 */
export const MOUNT_POINT = '<div id="app"></div>';

/**
 * The pages this step renders, and the component behind each.
 *
 * **Every indexable entry belongs here, whatever its prose is made of.** A page
 * assembled from in-repo constants rather than from a payload has nothing to go
 * stale and nothing a build could get wrong — and it is still absent from the
 * served HTML, because a crawler indexes what it is served rather than what the
 * bundle would have produced. A page left out of this list ships
 * `<div id="app"></div>` and a `<noscript>`, so its `<h1>` is a heading Bing
 * reports as missing and its subject is one no search engine has: `/legal/`
 * carries the ЗЕТ чл. 4 identity, which the law wants findable, and `/support/`
 * exists so the funding answer has an address a person can be given.
 *
 * The 404 is the one entry that stays out, and it is out on its own grounds:
 * `404.html` is `noindex` (`verify_static_assets.mjs` pins that), so no crawler
 * is meant to be holding it in the first place.
 *
 * Adding a row here is what puts a page in front of a crawler, and it is half
 * of a pair — `mount()` appends, so the page's bootstrap has to empty `#app`
 * first or the reader gets every heading twice.
 * `verify_static_assets.mjs` §"every prerendered page has a mount point" reads
 * this list against those bootstraps, and `verify_render_prerender.mjs` reads
 * each written file back, because a post-build step that quietly does nothing
 * looks exactly like a build that worked.
 *
 * **`pages` is a LIST because one component answers at two addresses.** The
 * Bulgarian and the English entry for a page are the same component and the
 * same rendered body; what separates them is the `data-lang` each declares and
 * therefore which half of every string survives `dropOtherLanguages`. Rendering
 * per component rather than per URL is what keeps eight served pages at four
 * SSR builds — the compile is the expensive half, and the language is decided
 * after it.
 */
export const PRERENDERED = Object.freeze(
  [
    { name: "app", source: "src/App.svelte", pages: [["index.html"], ["en", "index.html"]] },
    {
      name: "how",
      source: "src/How.svelte",
      pages: [
        ["how", "index.html"],
        ["en", "how", "index.html"],
      ],
    },
    {
      name: "market",
      source: "src/Market.svelte",
      pages: [
        ["market", "index.html"],
        ["en", "market", "index.html"],
      ],
    },
    {
      name: "credit",
      source: "src/Credit.svelte",
      pages: [
        ["credit", "index.html"],
        ["en", "credit", "index.html"],
      ],
    },
    {
      name: "legal",
      source: "src/Legal.svelte",
      pages: [
        ["legal", "index.html"],
        ["en", "legal", "index.html"],
      ],
    },
    {
      name: "support",
      source: "src/Support.svelte",
      pages: [
        ["support", "index.html"],
        ["en", "support", "index.html"],
      ],
    },
  ].map(Object.freeze)
);

/**
 * `html` with `body` placed inside the mount point.
 *
 * Kept pure and exported so `verify_static_assets.mjs` can test it without a
 * build — a generator with no test is a file nobody checks
 * (docs/testing-strategy.md). It throws rather than returning the input
 * unchanged: a prerender that quietly did nothing is the failure this whole
 * step exists to prevent, and it looks exactly like a successful build.
 *
 * @param {string} html  the built entry
 * @param {string} body  the rendered page
 * @returns {string}
 */
export function injectPrerender(html, body) {
  if (!html.includes(MOUNT_POINT)) {
    throw new Error(
      `prerender: no ${MOUNT_POINT} in the built entry. The shell has nowhere ` +
        `to go, and the page's bootstrap mounts into #app — both have to move ` +
        `together.`
    );
  }
  // A replacer function, not a replacement string: `$&` and `$1` in prose
  // would be read as capture references, and the shell is prose.
  return html.replace(MOUNT_POINT, () => `<div id="app">${body}</div>`);
}

/**
 * The languages the site is written in, and the `l-<lang>` class per language.
 *
 * Two, and the pair is the unit: a string authored in one language only renders
 * as a blank line to half the readers, which is why `verify_copy.mjs` holds
 * every `COPY` entry to both.
 */
export const LANGS = Object.freeze(["bg", "en"]);

/**
 * The language an entry declares, read off `<html data-lang="…">`.
 *
 * Read rather than assumed, so the step keeps telling the truth if an entry
 * ever declares something other than `bg` — the class it drops and the class
 * `tokens.css` hides have to be decided by the same attribute, or the served
 * page is in one language and styled for the other.
 *
 * @param {string} html  the built entry
 * @returns {"bg" | "en"}
 */
export function entryLang(html) {
  const found = /<html[^>]*\sdata-lang="([^"]*)"/.exec(html);
  if (!found || !LANGS.includes(found[1])) {
    throw new Error(
      `prerender: the entry declares data-lang=${JSON.stringify(found?.[1] ?? null)}, ` +
        `which is not one of ${LANGS.join(", ")}. That attribute is what ` +
        "`tokens.css` hides a language by and what this step keeps a language " +
        "by — guessing here serves a page whose markup and stylesheet disagree."
    );
  }
  return found[1];
}

/**
 * `body` with every element of a language other than `lang` removed.
 *
 * Kept pure and exported so `verify_static_assets.mjs` can test it without a
 * build — a generator with no test is a file nobody checks
 * (docs/testing-strategy.md).
 *
 * Two properties the naive version does not have, and each is one element away
 * from being wrong:
 *
 *   - **it drops whatever tag it matched, not `<span>`.** The pair is a span on
 *     all but one element in the tree: `ExplainerBand.svelte` writes the
 *     "read more" route to `/how/` as `<a class="how-more l-en">`, so a
 *     `<span`-keyed stripper leaves an English link in the crawler's copy of
 *     `/` and nothing anywhere reports it;
 *   - **it counts opens and closes of that tag**, rather than running to the
 *     first `</span>`. A non-greedy match closes a nested element on the
 *     child's tag and leaves the parent's closer behind as stray markup, which
 *     an HTML parser then reads as content escaping the element. `<b>` and
 *     `<a>` already nest inside these spans — `/legal/` carries
 *     `<span class="l-en"><b>Terms:</b> Permits reproduction…</span>` — so the
 *     scan has to reach past the first `</` either way.
 *
 * The dropped subtree is skipped rather than rescanned: a `.l-bg` element
 * inside a `.l-en` one goes with its parent, which is what the CSS does too.
 *
 * @param {string} body  the rendered page
 * @param {"bg" | "en"} lang  the language the entry declares
 * @returns {string}
 */
export function dropOtherLanguages(body, lang) {
  if (!LANGS.includes(lang)) {
    throw new Error(
      `prerender: ${JSON.stringify(lang)} is not a language this site is ` +
        `written in (${LANGS.join(", ")}), and stripping against it would ` +
        "leave the page with no prose at all."
    );
  }
  const doomed = LANGS.filter((other) => other !== lang).map((other) => `l-${other}`);
  // Attribute values are stepped over as quoted runs, so a `>` inside one does
  // not end the tag early.
  const START = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const kept = [];
  let cut = 0;
  let at = 0;
  for (;;) {
    START.lastIndex = at;
    const open = START.exec(body);
    if (!open) break;
    const [tag, name, attrs] = open;
    at = open.index + tag.length;
    const classes = (/\sclass="([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/);
    if (!doomed.some((cls) => classes.includes(cls))) continue;
    const end = attrs.endsWith("/") ? at : closeOf(body, name, at);
    kept.push(body.slice(cut, open.index));
    cut = end;
    at = end;
  }
  kept.push(body.slice(cut));
  return kept.join("");
}

/**
 * Where the element opened at `from` ends, counting its own tag both ways.
 *
 * An unclosed element **fails the build**. The rendered body comes from
 * Svelte's own server compiler, so unbalanced markup is a broken build rather
 * than input to render around — and the alternative is writing out a page
 * truncated at the element, which is the failure every other line of this step
 * is arranged against.
 *
 * @param {string} body
 * @param {string} name  the tag matched, and the only tag counted
 * @param {number} from  the index just past its opening tag
 * @returns {number}
 */
function closeOf(body, name, from) {
  const both = new RegExp(`<${name}((?:[^>"']|"[^"]*"|'[^']*')*)>|</${name}\\s*>`, "g");
  both.lastIndex = from;
  let depth = 1;
  for (let step; (step = both.exec(body));) {
    if (step[0].startsWith("</")) depth -= 1;
    else if (!step[1].endsWith("/")) depth += 1;
    if (depth === 0) return both.lastIndex;
  }
  throw new Error(
    `prerender: a <${name}> carrying a language class is never closed. The ` +
      "rendered body is Svelte's own output, so unbalanced markup here is a " +
      "broken build rather than a page to serve truncated."
  );
}

/**
 * The `loadAll()` result, read off disk instead of fetched.
 *
 * The manifest, never a directory listing, so this cannot hand a component a
 * payload the page has no row for — and `data.js` stays the only place a
 * `fetch` happens, because there is no fetch in a Node build step.
 *
 * A payload that will not parse **fails the build**. They are committed files
 * and the pipeline's own CI job parses every one, so an unreadable payload is a
 * broken checkout rather than a degraded network — and the alternative is
 * writing a page with a figure quietly missing from it, which is the failure
 * every other line of this file is arranged against.
 *
 * @param {string} dir  where the published JSONs live
 * @returns {Promise<Record<string, object>>} keyed by `PAYLOADS[].key`
 */
export async function readPayloads(dir = DATA) {
  const entries = await Promise.all(
    PAYLOADS.map(async (entry) => {
      const file = join(dir, `${entry.file}.json`);
      try {
        return [entry.key, JSON.parse(await readFile(file, "utf8"))];
      } catch (cause) {
        throw new Error(
          `prerender: cannot read ${file}. The published payloads are committed ` +
            "and the page is rendered from them at build time, so a missing one " +
            "is a broken checkout — not something to render around.",
          { cause }
        );
      }
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Compile each page for the server and return its rendered body.
 *
 * **Once per language, from one compile.** The words are a `.l-bg` / `.l-en`
 * pair and the strip below picks between them, but a number is not a pair:
 * `format.js` writes «22,323%» for a Bulgarian reader and "22.323%" for an
 * English one, off the `lang` store. That store has no document to read in a
 * Node build, so a single render writes Bulgarian decimals into the English
 * entry — a comma an English reader takes for a thousands separator, in a
 * document served to the consumer that executes nothing and can never be
 * corrected by the bundle. So the served language is handed to the root
 * component, which sets the store before the tree is rendered. The Vite compile
 * is the expensive half and it still happens once.
 *
 * @param {Record<string, object>} payloads  the `readPayloads()` result
 * @returns {Promise<Array<{pages: string[][], bodies: Record<string, string>}>>}
 */
export async function renderPages(payloads) {
  const { render } = await import("svelte/server");
  const out = [];
  for (const { name, source, pages } of PRERENDERED) {
    // One `build()` per page rather than one multi-entry SSR build. Vite's
    // multi-input SSR mode routes the components' CSS through the asset
    // pipeline, which then warns about every `url(/fonts/…)` it cannot resolve
    // — a screen of noise on a bundle whose stylesheet nobody ships, from a
    // step whose whole job is to be checkable. `build.ssr` pointed at one
    // entry leaves the CSS alone.
    await build({
      configFile: resolve(SITE, "vite.config.js"),
      root: SITE,
      logLevel: "warn",
      // The HTML entries are the client build's; this one is a single
      // JavaScript entry, and `publicDir` would copy the fonts a second time.
      publicDir: false,
      build: {
        ssr: resolve(SITE, source),
        outDir: SSR_OUT,
        emptyOutDir: true,
        // Neither applies to a bundle nobody ships: the maps would land outside
        // `dist/` where `strip-sourcemaps.mjs` cannot see them, and minifying
        // costs build time to shrink a file that is deleted next release.
        sourcemap: false,
        minify: false,
        rollupOptions: {
          input: resolve(SITE, source),
          output: { entryFileNames: `${name}.js` },
        },
      },
    });

    const { default: Component } = await import(pathToFileURL(join(SSR_OUT, `${name}.js`)).href);
    // `head` is deliberately dropped. It carries the component's `<title>`,
    // and the entry `.html` already has one; two title tags leave a crawler
    // reading whichever comes first, which is the same defect the description
    // comment in `App.svelte` names.
    const bodies = {};
    for (const servedLang of LANGS) {
      bodies[servedLang] = render(Component, {
        props: { prerender: true, payloads, servedLang },
      }).body;
    }
    out.push({ pages, bodies });
  }
  return out;
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
  const rendered = await renderPages(await readPayloads());
  for (const { pages, bodies } of rendered) {
    for (const page of pages) {
      const file = join(SITE, "dist", ...page);
      const html = await readFile(file, "utf8");
      const lang = entryLang(html);
      const body = bodies[lang];
      const one = dropOtherLanguages(body, lang);
      await writeFile(file, injectPrerender(html, one), "utf8");
      console.log(
        `[prerender] wrote dist/${page.join("/")} — ${one.length} bytes, ` +
          `${lang} only, from ${body.length} rendered`
      );
    }
  }
}
