#!/usr/bin/env node
/**
 * Post-build step: render the page's data-independent shell into
 * `dist/index.html`, so there is something on the page before the bundle runs.
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
 * **Only what does not depend on a published payload.** The shell renders with
 * `data = {}`, which is the state the calculator is in before `loadAll()`
 * returns, and two subtrees say something false in that state:
 *
 *   - the calculator itself. Before the payloads arrive it is a loading line,
 *     and after they arrive it is figures. Baking either into served HTML puts
 *     a placeholder in a search result or freezes a number that nothing
 *     refreshes (docs/principles.md P3, P4), so `App.svelte` renders that
 *     region empty under `prerender`;
 *   - the explainer's formula block. Its branches are chosen by the anchor and
 *     by which index the savings figure was deflated by, and its deposit share
 *     comes from the published БНБ limits. With no payloads it states the
 *     13-groups-summed method over Eurostat's all-items index, which is not
 *     the method the live page uses — a wrong claim about our own arithmetic,
 *     served to whoever reads the HTML rather than runs it.
 *
 * What is left is the header, the h1, the privacy line, the whole of the
 * explainer's prose and the footer with its upstream attribution: around 17 kB
 * of real Bulgarian and English text that is otherwise reachable only by
 * executing the bundle.
 *
 * ## Why a second build rather than hydration
 *
 * `mount()` appends to its target, so `main.js` empties `#app` first and the
 * client renders from scratch. `hydrate()` is the conventional answer and it
 * is not what this wants: the server deliberately renders LESS than the client
 * does on its first frame, which is a hydration mismatch by construction, and
 * `<svelte:head>` would have to be injected too — leaving the page with two
 * `<title>` tags, the trap `App.svelte` already carries a comment about for
 * `<meta name="description">`. Discarding ~17 kB of already-parsed DOM costs a
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

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");

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
 * The empty mount point in `index.html`, and the one thing this step needs to
 * find. A build that renamed or reshaped it would otherwise write a page whose
 * markup is silently unchanged.
 */
export const MOUNT_POINT = '<div id="app"></div>';

/**
 * `html` with `body` placed inside the mount point.
 *
 * Kept pure and exported so `verify_static_assets.mjs` can test it without a
 * build — a generator with no test is a file nobody checks
 * (docs/testing-strategy.md). It throws rather than returning the input
 * unchanged: a prerender that quietly did nothing is the failure this whole
 * step exists to prevent, and it looks exactly like a successful build.
 *
 * @param {string} html  the built `dist/index.html`
 * @param {string} body  the rendered shell
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
 * Compile `App.svelte` for the server and return its rendered shell.
 *
 * @returns {Promise<string>}
 */
export async function renderShell() {
  await build({
    configFile: resolve(SITE, "vite.config.js"),
    root: SITE,
    logLevel: "warn",
    // The four HTML entries are the client build's; this one has a single
    // JavaScript entry, and `publicDir` would copy the fonts a second time.
    publicDir: false,
    build: {
      ssr: resolve(SITE, "src/App.svelte"),
      outDir: SSR_OUT,
      emptyOutDir: true,
      // Neither applies to a bundle nobody ships: the maps would land outside
      // `dist/` where `strip-sourcemaps.mjs` cannot see them, and minifying
      // costs build time to shrink a file that is deleted next release.
      sourcemap: false,
      minify: false,
      rollupOptions: {
        input: resolve(SITE, "src/App.svelte"),
        output: { entryFileNames: "app.js" },
      },
    },
  });

  const { default: App } = await import(pathToFileURL(join(SSR_OUT, "app.js")).href);
  const { render } = await import("svelte/server");
  // `head` is deliberately dropped. It carries `App.svelte`'s `<title>`, and
  // `index.html` already has one; two title tags leave a crawler reading
  // whichever comes first, which is the same defect the description comment in
  // `App.svelte` names.
  return render(App, { props: { prerender: true } }).body;
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
  const page = join(SITE, "dist", "index.html");
  const body = await renderShell();
  await writeFile(page, injectPrerender(await readFile(page, "utf8"), body), "utf8");
  console.log(`[prerender] wrote the shell into dist/index.html — ${body.length} bytes`);
}
