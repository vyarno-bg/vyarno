#!/usr/bin/env node
/**
 * Post-build step: render the two content pages into `dist/`, with the
 * published figures already in them, so there is a page before the bundle runs.
 *
 * ## The failure this fixes
 *
 * `index.html`'s `<body>` is `<div id="app"></div>` and a `<noscript>`. Every
 * word the calculator says — «лична инфлация», «колко години заплата за
 * жилище», «данъчна тежест» — is inside the JavaScript bundle, so a crawler
 * that does not execute scripts sees a page with no subject. Googlebot renders
 * JavaScript on a second pass and gets there eventually; Bingbot's second pass
 * is slower and less reliable, and a Bulgarian-language product that search
 * engines cannot read is invisible to the people it is for.
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
 *   - **the freshness verdict.** `view.js#dataAge` compares each payload's
 *     `as_of` against its cadence and the current time, and the build's clock
 *     is not the reader's. A page stamped "fresh" at build time still says so
 *     three months later. `Calculator`'s seeded constructor therefore leaves
 *     `dataRows` empty and the staleness banner down; the bundle computes both
 *     against the reader's own clock, which is the only one that answers the
 *     question.
 *
 * ## Why a second build rather than hydration
 *
 * `mount()` appends to its target, so `main.js` empties `#app` first and the
 * client renders from scratch. `hydrate()` is the conventional answer and it
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
 * Both are content pages carrying published figures; `/legal/`, `/support/`
 * and the 404 are prose the bundle assembles from constants, so a crawler that
 * runs no JavaScript loses nothing that a build could have given it. Adding a
 * row here is what puts a page in front of a crawler — and `verify_render.mjs`
 * reads each written file back, because a post-build step that quietly does
 * nothing looks exactly like a build that worked.
 */
export const PRERENDERED = Object.freeze(
  [
    { name: "app", source: "src/App.svelte", page: ["index.html"] },
    { name: "how", source: "src/How.svelte", page: ["how", "index.html"] },
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
      `prerender: no ${MOUNT_POINT} in the built index.html. The shell has ` +
        `nowhere to go, and main.js mounts into #app — both have to move together.`
    );
  }
  // A replacer function, not a replacement string: `$&` and `$1` in prose
  // would be read as capture references, and the shell is prose.
  return html.replace(MOUNT_POINT, () => `<div id="app">${body}</div>`);
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
 * @param {Record<string, object>} payloads  the `readPayloads()` result
 * @returns {Promise<Array<{page: string[], body: string}>>}
 */
export async function renderPages(payloads) {
  const { render } = await import("svelte/server");
  const out = [];
  for (const { name, source, page } of PRERENDERED) {
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
    out.push({ page, body: render(Component, { props: { prerender: true, payloads } }).body });
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
  for (const { page, body } of rendered) {
    const file = join(SITE, "dist", ...page);
    await writeFile(file, injectPrerender(await readFile(file, "utf8"), body), "utf8");
    console.log(`[prerender] wrote dist/${page.join("/")} — ${body.length} bytes`);
  }
}
