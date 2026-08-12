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
 * **`--test-concurrency=2` in `package.json`, and the reason is Windows.** With
 * the runner's default — one process per core — four Chromiums and four servers
 * run at once, and every test opens a FRESH browser context (it has to; see
 * `withApp`), so no connection is ever reused between tests. A run is therefore
 * on the order of a hundred page loads times a dozen assets, in four processes,
 * against four loopback servers. On a Windows CI runner that exhausts the
 * socket pool: an asset request comes back `net::ERR_NO_BUFFER_SPACE`, the
 * bundle never finishes, and `openApp`'s predicate times out thirty seconds
 * later in whichever suite happened to be unlucky — twice observed, in two
 * different files, on two different branches.
 *
 * The cap halves the peak rather than proving the ceiling gone, and that is the
 * honest description of it: the failure cannot be reproduced on Linux, so what
 * was measured is the cost (37s to 43s locally, against 78s at
 * `--test-concurrency=1`) and not the cure. If it recurs, 1 is the next step
 * and the argument for it is already here.
 *
 * It lives in the npm script rather than in the Windows job so that `make
 * check` and CI run the identical command — and because the flag is silently
 * IGNORED when appended after the file list, which is the shape a CI-only fix
 * would have taken and would have looked applied without being.
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
 * - **`/market/`** — prerendered too, and its figure tables are built from the
 *   payloads, so `#app` having a child is true before the bundle has run and
 *   every assertion in `verify_render_market.mjs` would be reading markup
 *   frozen at build time. The city table is what proves the client ran and
 *   fetched: `nsi_housing.json` reaches the page through `loadAll("market")`,
 *   and a bundle that never executed leaves the prerendered copy standing —
 *   which the collected error list, asserted empty by every test in that file,
 *   is what catches.
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
const READY_BY_ROUTE = {
  "/": () => document.querySelector(".m-grid, .load-fail") !== null,
  "/how/": () =>
    document.readyState === "complete" && document.querySelector("#basket table") !== null,
  "/market/": () =>
    document.readyState === "complete" &&
    document.querySelector("#prices table.fig-table") !== null,
  "/legal/": () =>
    document.readyState === "complete" && document.querySelector("main.legal article") !== null,
  "/support/": () =>
    document.readyState === "complete" && document.querySelector("main.support h1") !== null,
};

/**
 * The predicates above, at both addresses each route is served at.
 *
 * A route's English entry mounts the same component over the same payloads, so
 * what proves it ready is the same element — the two differ in the head tags,
 * the `data-lang` and which half of every string the build left in. Deriving
 * the `/en/` half rather than restating it is what keeps a predicate from being
 * updated on one page and forgotten on the other, which would leave a suite
 * waiting on an element the component stopped rendering and reporting it as a
 * page that never became ready.
 */
export const READY = Object.fromEntries(
  Object.entries(READY_BY_ROUTE).flatMap(([route, ready]) => [
    [route, ready],
    [`/en${route}`, ready],
  ])
);

/** The default: the client put something where the entry left an empty mount. */
const MOUNTED = () => document.querySelector("#app > *") !== null;

/**
 * What the page was doing when its readiness predicate ran out of time.
 *
 * A `waitForFunction` timeout reports that the wait expired and nothing else —
 * its `log` is empty for this call — and the console errors collected since
 * `newPage` go out of scope with the throw. So the bare failure cannot tell a
 * bundle that threw from a request that 404'd, from a document that never
 * finished loading, from a runner that was merely slow, and those want four
 * different answers. The suite that reports it is whichever one happened to
 * hold the page, which is a fifth misleading thing: the failure names a test
 * about the share card when nothing about the share card is involved.
 *
 * **Every read here is defensive, and the failure being described is why.**
 * This runs against a page that has already missed one deadline, so the
 * evaluate can hang or reject in its turn. A diagnostic that throws replaces
 * the real error with its own and takes the collected list with it; one that
 * hangs turns a bounded thirty-second failure into a job only the workflow's
 * `timeout-minutes` stops, which is the outcome `ci.yml` argues against at
 * length. Hence the race, and hence a caught rejection becoming part of the
 * message rather than an escape.
 */
async function whyNotReady(page, path, errors) {
  // The timer is held and cleared rather than left to expire. `unref()` is the
  // tempting way to keep a pending timer from holding the process open, and it
  // is wrong here: it lets Node reach an idle loop and exit while this await is
  // still unsettled, so a browser that died — the very case the bound exists
  // for — ends the run with an unsettled-top-level-await code instead of the
  // report. Clearing it on settle bounds the wait AND leaves nothing behind.
  let timer;
  const state = await Promise.race([
    page
      .evaluate(() => {
        const app = document.querySelector("#app");
        return {
          readyState: document.readyState,
          title: document.title,
          mount: app ? `#app has ${app.childElementCount} child element(s)` : "no #app element",
          html: app ? app.innerHTML.replace(/\s+/g, " ").trim().slice(0, 200) : "",
        };
      })
      .catch((e) => ({ unreadable: String(e) })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ unreadable: "the page did not answer in 5s" }), 5000);
    }),
  ]).finally(() => clearTimeout(timer));

  return [
    `${path} never became ready — its predicate stayed false for the whole wait.`,
    `page: ${JSON.stringify(state)}`,
    errors.length
      ? `collected page errors:\n  ${errors.join("\n  ")}`
      : "collected page errors: none, so the bundle did not throw and no request " +
        "failed — a page that had not finished rather than one that broke.",
  ].join("\n");
}

/**
 * Open the calculator with console and page errors collected.
 *
 * The error list is the point of the suite: a component that throws during
 * render leaves the surrounding markup in place, so asserting on elements
 * alone would pass on a page the visitor sees as half-drawn.
 */
export async function openApp(path = "/", context = {}, before = null) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, ...context });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  // The one hook that has to run BEFORE the navigation: a `page.route` set
  // afterwards misses the fetches `onMount` has already issued. It exists for
  // the load-failure state, which is a state readers reach and which no suite
  // could open without it — `READY["/"]` has waited on `.load-fail` all along
  // and nothing was able to produce one.
  if (before) await before(page);
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(READY[path] ?? MOUNTED);
  } catch (cause) {
    // The wait itself is unchanged: the deadline that fires here is the one
    // that fired before. Raising it would hide the case this exists to name —
    // a page that never mounts is a broken page whatever the budget, and a
    // longer one only postpones the same empty report.
    throw new Error(await whyNotReady(page, path, errors), { cause });
  }
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
export async function withApp(fn, path = "/", context = {}, before = null) {
  const { page, errors } = await openApp(path, context, before);
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
