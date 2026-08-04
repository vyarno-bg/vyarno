/**
 * The shared harness for every render suite that opens the app in a browser.
 *
 * `node --test` runs each file in its own process, so this module is evaluated
 * once per suite file and each gets its own Chromium and its own static server.
 * That is the cost of splitting the suite, and it buys file-level parallelism;
 * the alternative — one file holding a quarter of the site's test lines —
 * costs a reader who has to scroll past the strip, the basket and the payroll
 * cases to reach the one they came for.
 *
 * Requires the production build (`npm run build`) and a Chromium that
 * Playwright can launch. Where no browser is available the suites SKIP rather
 * than fail, so a contributor without one is not blocked; CI installs it and
 * therefore runs it. **Read the count, never the exit code** — a file of skips
 * exits 0 and looks exactly like a file of passes. `make render` gates on
 * `find-chromium.mjs` first, which is what stops a green `make check` from
 * covering a suite that skipped, and `check-test-floors.mjs` fails on a missing
 * report for the same reason.
 *
 * ## What these suites assert, and what they never do
 *
 * **Every assertion in them is on an EFFECT, never on a declaration.** A regex
 * over a `<style>` block — does `.stats` say `flex-wrap: wrap`, does `.stat`
 * carry a `flex-grow`, is `.wedge-marginal` filled — checks the cause and hopes
 * for the effect. A browser gives the effect directly: a computed style, a
 * bounding box, a rendered width. So they assert the thing that matters to a
 * reader, and they keep working when the same layout is achieved a different
 * way.
 *
 * That is the whole argument for running a browser at all: a grep for
 * `flex-wrap: wrap` goes red when someone switches to `grid` with `auto-fit`
 * and gets an identical page, and stays green when someone leaves the
 * declaration in place above a rule that overrides it.
 *
 * The other half is what nothing else can see. A keyed `{#each}` whose key
 * expression names a field the rows do not have evaluates every key to
 * `undefined`, which Svelte rejects at runtime — the page renders blank, and
 * six hundred tests stay green while the calculator shows nothing.
 *
 * Nothing here has a `test()` in it, and the filename carries no `verify_`
 * prefix, so `verify_suites.mjs` does not expect an npm script to run it.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { launchChromium } from "./find-chromium.mjs";
import { DIST, built } from "./render-dist.mjs";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

/** Serve `dist/` the way a static host does, including the 404 fallback. */
function serveDist() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split("?")[0]));
    if (path.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    for (const candidate of [join(DIST, path), join(DIST, path, "index.html")]) {
      try {
        if (!(await stat(candidate)).isFile()) continue;
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(candidate)] ?? "text/plain" });
        res.end(await readFile(candidate));
        return;
      } catch {
        /* try the next candidate */
      }
    }
    res.writeHead(404).end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/**
 * A Chromium, or null when none can be launched here.
 *
 * The search order lives in `find-chromium.mjs` and is shared with the one
 * `make render` runs before this suite. Both have to agree on what "there is a
 * browser" means, or the gate passes and the suite still skips.
 */
async function launch() {
  return (await launchChromium())?.browser ?? null;
}

const browser = built ? await launch() : null;
const site = browser ? await serveDist() : null;
const origin = site ? `http://127.0.0.1:${site.port}` : "";

/**
 * What "this page has finished loading" MEANS, per entry.
 *
 * **A page is ready when its own state says so, never when a duration is up.**
 * `networkidle` cannot answer the question here: it fires 500 ms after the last
 * request settles, and a page whose bundle is still executing has made no
 * request at all — `onMount(calc.load)` has not run, so `loadAll()` has not been
 * called, so there is nothing outstanding to hold the wait open. A fixed sleep
 * after it is a bet on how fast the machine is, and the machine that loses it is
 * a Windows CI runner. Measured under a 10x CPU throttle the app is still on its
 * loading placeholder a second after `networkidle`; at 20x it is still there
 * several seconds later. The tests that type into an input buy themselves that
 * time by accident, which is why the ones that assert immediately are the only
 * ones that ever went red.
 *
 * Each predicate has to prove two things — the client mounted, and the payloads
 * arrived — and the entries differ in which elements can prove them:
 *
 * - **`/`** — `.m-grid` is never prerendered (`App.svelte` renders the whole
 *   calculator region empty under `prerender`, because its output belongs to the
 *   reader), so its presence is both facts at once. `.load-fail` is the other
 *   terminal state and belongs in the predicate too: without it a genuine load
 *   failure hangs the wait instead of failing the assertion that was going to
 *   catch it.
 * - **`/how/`** — everything on it IS prerendered, so no element proves the
 *   client ran. `document.readyState === "complete"` does: a module script has
 *   executed by the time `load` fires, so `how-main.js` has already emptied
 *   `#app` and mounted over it, and the payload-gated table below is therefore
 *   the live one rather than the frozen copy it replaced. A bundle that never
 *   executed at all would leave the prerendered table standing and satisfy this
 *   — that case is caught by the error list, which every test in this file
 *   asserts is empty, and by `verify_static_assets.mjs`.
 * - **`/legal/` and `/support/`** — prerendered for the same reason and waited
 *   for the same way. Their prose is assembled from in-repo constants rather
 *   than from a payload, which changes nothing about what a predicate has to
 *   prove: the build already put the documents and the ask inside `#app`, so a
 *   check for a child of `#app` is satisfied before the bundle has run and the
 *   suites below would be asserting against markup frozen at build time —
 *   including the counts that exist to catch a bootstrap that stopped emptying
 *   it, which is exactly the state that reads as green.
 * - **everything else** — `#app` having any child. Every entry the build
 *   prerenders is named above, so a route that falls through to this either has
 *   no prerender (the `noindex` 404) or has just been added without its
 *   predicate.
 */
export const READY = {
  "/": () => document.querySelector(".m-grid, .load-fail") !== null,
  "/how/": () =>
    document.readyState === "complete" && document.querySelector("#basket table") !== null,
  "/legal/": () =>
    document.readyState === "complete" && document.querySelector("main.legal article") !== null,
  "/support/": () =>
    document.readyState === "complete" && document.querySelector("main.support h1") !== null,
};

/** The default: the client put something where the entry left an empty mount. */
const MOUNTED = () => document.querySelector("#app > *") !== null;

/**
 * Open the calculator with console and page errors collected.
 *
 * The error list is the point of the suite: a component that throws during
 * render leaves the surrounding markup in place, so asserting on elements
 * alone would pass on a page the visitor sees as half-drawn.
 */
export async function openApp(path = "/", context = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, ...context });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY[path] ?? MOUNTED);
  return { page, errors };
}

/**
 * Run `fn` against a freshly-opened page.
 *
 * One server for the whole file — it is stateless and reading `dist/` twenty
 * times is not the thing worth isolating. Each test gets its OWN page, because
 * they type into the same inputs and `localStorage` carries the language and
 * theme across a reload.
 *
 * `context` reaches Playwright's context options, which is how a test asks for
 * a reader the default page cannot represent — `reducedMotion: "reduce"` is the
 * one in use, because `tokens.css` drops every transition for them and an
 * affordance built out of motion is invisible to that reader while passing
 * every other test in this file.
 */
export async function withApp(fn, path = "/", context = {}) {
  const { page, errors } = await openApp(path, context);
  try {
    await fn(page, errors);
  } finally {
    await page.close();
  }
}
export const skip = !built
  ? "no dist/ — run `npm run build` first"
  : !browser
    ? "no Chromium available to Playwright"
    : false;

/**
 * Release the browser and the server.
 *
 * Registered by each suite file as `test.after(shutdown)` rather than here, so
 * a reader of that file can see that its process cleans up after itself — a
 * hook installed by an import is one nobody remembers is there when a suite
 * starts hanging.
 */
export async function shutdown() {
  await browser?.close();
  site?.server.close();
}
