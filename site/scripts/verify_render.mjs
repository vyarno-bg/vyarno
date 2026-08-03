/**
 * The one suite that runs the app.
 *
 * Everything else in `npm run verify:math` tests a module in isolation, and the
 * contract suite under `pipeline/tests/` reads the templates as text. Neither
 * can see a page that fails to render — and one did: a keyed `{#each}` block
 * whose key expression named a field the rows do not have produced `undefined`
 * for every key, which Svelte rejects at runtime. Six hundred tests were green
 * and the calculator was blank.
 *
 * So this loads the built page in a real browser and asserts the things that
 * only exist once it has rendered: no console errors, every region present,
 * and the numbers responding to input. It is deliberately shallow — it is a
 * smoke test, not a substitute for the unit suites — and it is the only place
 * a rendering failure can be caught.
 *
 * Requires the production build (`npm run build`) and a Chromium that
 * Playwright can launch. Where no browser is available the suite skips rather
 * than fails, so a contributor without one is not blocked; CI installs it and
 * therefore runs it. `make render` gates on `find-chromium.mjs` first, which is
 * what stops a green `make check` from covering a suite that skipped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { launchChromium } from "./find-chromium.mjs";
// The page dates a figure with this, so an assertion about what a crawler reads
// has to write the month the same way rather than approximating the format.
import { periodLong } from "../src/lib/format.js";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(SITE, "dist");

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

let built = true;
try {
  await stat(join(DIST, "index.html"));
} catch {
  built = false;
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
 * - **everything else** — `/legal/` and `/support/` are not prerendered and read
 *   no payload, so `#app` having any child is the whole of it.
 */
const READY = {
  "/": () => document.querySelector(".m-grid, .load-fail") !== null,
  "/how/": () =>
    document.readyState === "complete" && document.querySelector("#basket table") !== null,
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
async function openApp(path = "/", context = {}) {
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
async function withApp(fn, path = "/", context = {}) {
  const { page, errors } = await openApp(path, context);
  try {
    await fn(page, errors);
  } finally {
    await page.close();
  }
}

const skip = !built
  ? "no dist/ — run `npm run build` first"
  : !browser
    ? "no Chromium available to Playwright"
    : false;

// ---------------------------------------------------------------------------
// The prerendered pages — the built HTML as a crawler reads it.
//
// `scripts/prerender.mjs` renders `App.svelte` and `How.svelte` on the server
// at build time, so the two content pages carry their prose AND the country's
// figures before the bundle runs. The assertions below hold the rule from both
// sides — what has to be there, and what may never be — and they need the
// build rather than a browser. That the pages still work once the bundle
// replaces them is a browser test and sits further down.
//
// **The rule is that a payload may decide a prerendered figure, and neither
// the reader nor the clock may.** The wider version — refuse every figure a
// payload decides, because a number frozen at build time is a second source of
// truth for one P3 and P4 govern — is the one that suggests itself, and the
// build's own order is what makes it wrong: `package.json`'s `build` runs
// `vite build`, then `prerender.mjs`, then `copy-data.mjs`, which copies the
// same `data/published/*.json` the prerender just read into
// `dist/data/published/` for the bundle to fetch. One build, one set of files,
// both ends. What the tests below still refuse is what no payload decides: the
// calculator's output belongs to the reader (P7 — the €900 is a placeholder,
// not a survey figure), and the freshness verdict belongs to their clock.
//
// `COPY` is imported rather than quoted, so this checks the rule (the page
// carries its own copy) instead of pinning sentences that can be rewritten for
// a good reason tomorrow. The FIGURES are read back out of the payloads in
// `dist/`, for the same reason: the assertion is that the served HTML agrees
// with the JSON shipped beside it, not that it says 4.1%.
// ---------------------------------------------------------------------------

const needsBuild = built ? false : "no dist/ — run `npm run build` first";
const { COPY } = built
  ? await import(pathToFileURL(join(SITE, "src", "lib", "content.js")).href)
  : { COPY: null };

/** A payload as the deploy serves it, from `dist/`, not from the repo. */
async function shipped(name) {
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
async function servedText(...page) {
  const html = await readFile(join(DIST, ...page), "utf8");
  return html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

test(
  "the built page carries its prose without running any JavaScript",
  { skip: needsBuild },
  async () => {
    const html = await readFile(join(DIST, "index.html"), "utf8");
    for (const [what, text] of [
      ["the headline", COPY.h1.bg],
      ["the headline in English", COPY.h1.en],
      ["the privacy line", COPY.privacy.bg],
      ["the explainer's lead", COPY.explainLead.bg],
      ["the explainer's lead in English", COPY.explainLead.en],
      ["the upstream attribution", COPY.footerNote.bg],
    ]) {
      assert.ok(
        html.includes(text),
        `${what} is not in the served HTML. Bingbot's second pass is slow and ` +
          "unreliable, so a page whose every word is inside the bundle has no " +
          "subject for it to index at all — see docs/seo.md."
      );
    }
  }
);

test(
  "the built page carries the national figures, and each one is dated",
  { skip: needsBuild },
  async () => {
    // The point of the amendment, asserted against the payloads shipped in the
    // SAME dist/ — so this goes red if the prerender ever stops reading them,
    // and stays green through every refresh.
    const html = await servedText("index.html");
    const [headline, categories, unemployment] = await Promise.all(
      ["hicp_headline", "hicp_categories", "unemployment"].map(shipped)
    );

    // The rate as the page prints it: Bulgarian decimal comma, one place. The
    // prerender renders in the default language, which is BG.
    const bgDecimal = (x) => x.toFixed(1).replace(".", ",");
    const fastest = categories.categories.reduce((a, b) =>
      b.annual_rate_pct > a.annual_rate_pct ? b : a
    );
    for (const [what, text] of [
      ["the headline inflation rate", `${bgDecimal(headline.headline_rate_pct)}%`],
      ["the month the headline describes", headline.ref_period],
      ["the unemployment rate", `${bgDecimal(unemployment.value)}%`],
      ["the month unemployment describes", unemployment.ref_period],
      ["the fastest-rising division's name", fastest.bg_name],
      ["the fastest-rising division's name in English", fastest.en_name],
    ]) {
      assert.ok(
        html.includes(text),
        `${what} is not in the served HTML, though dist/data/published/ carries ` +
          "it. The strip is the page's answer to a crawler and to an agent " +
          "citing it — see docs/seo.md §'The rule'."
      );
    }

    // Every card is dated and every card links out. A figure without its
    // reference period on screen is the one thing that could make a page that
    // outlived its data silently wrong rather than visibly behind (P3, P4).
    assert.ok(
      html.includes("eurostat/api/dissemination"),
      "the prerendered strip carries no Eurostat verify link, so a reader of " +
        "the HTML has a figure with nothing to check it against (P3)"
    );
  }
);

test("the built page bakes in nothing the reader decides", { skip: needsBuild }, async () => {
  const html = await readFile(join(DIST, "index.html"), "utf8");
  assert.ok(
    !html.includes(COPY.loadingK.bg),
    "the loading placeholder is in the served HTML. It is what the calculator " +
      "region renders before the payloads arrive, and a crawler would index it " +
      "as the page's content."
  );
  // The calculator region itself. Its figures are computed from the €900 in
  // the pay field, which the copy under it asks the reader to replace — a
  // worked example, not a survey figure (P7). Serving one is publishing an
  // answer to a question nobody asked.
  for (const [what, marker] of [
    ["the pay field", 'class="m-pay'],
    ["the inputs card", 'class="m-inputs'],
    ["the results card", 'class="m-results'],
    ["the basket sliders", 'id="sliders"'],
  ]) {
    assert.ok(
      !html.includes(marker),
      `${what} is in the served HTML. Everything in that region is a function ` +
        "of what the reader typed, and at build time nobody has."
    );
  }
  // The freshness verdict, which is a function of the clock rather than of a
  // payload. A page stamped "fresh" the day it was built goes on saying so for
  // as long as it is served, and the reader's own tab is the only place that
  // question can be answered.
  assert.ok(
    !html.includes(COPY.dataPanelToggle.bg),
    "the per-payload freshness panel is in the served HTML. Its rows are " +
      "computed against the build's clock, not the reader's — see the seeded " +
      "constructor in calculator.svelte.js."
  );
});

test(
  "the prerendered formula block names the method the page actually used",
  { skip: needsBuild },
  async () => {
    // The half of the old rule that was genuinely about a false statement
    // rather than about staleness — and the reason it is now served rather
    // than withheld. With no payloads the block says the rise since 2020 is
    // the 13 groups summed at their official weights; the page in front of the
    // reader deflates by Eurostat's all-items index, which the build now has.
    const html = await readFile(join(DIST, "index.html"), "utf8");
    const headline = await shipped("hicp_headline");
    assert.ok(
      html.includes(COPY.explainMath.bg) && html.includes('class="fx"'),
      "the explainer's formula block is missing from the served HTML. " +
        "Publishing the method is the §9.2 obligation ExplainerBand names, and " +
        "with the payloads in hand every branch of it is true."
    );
    assert.ok(
      Object.keys(headline.index_by_year ?? {}).length > 0,
      "hicp_headline.json carries no index, so the assertion below is about " +
        "a branch the page could not have taken"
    );
    assert.ok(
      html.includes("prc_hicp_minr, TOTAL"),
      "the served formula block does not name the all-items index. That is " +
        "the fallback branch — the 13 groups summed — and it describes a " +
        "method the page did not use."
    );
  }
);

test(
  "the second page carries the country's figures, without JavaScript",
  { skip: needsBuild },
  async () => {
    // `/how/` exists to answer the informational queries the calculator cannot
    // rank for, which it can only do if the answers are in the HTML. Read back
    // against the shipped payloads rather than pinned to today's numbers.
    const html = await servedText("how", "index.html");
    const [categories, payroll, price, mortgage] = await Promise.all(
      ["hicp_categories", "payroll", "sofia_price", "mortgage"].map(shipped)
    );

    for (const [what, text] of [
      ["the page's own title", COPY.howTitle.bg],
      ["the upstream attribution", COPY.footerNote.bg],
      ["the wedge table's heading", COPY.howColEffective.bg],
      ["the wedge table's heading in English", COPY.howColEffective.en],
      ["the ladder's modelled marker", COPY.howModelled.bg],
      ["the Eurostat derivation disclosure", COPY.howOurs.bg],
      ["the Eurostat derivation disclosure in English", COPY.howOurs.en],
    ]) {
      assert.ok(html.includes(text), `${what} is not in the served HTML of /how/`);
    }

    // Both languages, in the DOM at once. A missing string renders as a blank
    // line rather than a fallback, and on this page the blank line would be
    // half the content — which nobody looking at the rendered page in their own
    // language would ever see.
    for (const [what, text] of [
      ["the lead heading", "Числата за България"],
      ["the lead heading in English", "Bulgaria's numbers"],
    ]) {
      assert.ok(html.includes(text), `${what} is not in the served HTML of /how/`);
    }

    // The figures, each read out of the payload the same build shipped.
    const bgInt = (x) => Math.round(x).toLocaleString("bg-BG", { maximumFractionDigits: 0 });
    for (const [what, text] of [
      ["a division's official weight", `${categories.categories[0].weight_pct}`.replace(".", ",")],
      ["the insurance ceiling", bgInt(payroll.max_insurable_income_eur)],
      ["the Sofia €/m² median", bgInt(price.eur_per_m2_median)],
      ["the new-business mortgage rate", `${mortgage.new_business.value_pct}`.replace(".", ",")],
      ["the month the mortgage rate describes", "2026"],
    ]) {
      assert.ok(
        html.includes(text),
        `${what} is not in the served HTML of /how/, though the payload beside ` +
          "it carries the figure"
      );
    }
  }
);

test(
  "the second page blames the right thing for the gap a reader can see",
  { skip: needsBuild },
  async () => {
    // §инфлацията prints Eurostat's all-items headline beside Σ(w·r) over the 13
    // divisions and then explains why they differ. The January re-weighting and
    // the December chain link account for ~0.16 pp of it — but only when the two
    // describe the SAME month. Eurostat's flash publishes the all-items rate
    // about two weeks ahead of any division, and on a payload pair split that
    // way the two figures are several times further apart, almost all of it the
    // fortnight. A paragraph that names the re-weighting either way is true and
    // is not the reason for what is on screen, in the one place a reader who
    // spotted the gap went to look.
    //
    // Asserted against the payloads shipped in the SAME dist/, so it follows
    // whichever state Eurostat's calendar is in on the day rather than pinning
    // today's. Both branches are checked here because both ship: only one of
    // them is reachable per build, and the unreachable one is the sentence that
    // would be wrong.
    const html = await servedText("how", "index.html");
    const [headline, categories] = await Promise.all(
      ["hicp_headline", "hicp_categories"].map(shipped)
    );
    const headlineMonth = String(headline.ref_period ?? "");
    const basketMonth = String(categories.categories?.[0]?.ref_period ?? "");
    assert.ok(headlineMonth && basketMonth, "a payload carries no reference period to compare");

    if (headlineMonth === basketMonth) {
      assert.ok(
        html.includes(COPY.explainSameMonth.bg) && html.includes(COPY.explainSameMonth.en),
        "the two figures describe one month and the page does not say so — the " +
          "reassurance that they are comparable is the whole of why the " +
          "re-weighting is then the entire explanation"
      );
      return;
    }

    // The prerender renders in BG, and `periodLong` is what the page dates a
    // figure with — so these are the exact strings a crawler reads.
    for (const month of [headlineMonth, basketMonth]) {
      assert.ok(
        html.includes(periodLong(month, "bg")),
        `the served /how/ never names ${periodLong(month, "bg")}. The headline ` +
          `is at ${headlineMonth} and the divisions at ${basketMonth}, so most ` +
          "of the gap the page prints is the month rather than the method, and " +
          "the prose has to say which month each figure is"
      );
    }
    assert.ok(
      !html.includes(COPY.explainSameMonth.bg),
      "the page tells the reader both figures are for the same latest month " +
        `while shipping ${headlineMonth} beside ${basketMonth}`
    );
  }
);

test(
  "a served page's head carries one title, one description, one canonical",
  { skip: needsBuild },
  async () => {
    // What a crawler that runs nothing reads. The prerender deliberately drops
    // the component's `<svelte:head>` (`prerender.mjs`), so the head a crawler
    // gets is the entry file's alone — which makes this the check on the entry
    // files themselves, where a second description arrives by somebody adding
    // one next to an og:description they were already editing. The runtime half
    // of the same rule is a browser test further down, because `<svelte:head>`
    // reaches the head only once the bundle runs.
    for (const page of [["index.html"], ["how", "index.html"], ["legal", "index.html"]]) {
      const html = await readFile(join(DIST, ...page), "utf8");
      const where = page.join("/");
      for (const [what, pattern] of [
        ["<title>", /<title[\s>]/g],
        ['<meta name="description">', /<meta[^>]+name="description"/g],
        ['<link rel="canonical">', /<link[^>]+rel="canonical"/g],
      ]) {
        assert.equal(
          (html.match(pattern) ?? []).length,
          1,
          `${where} does not carry exactly one ${what}, and a crawler reads the first`
        );
      }
    }
  }
);

test("the second page has no input on it at all", { skip: needsBuild }, async () => {
  // The whole basis for prerendering `/how/` in full is that nothing on it is
  // the reader's. An input would end that quietly: the page would still render,
  // the tests above would still pass, and the served HTML would start carrying
  // a default somebody chose (P7) or a figure derived from one (P2).
  const html = await readFile(join(DIST, "how", "index.html"), "utf8");
  const body = html.slice(html.indexOf('<div id="app">'));
  for (const tag of ["<input", "<textarea", "<select", "contenteditable"]) {
    assert.ok(
      !body.includes(tag),
      `/how/ renders a ${tag} — the page is a reference with no reader in it, ` +
        "and every figure on it is prerendered on exactly that basis"
    );
  }
});

test("every post-build step left the file it exists to write", { skip: needsBuild }, async () => {
  // A post-build step that does nothing exits 0, and `npm run build` reports
  // success — so the only thing that can catch one is reading `dist/`
  // afterwards. The shape it takes is a run-directly guard that stops matching:
  // `` `file://${process.argv[1]}` `` is not a URL on Windows, where Node hands
  // argv[1] a native `D:\a\...` path, so the step is skipped on one platform
  // and nowhere else. Both generators use `pathToFileURL` for that reason.
  //
  // Named files rather than a count, because the failure is one step going
  // quiet while the rest still run.
  for (const [what, file, mustContain] of [
    ["the sitemap", "sitemap.xml", "<loc>https://vyarno.bg/</loc>"],
    ["the build stamp", "version.json", '"commit"'],
    ["the published payloads", join("data", "published", "hicp_headline.json"), '"as_of"'],
  ]) {
    const body = await readFile(join(DIST, file), "utf8").catch(() => null);
    assert.ok(body !== null, `${what} is not in dist/ — the step that writes it did not run`);
    assert.ok(
      body.includes(mustContain),
      `${what} is in dist/ but does not carry ${mustContain}, so the step ran and wrote nothing useful`
    );
  }
});

test("the built page mounts over the shell rather than beside it", { skip }, async () => {
  await withApp(async (page, errors) => {
    // One of each landmark. `mount()` appends, so a build that stopped
    // emptying #app would draw the header, the explainer and the footer twice
    // — with the second copy live and the first one frozen at build time.
    for (const [what, selector] of [
      ["header", "header.site"],
      ["h1", "main h1"],
      ["explainer band", ".explain-band"],
      ["footer", "footer.site"],
    ]) {
      assert.equal(await page.locator(selector).count(), 1, `${what} appears twice`);
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  });
});

test("the calculator renders with no console errors", { skip }, async () => {
  await withApp(async (page, errors) => {
    // Every region, so a component that silently rendered nothing is caught.
    for (const [what, selector] of [
      ["skip link", "a.skip"],
      ["header", "header.site"],
      ["as-of strip", ".data-strip"],
      ["pay field", ".m-grid .m-pay"],
      ["inputs card", ".m-grid .m-inputs"],
      ["results card shell", ".m-grid .m-results"],
      ["basket sliders", "#sliders .cat"],
      ["results card", ".r-big"],
      ["result rows", ".r-row"],
      ["method drawer", "details.how"],
      ["national strip", ".strip .stat"],
      ["explainer band", ".explain-band"],
      ["footer", "footer"],
    ]) {
      assert.ok(await page.locator(selector).first().count(), `${what} (${selector}) is missing`);
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  });
});

test("the footer's route to donating is a link, on every page", { skip }, async () => {
  // The footer is shared, so this is the ask as a reader meets it on the
  // calculator — not on `/legal/`, where they already went looking for it.
  //
  // The shape depends on how many channels are open, and the suite asserts
  // whichever one `support.js` currently produces rather than pinning the
  // single-channel case: a direct outbound link while exactly one channel is
  // open, and `/support/` once the destination is a choice the footer is the
  // wrong width to explain. Pinning "exactly one `a.donate`" would go red the
  // day a second account opens — on a change that broke nothing — which is how
  // a suite teaches people to edit it rather than read it.
  //
  // The computed-background assertion is the one that needs a browser, and it
  // is the rule this suite exists to hold: `support.js` rule 1 forbids the ask
  // growing into a component, and "a donate button" is what every donation
  // guide recommends adding next. A CSS rule filling it in reads as a tidy
  // style tweak in a diff and lands as the thing the module forbids by name.
  const { livePlatforms, footerDonateLink } = await import(
    pathToFileURL(join(SITE, "src", "lib", "support.js")).href
  );
  const direct = footerDonateLink();

  await withApp(async (page, errors) => {
    const donate = page.locator("footer a.donate");
    assert.equal(
      await donate.count(),
      direct ? 1 : 0,
      direct
        ? "one channel is open, so the footer prints one direct donate link"
        : `${livePlatforms().length} channels are open, so the footer must not ` +
            "pick one for the reader — the route is the Подкрепа item, which " +
            "leads to the page where each platform carries its note"
    );

    // Whichever shape it took, there is a route out of the footer and it is a
    // link. A support line with nothing to follow is a statement about money
    // with no answer to it.
    const route = direct ? donate : page.locator("footer a[href^='/support/']");
    assert.ok(await route.count(), "the footer offers no route to supporting the project");

    const href = await route.first().getAttribute("href");
    assert.match(
      href ?? "",
      direct ? /^https:\/\// : /^\/support\//,
      `the footer's support route points at ${href}`
    );
    if (direct) {
      assert.equal(
        await donate.getAttribute("rel"),
        "noopener",
        "an outbound link opened in a new tab needs rel=noopener"
      );
    }
    assert.ok(
      (await route.first().innerText()).trim().length > 0,
      "the support route renders no text — a missing string is a blank line, not a fallback"
    );

    const bg = await route.first().evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.match(
      bg,
      /rgba\(0, 0, 0, 0\)|transparent/,
      `the footer's support link is drawn with a filled background (${bg}), which ` +
        "makes it a button. support.js rule 1: the ask is one quiet line and one link."
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the basket's 12-month window names the divisions' month", { skip }, async () => {
  // The y1 anchor's per-division numbers ARE `categories[].annual_rate_pct`,
  // taken verbatim. Eurostat's flash publishes the all-items rate about two
  // weeks before those, so labelling the window from `hicp_headline.json`
  // dates June's rates as a July window — every figure on the page correct,
  // the sentence over them false, and no pipeline gate able to see it because
  // nothing published is wrong. Asserted in a browser against the payloads the
  // page actually fetched, because the failure is a rendered string.
  const [cats, head] = await Promise.all(
    ["hicp_categories", "hicp_headline"].map(async (n) =>
      JSON.parse(await readFile(join(DIST, "data", "published", `${n}.json`), "utf8"))
    )
  );
  const month = String(cats.categories[0].ref_period);
  await withApp(async (page, errors) => {
    const label = await page.locator("#inAnchor option[value='y1']").innerText();
    assert.ok(
      label.includes(month.replace("-", ".")),
      `the 12-month option reads "${label}" but the divisions describe ${month}`
    );
    if (head.ref_period !== month) {
      assert.ok(
        !label.includes(String(head.ref_period).replace("-", ".")),
        `the 12-month option reads "${label}" — that is the headline's month, and the ` +
          `divisions under it are at ${month}`
      );
    }
    // The hint under the same dropdown has always read the categories. It is
    // in the assertion so the two cannot drift apart again: a label and a hint
    // naming different months is the visible form of this bug.
    const hint = await page.locator("#inAnchor ~ .hint").first().innerText();
    assert.ok(
      hint.includes(month),
      `the anchor hint reads "${hint}" but the divisions describe ${month}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("typing a salary moves the euro figures", { skip }, async () => {
  await withApp(async (page, errors) => {
    const salary = page.locator("input[type=number]").first();
    await salary.fill("1200");
    await page.waitForTimeout(300);
    const low = await page.locator(".r-money").first().innerText();
    await salary.fill("4000");
    await page.waitForTimeout(300);
    const high = await page.locator(".r-money").first().innerText();
    assert.notEqual(low, high, "the euro figure did not follow the salary input");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the home block draws its mortgage bar and the wedge chart", { skip }, async () => {
  await withApp(async (page, errors) => {
    await page.locator("input[type=number]").first().fill("2500");
    await page.waitForTimeout(300);
    assert.ok(await page.locator(".wedge").count(), "the tax-wedge chart is not drawn");
    const homeToggle = page.locator(".homeTog input[type=checkbox]").first();
    if (await homeToggle.count()) await homeToggle.check();
    await page.waitForTimeout(300);
    assert.ok(await page.locator(".mort-bar").count(), "the mortgage cap bar is not drawn");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the language and theme toggles change the page", { skip }, async () => {
  await withApp(async (page, errors) => {
    const root = page.locator("html");
    assert.equal(
      await root.getAttribute("data-lang"),
      "bg",
      "the default language is not Bulgarian"
    );
    await page.locator("header.site .pill").nth(1).click();
    await page.waitForTimeout(200);
    assert.equal(await root.getAttribute("data-lang"), "en");

    const before = await root.getAttribute("data-theme");
    await page.locator("header.site .pill").first().click();
    await page.waitForTimeout(200);
    assert.notEqual(await root.getAttribute("data-theme"), before, "the theme toggle did nothing");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the legal page renders every published document", { skip }, async () => {
  await withApp(async (page, errors) => {
    const headings = await page.locator("h1, h2").allInnerTexts();
    assert.ok(headings.length > 3, `the legal page rendered ${headings.length} headings`);
    assert.ok(await page.locator("footer").count(), "the legal page drops the shared footer");
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/legal/");
});

test("the support page resolves as its own URL and carries the whole ask", { skip }, async () => {
  // `/support/` exists so the funding answer has an address a person can be
  // given, which means the thing to assert is that the address resolves — a
  // static host serves `support/index.html` for it or it does not, and there
  // is no router to fall back on. A mistyped Vite entry ships a 404 at the one
  // URL the footer and the explainer both point at, with every other suite
  // green.
  await withApp(async (page, errors) => {
    assert.ok(await page.locator("main.support h1").count(), "the support page has no heading");
    assert.ok(
      (await page.locator("main.support a[href^='https://']").count()) > 0,
      "the support page offers no outbound link — a page about how to give " +
        "that gives no route is worse than the footer line it replaced"
    );
    assert.ok(await page.locator("footer").count(), "the support page drops the shared footer");
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/support/");
});

test("the country page mounts over its prerender rather than beside it", { skip }, async () => {
  // The failure `how-main.js`'s `replaceChildren()` prevents, checked on the
  // page rather than on the file: `mount()` appends, and this entry arrives
  // with the whole prerendered page already in `#app`. Left in place a reader
  // gets every heading and every table twice — the second copy live and the
  // first frozen at build time, which is the version that would be wrong first.
  await withApp(async (page, errors) => {
    for (const [what, selector] of [
      ["header", "header.site"],
      ["h1", "main h1"],
      ["footer", "footer.site"],
    ]) {
      assert.equal(await page.locator(selector).count(), 1, `${what} appears twice on /how/`);
    }
    // Every section the contents list promises, drawn and carrying figures.
    const sections = await page.locator("main.how section[id]").count();
    assert.ok(sections >= 7, `/how/ rendered ${sections} sections`);
    assert.equal(
      await page.locator("main.how nav.toc a").count(),
      sections,
      "the contents list and the sections have parted company — one of them " +
        "names something that is not there"
    );
    assert.ok(
      (await page.locator("main.how table tbody tr").count()) >= 20,
      "the tables on /how/ drew almost no rows, so a payload is not reaching them"
    );
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("every figure on the country page names a source and a period", { skip }, async () => {
  // P3, on the page whose whole claim is that it holds. A stat block with no
  // caption is a number a reader cannot check; a caption with no period is a
  // number they cannot date, which is also the only thing that would make a
  // page outliving its data visibly behind rather than silently wrong (P4).
  await withApp(async (page, errors) => {
    const blocks = await page.locator("main.how .stat").evaluateAll((els) =>
      els.map((el) => ({
        label: (el.querySelector(".sl")?.textContent ?? "").trim(),
        caption: (el.querySelector(".ss")?.textContent ?? "").trim(),
        href: el.querySelector(".ss a")?.getAttribute("href") ?? "",
      }))
    );
    assert.ok(blocks.length >= 12, `/how/ rendered ${blocks.length} figures`);
    for (const block of blocks) {
      assert.ok(block.label, "a figure on /how/ carries no label saying what it is");
      assert.match(
        block.href,
        /^https:\/\//,
        `«${block.label.slice(0, 40)}» links to "${block.href}" rather than out to its publisher`
      );
      assert.match(
        block.caption,
        /\d{4}/,
        `«${block.label.slice(0, 40)}» carries no year in its caption, so the ` +
          "figure is undated (P3, P4)"
      );
    }

    // The five publishers, each reachable from the page that names their
    // figures. The footer's attribution line is a licence condition; these are
    // the links that make it checkable.
    const hrefs = await page
      .locator("main.how a[href^='https://']")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")).join(" "));
    for (const host of ["ec.europa.eu", "nsi.bg", "imot.bg", "ecb.europa.eu", "bnb.bg"]) {
      assert.ok(
        hrefs.includes(host),
        `/how/ renders figures from ${host} and links to none of them`
      );
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the country page answers in the reader's language, both ways", { skip }, async () => {
  // Both languages ship in the DOM at once and one is hidden by CSS, which is
  // exactly why a missing string is invisible in review: the person editing
  // only ever sees one of the two. Here the page is read in both.
  await withApp(async (page, errors) => {
    const empty = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("main.how .l-bg, main.how .l-en")) {
        if (!el.textContent.trim()) out.push(el.className);
      }
      return out;
    });
    assert.deepEqual(empty, [], `blank language spans on /how/: ${empty.join(", ")}`);

    const bg = (await page.locator("main.how h1").innerText()).trim();
    await page.locator("header.site .pill").last().click();
    await page.waitForTimeout(300);
    const en = (await page.locator("main.how h1").innerText()).trim();
    assert.ok(bg && en, "the country page's heading is empty in one language");
    assert.notEqual(en, bg, "the heading is the same string in both languages");
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the country page fits a phone, and its wide tables scroll inside it", { skip }, async () => {
  // Five columns do not fit 360px, so each table sits in an `overflow-x: auto`
  // box. The failure that box exists to prevent is the PAGE scrolling sideways
  // instead — which puts the sticky header, the contents list and every
  // paragraph on a horizontal ride at the width most Bulgarian readers arrive
  // at. The two halves are asserted together because dropping the box fixes
  // neither and passes the second on its own.
  for (const width of [360, 390]) {
    await withApp(
      async (page, errors) => {
        const seen = await page.evaluate(() => ({
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          boxes: [...document.querySelectorAll("main.how .scroll")].map((el) => ({
            over: el.scrollWidth - el.clientWidth,
            inViewport:
              el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1,
          })),
        }));
        assert.ok(
          seen.docScroll <= seen.docClient + 1,
          `/how/ scrolls sideways at ${width}px (${seen.docScroll} against ${seen.docClient})`
        );
        assert.ok(seen.boxes.length >= 4, `/how/ rendered ${seen.boxes.length} scroll boxes`);
        for (const box of seen.boxes) {
          assert.ok(box.inViewport, `a table box reaches past the ${width}px viewport`);
        }
        assert.ok(
          seen.boxes.some((b) => b.over > 0),
          `no table on /how/ overflows its box at ${width}px, so either the ` +
            "tables shrank out of the shape this protects or the box stopped " +
            "clipping and the page is about to scroll instead"
        );
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      },
      "/how/",
      { viewport: { width, height: 780 } }
    );
  }
});

test("a keyboard reader can reach every column of every table", { skip }, async () => {
  // A scroll container is not focusable on its own, and two of the four on
  // `/how/` contain no link either — so at a phone width the wedge table's last
  // two columns were unreachable by any keyboard means at all, on a page whose
  // whole content is tables. The box is a tab stop AND carries a name, because
  // a tab stop that announces nothing is its own defect.
  await withApp(
    async (page, errors) => {
      const boxes = await page.locator("main.how .scroll").evaluateAll((els) =>
        els.map((el) => ({
          tabIndex: el.tabIndex,
          role: el.getAttribute("role"),
          label: (el.getAttribute("aria-label") ?? "").trim(),
        }))
      );
      assert.ok(boxes.length >= 4, `/how/ rendered ${boxes.length} scroll boxes`);
      const names = new Set();
      for (const box of boxes) {
        assert.equal(box.tabIndex, 0, "a table's scroll box is not a tab stop");
        assert.equal(box.role, "region", "a focusable scroll box announces no role");
        assert.ok(box.label, "a focusable scroll box has no accessible name");
        names.add(box.label);
      }
      assert.equal(
        names.size,
        boxes.length,
        `two scroll boxes share a name (${[...names].join(" / ")}) — a landmark ` +
          "list that repeats one label tells a reader which tables exist and not " +
          "which is which"
      );

      // And it actually scrolls once focused, which is the whole point of the
      // attribute rather than a property of having it.
      const moved = await page.evaluate(async () => {
        const box = [...document.querySelectorAll("main.how .scroll")].find(
          (el) => el.scrollWidth > el.clientWidth
        );
        if (!box) return null;
        box.focus();
        const before = box.scrollLeft;
        box.scrollLeft = before + 40;
        return { focused: document.activeElement === box, before, after: box.scrollLeft };
      });
      assert.ok(moved, "no table overflows at this width, so the box under test is the wrong one");
      assert.ok(moved.focused, "the scroll box refused focus");
      assert.ok(moved.after > moved.before, "the focused box did not scroll");
      assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
    },
    "/how/",
    { viewport: { width: 360, height: 780 } }
  );
});

test("mounting adds no second title or description to the head", { skip }, async () => {
  // `<svelte:head>` APPENDS to the real head rather than replacing what the
  // entry file put there, so a component that declares a `<meta
  // name="description">` leaves the reader's page carrying two — and a crawler
  // that DOES run the bundle takes the first, which is no longer the one
  // somebody edited. `App.svelte` and `How.svelte` each carry a comment saying
  // the description belongs in the entry file; this is the check behind it, and
  // it needs a browser because the tag never exists until the bundle mounts.
  for (const path of ["/", "/how/"]) {
    await withApp(
      async (page, errors) => {
        const head = await page.evaluate(() => ({
          titles: [...document.querySelectorAll("title")].map((el) => el.textContent),
          descriptions: document.querySelectorAll('meta[name="description"]').length,
          canonicals: document.querySelectorAll('link[rel="canonical"]').length,
        }));
        assert.equal(head.titles.length, 1, `${path} has titles: ${head.titles.join(" | ")}`);
        assert.ok(head.titles[0]?.trim(), `${path} mounted an empty title`);
        assert.equal(
          head.descriptions,
          1,
          `${path} carries ${head.descriptions} descriptions once mounted — see ` +
            "docs/seo.md §'Why not hydration'. The description belongs in the " +
            "entry file, never in <svelte:head>."
        );
        assert.equal(head.canonicals, 1, `${path} carries ${head.canonicals} canonical links`);
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      },
      path,
      {}
    );
  }
});

test("the country page's skip link exists and lands clear of the header", { skip }, async () => {
  // The calculator's equivalent, on the page that needs it more: eleven
  // controls — the header's four and the contents list's seven — sit between a
  // keyboard reader's first Tab and the first sentence.
  await withApp(async (page, errors) => {
    const skip = page.locator("a.skip");
    assert.equal(await skip.count(), 1, "/how/ has no skip link");
    assert.equal(await skip.first().getAttribute("href"), "#main");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    assert.ok(focused.includes("skip"), `the first tab stop on /how/ is "${focused}"`);

    const clearance = await page.evaluate(() => {
      const main = document.querySelector("#main");
      return (
        (parseFloat(getComputedStyle(main).scrollMarginTop) || 0) -
        document.querySelector("header.site").getBoundingClientRect().height
      );
    });
    assert.ok(
      clearance > 0,
      `#main's scroll offset is ${clearance}px short of the sticky header, so the ` +
        "skip link lands the reader underneath it"
    );
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the country page's stat rows leave no orphaned cell", { skip }, async () => {
  // The rule the national strip is already held to, on the page that repeats
  // the shape seven times with one to four cards per row. `flex: 1 1 190px` in
  // a wrapping row is what makes a lone last card fill its row instead of
  // sitting at a third of the width beside two empty cells; a fixed column
  // count would look identical at one width and leave the hole at another.
  for (const width of [1280, 768, 390]) {
    await withApp(
      async (page, errors) => {
        const groups = await page.locator("main.how .stats").evaluateAll((els) =>
          els.map((el) =>
            [...el.children].map((k) => {
              const r = k.getBoundingClientRect();
              return { top: Math.round(r.top), right: Math.round(r.right) };
            })
          )
        );
        assert.ok(groups.length >= 5, `/how/ rendered ${groups.length} stat rows`);
        for (const [i, cards] of groups.entries()) {
          const rows = new Map();
          for (const c of cards) {
            const key = [...rows.keys()].find((t) => Math.abs(t - c.top) < 4) ?? c.top;
            rows.set(key, [...(rows.get(key) ?? []), c]);
          }
          const full = Math.max(...cards.map((c) => c.right));
          for (const [top, row] of rows) {
            const reached = Math.max(...row.map((c) => c.right));
            assert.ok(
              full - reached < 8,
              `at ${width}px, stat group ${i}'s row at y=${top} stops ` +
                `${full - reached}px short of the others — its last card is ` +
                "followed by an empty cell"
            );
          }
        }
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      },
      "/how/",
      { viewport: { width, height: 900 } }
    );
  }
});

test("the calculator asks in two places and neither interrupts", { skip }, async () => {
  // `support.js` rule 1 permits exactly two surfaces on this page, and the
  // second one — «Кой плаща за това?» — is permitted BECAUSE it sits inside a
  // disclosure the reader chose to open. Rendering it open by default, or
  // lifting it out of the band, converts an answer into an interruption
  // without changing a word of the copy, which is precisely the change no
  // string check can see.
  await withApp(async (page, errors) => {
    // Counted by PLACE, not by anchor: both language variants sit in the DOM
    // at once (`.l-bg` / `.l-en`, hidden with `display:none`), so a link
    // written inside a sentence is two `<a>` elements and a link beside one is
    // a single element wrapping both spans. Anchors would therefore measure
    // how the copy is assembled; what rule 1 caps is how many parts of the
    // page ask.
    const total = await page.locator("a[href^='/support/']").count();
    const footer = await page.locator("footer a[href^='/support/']").count();
    const explainer = await page.locator(".explain-band a[href^='/support/']").count();
    assert.ok(footer > 0, "the footer no longer routes to /support/");
    assert.ok(explainer > 0, "the explainer's support item is missing");
    assert.equal(
      footer + explainer,
      total,
      "the calculator points at /support/ from a third place. Rule 1 allows " +
        "the footer line and the explainer's answer; a third surface means " +
        "amending the rule, not adding the link."
    );

    const item = page.locator(".explain-band a[href^='/support/']").first();
    assert.equal(
      await item.isVisible(),
      false,
      "the explainer's support answer is visible before the reader opened the " +
        "band. Inside a closed disclosure is the whole reason rule 1 allows it."
    );

    const bg = await item.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.match(
      bg,
      /rgba\(0, 0, 0, 0\)|transparent/,
      `the explainer's support link is drawn with a filled background (${bg}), ` +
        "which makes it a button — the same thing rule 1 forbids the footer's."
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

// ---------------------------------------------------------------------------
// **Every assertion below is on an EFFECT, never on a declaration.** A regex
// over a `<style>` block — does `.stats` say `flex-wrap: wrap`, does `.stat`
// carry a `flex-grow`, is `.wedge-marginal` filled — checks the cause and hopes
// for the effect. A browser gives the effect directly: a computed style, a
// bounding box, a rendered width. So these assert the thing that matters to a
// reader, and they keep working when the same layout is achieved a different
// way.
//
// That is the whole argument for the migration: a grep for `flex-wrap: wrap`
// goes red when someone switches to `grid` with `auto-fit` and gets an
// identical page, and stays green when someone leaves the declaration in place
// above a rule that overrides it.
// ---------------------------------------------------------------------------

test("the national strip leaves no orphaned cell on its last row", { skip }, async () => {
  // The strip renders five one-number tiles plus one card carrying a chart. A
  // fixed-column grid held its column width, so the tail of the last row was an
  // empty cell — a 5-up row and a lone sixth card. The cards must fill their
  // row instead, and the wide chart card takes a row of its own, because a card
  // twice its neighbours' height stretches every tile beside it to match.
  await withApp(async (page, errors) => {
    const boxes = await page.locator(".strip .stat").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
      })
    );
    assert.ok(boxes.length >= 5, `the strip rendered ${boxes.length} cards`);

    // Group into rows by their top edge, then assert each row is flush to the
    // rightmost edge any row reaches. A row that stops short is the hole.
    const rows = new Map();
    for (const b of boxes) {
      const key = [...rows.keys()].find((t) => Math.abs(t - b.top) < 4) ?? b.top;
      rows.set(key, [...(rows.get(key) ?? []), b]);
    }
    const fullWidth = Math.max(...boxes.map((b) => b.right));
    for (const [top, row] of rows) {
      const reached = Math.max(...row.map((b) => b.right));
      assert.ok(
        fullWidth - reached < 8,
        `the strip row at y=${top} stops ${fullWidth - reached}px short of the ` +
          "others, so its last card is followed by an empty cell"
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the charted strip card takes a row of its own, and it is the last one",
  { skip },
  async () => {
    await withApp(async (page) => {
      const wide = page.locator(".strip .stat.wide");
      // Assert it exists before asserting anything about it. Guarding with
      // `if (!(await wide.count())) return;` means deleting the full-width
      // card outright — the regression this test is named for — leaves all
      // thirteen render tests green. **An early return on a missing element is
      // a green test for a deleted feature** (docs/testing-strategy.md
      // §"The standard a test has to meet").
      assert.ok(
        await wide.count(),
        "the strip has no full-width chart card (.strip .stat.wide) at all, so " +
          "there is nothing to check it sits on its own last row"
      );
      const wideBox = await wide.first().boundingBox();
      const others = await page
        .locator(".strip .stat:not(.wide)")
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
      for (const top of others) {
        assert.ok(
          top < wideBox.y - 4,
          "a plain stat tile is rendered on or after the full-width chart card's " +
            "row, so the tiles no longer form one uninterrupted run"
        );
      }
    });
  }
);

test("the strip shows the same cards whatever the reader typed", { skip }, async () => {
  // Gating the Sofia average-wage card on a typed salary makes the section a
  // reader sees depend on their own input, while the card carries no figure
  // derived from it. A card count that shifts between five and six is also a
  // count no layout can be tuned for.
  await withApp(async (page) => {
    const before = await page.locator(".strip .stat").count();
    await page.locator("input[type=number]").first().fill("4200");
    await page.waitForTimeout(300);
    const after = await page.locator(".strip .stat").count();
    assert.equal(
      after,
      before,
      `the national strip went from ${before} to ${after} cards when a salary ` +
        "was typed. It is a country reference: every card is gated on its own " +
        "payload having loaded, never on what the reader entered."
    );
  });
});

test("no SVG on the page is drawn with distorted axes", { skip }, async () => {
  // The Sofia sparkline was a fixed 110×22 box rendered at `width: 100%` with
  // `preserveAspectRatio="none"`, so at a card's real width the horizontal scale
  // was several times the vertical one: the 2px stroke thinned out and every
  // year's round marker rendered as an ellipse.
  await withApp(async (page, errors) => {
    const distorted = await page.locator("svg").evaluateAll((els) =>
      els
        .filter((el) => {
          const vb = el.viewBox?.baseVal;
          if (!vb || !vb.width || !vb.height) return false;
          if (el.getAttribute("preserveAspectRatio") !== "none") return false;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          const sx = r.width / vb.width;
          const sy = r.height / vb.height;
          return Math.abs(sx - sy) / Math.max(sx, sy) > 0.05;
        })
        .map((el) => el.getAttribute("class") ?? "(no class)")
    );
    assert.deepEqual(
      distorted,
      [],
      `these SVGs scale their two axes independently: ${distorted.join(", ")}. ` +
        "Strokes distort and circles become ellipses. Measure the box and draw 1:1."
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the tax-wedge chart draws both series visibly, and its key matches the marks",
  { skip },
  async () => {
    // Below the ceiling the marginal rate EQUALS the effective rate — that is the
    // card's own sentence — so a marginal drawn as a LINE sits exactly underneath
    // the effective line for the first third of the plot and simply is not there.
    // The legend named two series and the chart showed one. So the marginal is an
    // area closed to the baseline, and every series key is a painted block rather
    // than a zero-height box carrying a border.
    await withApp(async (page, errors) => {
      await page.locator("input[type=number]").first().fill("3000");
      await page.waitForTimeout(300);

      const marginal = page.locator(".wedge-marginal");
      assert.ok(await marginal.count(), "the marginal series is not drawn at all");
      const fill = await marginal.first().evaluate((el) => getComputedStyle(el).fill);
      assert.ok(
        fill && fill !== "none",
        `the marginal series is unfilled (fill: ${fill}), so it is invisible wherever ` +
          "it coincides with the effective one — which is most of the plot"
      );

      // Each SERIES key is a swatch with real area. The ceiling's key is a rule,
      // because the mark it names is a rule.
      for (const cls of [".wedge-key .e", ".wedge-key .m"]) {
        const swatch = page.locator(cls);
        if (!(await swatch.count())) continue;
        const box = await swatch.first().evaluate((el) => {
          const s = getComputedStyle(el, "::before");
          return { w: parseFloat(s.width), h: parseFloat(s.height), bg: s.backgroundColor };
        });
        assert.ok(
          box.w >= 8 && box.h >= 2,
          `the key swatch for ${cls} has no readable area (${box.w}×${box.h}px)`
        );
        assert.ok(
          box.bg && box.bg !== "rgba(0, 0, 0, 0)",
          `the key swatch for ${cls} is not painted, so it names a series the ` +
            "reader cannot match to the plot"
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the wedge's right-edge labels belong to the series they sit on", { skip }, async () => {
  // The two series share one hue, so a label's POSITION is the only thing
  // saying which one it names. The failure this guards: the marginal 10%
  // label drawn just above its wash lands a few units under the effective
  // line's own right-hand end, and the chart then reads as though the line
  // falls to 10%. It does not — the effective rate approaches 10% and never
  // arrives, sitting at ~14.8% at the right edge of this frame.
  //
  // Two things have to hold, and neither is about pixels for their own sake:
  // the line carries its own value where the frame cuts it, and the wash's
  // label sits INSIDE the wash rather than between the two marks.
  await withApp(async (page, errors) => {
    await page.locator("input[type=number]").first().fill("900");
    await page.waitForTimeout(300);

    const svg = page.locator("svg.wedge").first();
    assert.ok(await svg.count(), "the wedge chart is not on the page");

    const labels = await svg.locator("text.wedge-lbl").evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent.trim(),
        y: el.getBBox().y + el.getBBox().height / 2,
      }))
    );
    const pct = labels.filter((l) => l.text.endsWith("%"));
    assert.ok(
      pct.length >= 3,
      "the chart labels fewer than three levels, so at least one series has no " +
        `number of its own: ${JSON.stringify(pct)}`
    );

    // The load-bearing assertion, and it is about ownership rather than pixel
    // taste: the wash's label must sit nearer the BASELINE than it does to the
    // effective line's own end point. Nearer the line is precisely the failure
    // — from there the eye attaches the number to the line and reads a landing
    // the line never makes.
    //
    // Comparing against the wash path's bounding box does NOT catch it. That
    // box is topped by the 22.4% plateau on the left, so a label floating in
    // the gap at the right edge is still "inside" the box and passes.
    const marginal = pct.reduce((a, b) => (b.y > a.y ? b : a));
    const geom = await svg.evaluate((el) => {
      const line = el.querySelector("path.wedge-effective");
      const base = el.querySelector("line.wedge-base");
      return {
        lineEndY: line.getPointAtLength(line.getTotalLength()).y,
        baseY: Number(base.getAttribute("y1")),
      };
    });
    const toLine = Math.abs(marginal.y - geom.lineEndY);
    const toBase = Math.abs(marginal.y - geom.baseY);
    assert.ok(
      toBase < toLine,
      `the ${marginal.text} label sits ${toLine.toFixed(1)} from the effective line's end ` +
        `and ${toBase.toFixed(1)} from the baseline — nearer the line, so it reads as the ` +
        "value the line falls to. The line approaches 10% and never reaches it."
    );

    // And the line's own end value is on the plot, distinct from the wash's.
    const values = pct.map((l) => l.text);
    assert.ok(
      new Set(values).size === values.length,
      `two level labels print the same number (${values.join(", ")}) — the line and ` +
        "the wash are then indistinguishable at the frame edge"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the disclosure chip reads as a control, and not as a verdict", { skip }, async () => {
  // `--real` means the reader's number is the good one, not "clickable". The
  // affordance is carried by SHAPE — a border and a caret — and the accent is
  // reserved for :hover / :focus-visible, where it is unambiguously about the
  // interaction. A resting chip painted in a semantic verdict colour puts two
  // meanings of one colour beside each other.
  await withApp(async (page, errors) => {
    // A salary first, because the payslip breakdown is the chip a reader
    // actually meets and it waits for one — until then the only `.disclose` on
    // the page is the formula block nested inside the closed explainer, whose
    // summary measures 0px because its ancestor is not rendered. Measuring
    // that one asserts nothing about a control anybody can tap.
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);

    const chip = page.locator("summary.disclose").first();
    // Same reason as the strip test above. This one degraded twice over: the
    // early return skipped the style assertions, and the caret check below
    // compares two counts that are both zero when the chips are gone, so
    // `assert.equal(carets, chips)` passes on nothing.
    assert.ok(
      await chip.count(),
      "there are no disclosure chips (summary.disclose) on the page at all — " +
        "the control this test describes is gone, not merely restyled"
    );
    const style = await chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        borderWidth: parseFloat(s.borderTopWidth),
        padding: parseFloat(s.paddingTop) + parseFloat(s.paddingBottom),
        height: el.getBoundingClientRect().height,
      };
    });
    assert.ok(style.borderWidth > 0, "the chip lost its border — nothing marks it as a control");
    assert.ok(style.padding > 0, "the chip lost its padding — the tap target goes back to ~14px");
    assert.ok(
      style.height >= 20,
      `the disclosure control is ${style.height}px tall, which is not a tap target`
    );

    // Every `.disclose` summary carries the caret glyph; without it the chip
    // reads as a static badge rather than something that opens.
    const chips = await page.locator("summary.disclose").count();
    const carets = await page.locator("summary.disclose .dc-caret").count();
    assert.equal(carets, chips, `${chips - carets} disclosure chips have no caret`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ready-made baskets sit under the rows they fill", { skip }, async () => {
  // Where the chips sit is the whole of what they claim to be. Directly under
  // «За какво отиват парите ти?» five mutually-cancelling buttons ARE the
  // answer to that question, and the thirteen rows below them read as the
  // readout it produced — which is how a reader arrives at "I can't pick 'I
  // drive daily' and 'feeding a family' at the same time", having seen the
  // sliders and classified them as output. Under the list the same chips are
  // somewhere to start, found after the instrument, and no sentence has to
  // say so. Two already do and both lost to this ordering.
  await withApp(async (page, errors) => {
    assert.ok(await page.locator(".presets").count(), "the ready-made basket row is gone");
    const geom = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#sliders .cat")];
      return {
        rows: rows.length,
        lastRowBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? null,
        presetsTop: document.querySelector(".presets").getBoundingClientRect().top,
      };
    });
    assert.ok(geom.rows >= 13, `${geom.rows} basket rows — the published list is not being drawn`);
    assert.ok(
      geom.presetsTop >= geom.lastRowBottom,
      `the ready-made baskets start at ${geom.presetsTop}px, above the last row's bottom edge ` +
        `at ${geom.lastRowBottom}px — they are answering the heading again`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the loaded basket is marked, not crowned", { skip }, async () => {
  // A solid `--ink` fill is the strongest "this is the answer" signal the app
  // has, and the chip it sat on had only seeded thirteen sliders that outrank
  // it. The state still has to be legible — which basket is loaded is a real
  // question — so this asserts both directions: not the ink fill, and not
  // identical to an unpressed chip either.
  await withApp(async (page, errors) => {
    const style = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--ink)";
      document.body.append(probe);
      const ink = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const on = document.querySelector('.presets .chip[aria-pressed="true"]');
      const off = document.querySelector('.presets .chip[aria-pressed="false"]');
      if (!on || !off) return null;
      const read = (el) => {
        const s = getComputedStyle(el);
        return {
          background: s.backgroundColor,
          color: s.color,
          border: parseFloat(s.borderTopWidth),
          borderColor: s.borderTopColor,
        };
      };
      return { ink, on: read(on), off: read(off) };
    });
    assert.ok(
      style,
      "the basket row reports no loaded basket, or no unloaded one to compare it to"
    );
    assert.notEqual(
      style.on.background,
      style.ink,
      "the loaded basket is filled with --ink again — a starting point painted as the verdict"
    );
    assert.ok(
      style.on.border > 0,
      "the loaded chip lost its border, so nothing marks it a control"
    );
    assert.notDeepEqual(
      [style.on.background, style.on.borderColor, style.on.color],
      [style.off.background, style.off.borderColor, style.off.color],
      "the loaded basket is drawn exactly like the ones that are not — nothing says which is on"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "a basket row is a handle, and moving one unseats the ready-made basket",
  { skip },
  async () => {
    // The row competes with the app's own bar charts — `.rank .track` in the
    // results card is the same rail under the same name · code · rate · value
    // line — so the control has to be legible as one before it is touched: 24px
    // of hit area on a phone that has no hover, and a name a screen reader can
    // announce. Then the behaviour that settles which of the two outranks the
    // other: one arrow key on any row and no ready-made basket is loaded any
    // more, because the reader's own number has replaced it.
    await withApp(async (page, errors) => {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll("#sliders .cat > input[type=range]")].map((el) => ({
          height: el.getBoundingClientRect().height,
          name: el.getAttribute("aria-label") ?? "",
        }))
      );
      assert.ok(rows.length >= 13, `${rows.length} division sliders — the list is not being drawn`);
      for (const row of rows) {
        assert.ok(
          row.height >= 24,
          `a basket slider is ${row.height}px of hit area — under a thumb that is a chart, not a control`
        );
        assert.ok(row.name.trim(), "a basket slider has no accessible name");
      }

      const slider = page.locator("#sliders .cat > input[type=range]").first();
      const before = await slider.inputValue();
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      assert.notEqual(
        await slider.inputValue(),
        before,
        "the slider does not move under the keyboard"
      );
      assert.equal(
        await page.locator('.presets .chip[aria-pressed="true"]').count(),
        0,
        "a ready-made basket is still marked as loaded after the reader moved a row of their own"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the basket keeps its affordances for a reader who turned motion off", { skip }, async () => {
  // `tokens.css` drops every animation and transition under
  // `prefers-reduced-motion`, so anything that says "control" by moving says
  // nothing at all to that reader — and every other test in this file runs on
  // a page where motion is on, which is what makes the regression invisible.
  // What has to survive: the hit area, and the row-level focus mark a keyboard
  // reader tracks down thirteen near-identical lines.
  await withApp(
    async (page, errors) => {
      const slider = page.locator("#sliders .cat > input[type=range]").first();
      const box = await slider.boundingBox();
      assert.ok(box.height >= 24, `the slider is ${box.height}px tall with motion off`);

      await slider.focus();
      const row = await page.evaluate(() => {
        const focused = document.querySelector("#sliders .cat:focus-within");
        const plain = document.querySelector("#sliders .cat:not(:focus-within)");
        if (!focused || !plain) return null;
        const read = (el) => {
          const s = getComputedStyle(el);
          return { shadow: s.boxShadow, background: s.backgroundColor };
        };
        return { focused: read(focused), plain: read(plain) };
      });
      assert.ok(row, "focusing a slider marks no row at all");
      assert.notEqual(
        row.focused.shadow,
        "none",
        "the focused row carries no static mark — the affordance is motion, which this reader never sees"
      );
      assert.notEqual(
        row.focused.background,
        row.plain.background,
        "a focused basket row is drawn exactly like an untouched one"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    { reducedMotion: "reduce" }
  );
});

test("the basket fits a 360px column, chips and all", { skip }, async () => {
  // 360px is the phone the reader in the report was holding. The chip row
  // wraps to four lines there, and a chip that overhangs the column is the
  // one control nobody scrolls sideways to find.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    const geom = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      widest: Math.max(
        ...[...document.querySelectorAll(".presets .chip, #sliders .cat")].map(
          (el) => el.getBoundingClientRect().right
        )
      ),
    }));
    assert.ok(
      geom.scrollWidth <= geom.clientWidth,
      `the page is ${geom.scrollWidth}px wide in a ${geom.clientWidth}px viewport`
    );
    assert.ok(geom.widest <= 360, `the basket's widest element reaches ${geom.widest}px`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the controls that carry no words name themselves in the reader's language",
  { skip },
  async () => {
    // A glyph button's accessible name is the only thing that says what it does,
    // and BG is the primary language here — an English label leaves a Bulgarian
    // screen-reader user with the controls they cannot guess at from content.
    // The basket's chip row is the same case: five buttons after thirteen
    // sliders, announced as a group or as nothing.
    await withApp(async (page, errors) => {
      const names = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("header .pill, .presets")].map(
            (el) => el.getAttribute("aria-label") ?? ""
          )
        );
      const bg = await names();
      assert.equal(
        bg.length,
        3,
        `${bg.length} of the three unlabelled controls carry an aria-label`
      );
      for (const name of bg) {
        assert.match(name, /[Ѐ-ӿ]/, `"${name}" reaches a Bulgarian reader in English`);
      }

      await page.locator("header .pill").last().click();
      await page.waitForTimeout(300);
      const en = await names();
      for (const [i, name] of en.entries()) {
        assert.ok(name.trim(), "a control lost its accessible name in English");
        assert.notEqual(name, bg[i], `"${name}" is the same string in both languages`);
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the results card announces the headline, not fifty numbers", { skip }, async () => {
  // The whole `.m-card` was a polite live region, so a screen-reader user
  // dragging a slider had the big number, both bars, the verdict, eight ranked
  // rows, five result rows and the formula table re-announced on every tick.
  await withApp(async (page, errors) => {
    const cardIsLive = await page.locator('.m-card[aria-live="polite"]').count();
    assert.equal(
      cardIsLive,
      0,
      "the entire results card is a live region again — every slider tick " +
        "re-announces every number in it"
    );
    assert.ok(
      await page.locator('[aria-live="polite"][aria-atomic="true"]').count(),
      "the headline block lost its live region — the number the reader is " +
        "changing is no longer announced at all"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the verdict names the comparison in words, over bars that keep both figures",
  { skip },
  async () => {
    // Two halves of one rule, and they pull against each other — which is why
    // they are asserted together rather than in two tests that can be satisfied
    // one at a time.
    //
    // The bars own the figures: the reader's rate and the average, labelled, to
    // one decimal, over the period the caption above them names. Deleting one
    // to shorten the card takes a published number off the default view, and
    // `barCeiling` exists so the pair can be compared by length.
    //
    // The paragraph under them owns the words. It says which rate is bigger and
    // whether the gap is worth calling one — the thing two bars cannot say — and
    // it says it without a figure, because a percentage there is the pair above
    // reprinted 20px lower, and a reader who meets the same number twice looks
    // for the difference between the copies.
    await withApp(async (page, errors) => {
      const bars = page.locator(".vbars .num");
      const verdict = page.locator("p.m-verdict");

      // Default load: the reader's weights ARE the official ones, so the two
      // rates agree and the card's verdict is the near one.
      const onLoad = (await bars.allInnerTexts()).map((s) => s.trim());
      assert.equal(onLoad.length, 2, `the comparison lost a bar: ${onLoad.join(" | ")}`);
      for (const shown of onLoad) {
        assert.match(shown, /\d+[.,]\d%/, `a bar states no rate to one decimal: "${shown}"`);
      }
      assert.match(await verdict.innerText(), /близо до средностатистическата/);

      // A weight moved onto transport, so the basket parts company with the
      // average one and the verdict has a direction to state.
      await page.locator('input[type="range"]').nth(6).fill("40");
      await page.waitForTimeout(400);

      const moved = (await bars.allInnerTexts()).map((s) => s.trim());
      assert.notEqual(
        moved[0],
        onLoad[0],
        "the reader's bar ignored a weight moved onto transport"
      );
      assert.notEqual(
        moved[0],
        moved[1],
        "the two bars state the same rate after the basket moved"
      );

      const said = (await verdict.innerText()).replace(/\s+/g, " ").trim();
      assert.match(said, /по-скъпо|по-евтино/, `the verdict states no direction: "${said}"`);
      assert.doesNotMatch(
        said,
        /\d/,
        `the verdict reprints a figure the bars above it already carry: "${said}"`
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test(
  "the skip link exists, is reachable by keyboard, and lands clear of the header",
  { skip },
  async () => {
    // `.skip` had styles and no element wearing them. It is the first thing a
    // keyboard user meets, and it has to clear the sticky header when it lands.
    await withApp(async (page, errors) => {
      const skip = page.locator("a.skip");
      assert.ok(await skip.count(), "there is no skip link, though .skip styles are defined");
      assert.equal(await skip.first().getAttribute("href"), "#main");

      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.className ?? "");
      assert.ok(focused.includes("skip"), `the first tab stop is "${focused}", not the skip link`);

      const offset = await page
        .locator("#main")
        .evaluate((el) => parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
      assert.ok(
        offset > 0,
        "#main has no scroll offset, so the skip link lands under the sticky header"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the explainer causes no horizontal overflow on a 360px viewport", { skip }, async () => {
  // The explainer (`ExplainerBand.svelte`) opens a disclosure containing a nested
  // `.fx` block with unbreakable math tokens (`<code>`, `<sub>`, `<sup>`). Without
  // `overflow-x: auto` on `.how` and `overflow-wrap: anywhere` on `.how .fx code`,
  // these tokens force the box wider than the page and the page scrolls
  // horizontally on a phone viewport.
  //
  // Two things must hold: the page has no horizontal overflow when the explainer
  // is open, and the explainer's right edge stays within the viewport.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 360, height: 800 });

    // Open the explainer (the outer `.how` disclosure at the foot of the page).
    const explainer = page.locator(".explain-band > .wrap > details.how");
    assert.ok(
      await explainer.count(),
      "the explainer (details.how in .explain-band) is missing from the page"
    );
    await explainer.locator("summary").first().click();
    await page.waitForTimeout(200);

    // Open the nested math block inside it.
    const mathBlock = explainer.locator("details.fx");
    if (await mathBlock.count()) {
      await mathBlock.locator("summary").first().click();
      await page.waitForTimeout(200);
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    assert.ok(
      scrollWidth <= clientWidth,
      `the page is ${scrollWidth}px wide with a ${clientWidth}px viewport ` +
        "— the explainer caused horizontal overflow"
    );

    const explainerRight = await page.evaluate(() => {
      const el = document.querySelector(".explain-band details.how");
      if (!el) return null;
      return el.getBoundingClientRect().right;
    });
    assert.ok(
      explainerRight !== null,
      "the explainer (details.how in .explain-band) has no bounding rect — it is missing or invisible"
    );
    assert.ok(
      explainerRight <= 360,
      `the explainer's right edge is ${explainerRight}px, past the 360px viewport`
    );

    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "an untouched salary is named where its figures are, and clears on typing",
  { skip },
  async () => {
    // The €900 default is a worked example, and the hint that says so is bound
    // to the input. On a phone the results card is ordered first (card.css) and
    // that input lands ~3,100px below the figures it qualifies, so the caveat
    // has to be repeated where the numbers are or it reaches the reader four
    // screens late. The amount is interpolated, not written into the copy, so
    // the note cannot drift from `Calculator#salary`.
    await withApp(async (page, errors) => {
      const note = page.locator(".m-card .placeholder");
      assert.equal(
        await note.count(),
        1,
        "the results card names no starting salary on first paint"
      );
      assert.match(
        await note.innerText(),
        /900/,
        "the note does not carry the amount it is a caveat about"
      );

      // …and it goes the moment the figures become the reader's own. A caveat
      // that outlives its cause teaches the reader to read past it.
      await page.locator("#inSalary").fill("2400");
      await page.waitForTimeout(300);
      assert.equal(
        await note.count(),
        0,
        "the starting-salary note survived the reader typing their own pay"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the route from the headline to the salary field lands on it", { skip }, async () => {
  // The link from the figures to the field they are priced off. It has to
  // focus rather than merely scroll: focus is what raises the phone keyboard,
  // so one tap leaves the reader typing instead of hunting.
  //
  // It used to be the ONLY connection between the two, across 3,100px of
  // phone. The pay field now sits above the results, so the journey is short
  // and the button is a convenience rather than a lifeline — which is a reason
  // to keep testing it and no reason to assert on the distance. The old
  // version required a gap of 1,500px before it would test anything, so
  // shortening the page would have quietly turned the test off.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.waitForTimeout(200);

    await page.locator(".m-card .placeholder button").click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "inSalary",
      "the button did not put the caret in the salary field"
    );

    // Focused, and actually on screen: `focus({preventScroll: true})` without
    // the scroll that follows it leaves the reader typing into a field 3,000px
    // away, with the page still showing the figure they tapped.
    const box = await page.locator("#inSalary").boundingBox();
    const height = page.viewportSize().height;
    assert.ok(
      box.y >= 0 && box.y + box.height <= height,
      `the salary field sits at ${Math.round(box.y)}px in a ${height}px viewport — off screen`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder row ranks nobody who has not typed a salary", { skip }, async () => {
  // «Изпреварваш 34% от работещите в София» is a claim about the READER, in
  // the second person, and on first paint it is a claim about whoever earns
  // the €900 placeholder. Unlike the euro figures above it, no caveat makes
  // an unasked ranking land well, so the row waits — the same thing PocketRow
  // does with an empty raise.
  //
  // Both halves are gated: the corner figure as well as the sentence. A bare
  // «пред 34%» above a prompt asking for a salary is the claim with its
  // caveat removed.
  await withApp(async (page, errors) => {
    const row = page.locator(".r-row").filter({ hasText: "къде си по заплата" });
    assert.equal(await row.count(), 1, "the ladder row is missing from the results card");
    const idle = await row.innerText();
    assert.doesNotMatch(
      idle,
      /изпреварваш|пред \d/i,
      `the ladder ranked an untouched placeholder: ${idle.replace(/\s+/g, " ")}`
    );

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await row.innerText();
    assert.match(
      answered,
      /изпреварваш/i,
      `the ladder stayed silent after a salary was typed: ${answered.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("nothing that makes a figure checkable is folded out of view", { skip }, async () => {
  // The results card tiers what it shows: the figure, one plain sentence and
  // its caveat stay put, and the working goes one tap in. Three things may
  // never take that trip, and they are the three a density pass reaches for
  // first because they are small and grey — a source caption, a verify link,
  // and the reference period beside them.
  //
  // «Nothing may degrade the explainer, the verify links or the source
  // captions» (docs/principles.md §"Publish the method"). A caption a reader
  // has to go looking for has been downgraded as surely as one that was
  // deleted, and this is the check that says so, because the difference is
  // invisible in a diff that only adds a `<details>`.
  //
  // The explainer band and the method drawer are exempt by name: both are
  // whole sections behind one disclosure, they carry no figure of their own
  // that is not repeated on the card, and putting the published method behind
  // one summary is the §9.2 obligation met rather than dodged.
  await withApp(async (page, errors) => {
    // A salary, so every row that waits for one is drawn and can be checked.
    await page.locator("#inSalary").fill("2400");
    await page.locator("#inRent").fill("600");
    await page.waitForTimeout(400);

    const buried = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll(".rr-note.ss, .ss, .vlink")) {
        for (let n = el.parentElement; n; n = n.parentElement) {
          if (n.classList?.contains("explain-band")) break;
          if (n.tagName === "DETAILS" && !n.open) {
            out.push(`${el.className} — «${(el.textContent || "").trim().slice(0, 60)}»`);
            break;
          }
        }
      }
      return out;
    });
    assert.deepEqual(
      buried,
      [],
      "these source captions or verify links sit inside a disclosure that is " +
        "closed by default, so a reader has to find them before they can " +
        "check anything:\n  " +
        buried.join("\n  ")
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder's caveat never travels without the rank it qualifies", { skip }, async () => {
  // The rule the whole tiering runs on: prose may move down a tier, a caveat
  // attached to a claim still on screen may not. This is the instance that
  // matters most, because the ladder's caveat is the longest paragraph on the
  // card and therefore the most tempting thing on it to fold — and the claim
  // it qualifies is a second-person ranking of the reader against their
  // neighbours, read off a national survey re-levelled onto Sofia.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);

    const row = page.locator(".r-row").filter({ hasText: "къде си по заплата" });
    const shown = await row.innerText();
    assert.match(shown, /изпреварваш/i, "the ladder states no rank to qualify");
    // `innerText` skips a closed `<details>`, which is the whole point: this
    // fails if the caveat is folded even though the string is still in the DOM.
    assert.match(
      shown,
      /приблизително къде си, а не точно/i,
      `the rank is on screen and its caveat is not: ${shown.replace(/\s+/g, " ").slice(0, 300)}`
    );

    // The answer block restates the same rank a screen higher, so it carries
    // the short form of the same admission rather than the bare figure.
    const answer = await page.locator(".ans").innerText();
    assert.match(
      answer,
      /приблизително/i,
      `the answer block ranks the reader with nothing attached: ${answer.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the plain answer sits between the headline and the working", { skip }, async () => {
  // Readers arrive asking three things and the card answers each under its own
  // derivation, two and three screens down a phone. The answer block says them
  // once, in front — which is only true while it is drawn after the figure it
  // is about and before the table that explains it. Asserted as an ordering,
  // never as a pixel: every number here moves with the next copy edit.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);

    const y = await page.evaluate(() => {
      const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? null;
      return { big: top(".r-big"), answer: top(".ans"), rank: top(".rank"), pocket: null };
    });
    assert.ok(y.big !== null && y.answer !== null && y.rank !== null, "a region is missing");
    assert.ok(y.answer > y.big, "the plain answer is drawn above the figure it is about");
    assert.ok(
      y.rank > y.answer,
      "the ranked table is drawn above the answer it is the working for"
    );

    // …and it says what it is for. The pay verdict and the ladder position are
    // otherwise the pocket row and the ladder row, well below the fold.
    const answer = await page.locator(".ans").innerText();
    assert.match(answer, /изпреварва|изостава|наравно|стояла|намаляла|вдигнаха/i, "no pay clause");
    assert.match(answer, /работещите в София/i, "no ladder clause");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the plain answer waits for a salary before it places the reader", { skip }, async () => {
  // The same rule as the ladder row itself, one screen higher up. A summary
  // that outran it would put «изпреварваш 34%» about the €900 placeholder at
  // the top of the card — the exact defect PercentileRow refuses to print in
  // its own corner, reintroduced above it.
  await withApp(async (page, errors) => {
    const idle = await page.locator(".ans").innerText();
    assert.doesNotMatch(
      idle,
      /изпреварваш \d|пред \d/i,
      `the answer ranked an untouched placeholder: ${idle.replace(/\s+/g, " ")}`
    );
    assert.match(idle, /Въведи своята заплата/i, "the answer neither ranks nor asks");

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await page.locator(".ans").innerText();
    assert.match(
      answered,
      /пред \d+% от работещите в София/i,
      `the answer stayed silent after a salary was typed: ${answered.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("every disclosure on the card opens onto both languages", { skip }, async () => {
  // A missing string renders as a blank line rather than a fallback, and
  // inside a closed `<details>` it renders as a blank line nobody has looked
  // at. Opening each one and reading both language subtrees is the only way
  // this is visible: the copy suite checks that COPY entries ship in pairs,
  // not that a template rendered both of them.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.locator("#inRaise").fill("4");
    await page.waitForTimeout(400);

    const empty = await page.evaluate(() => {
      const out = [];
      for (const details of document.querySelectorAll(".m-results details.rr-more")) {
        details.open = true;
        const body = details.querySelector(".rr-more-body, ul, div");
        const text = (sel) =>
          [...(body?.querySelectorAll(sel) ?? [])].map((s) => s.textContent.trim()).join("");
        const label = (details.querySelector("summary")?.textContent || "").trim().slice(0, 40);
        if (!text(".l-bg")) out.push(`${label} — nothing in Bulgarian`);
        if (!text(".l-en")) out.push(`${label} — nothing in English`);
      }
      return out;
    });
    assert.deepEqual(empty, [], empty.join("; "));

    // And the chips are real controls, which the disclosure test above checks
    // for the first `summary.disclose` on the page — these are the ones inside
    // the results card, which that test never reaches.
    const chips = await page.locator(".m-results summary.disclose").count();
    assert.ok(chips > 0, "the results card folds nothing, or folds it without a disclosure chip");
    assert.equal(
      await page.locator(".m-results summary.disclose .dc-caret").count(),
      chips,
      "a disclosure in the results card has no caret, so it reads as a badge"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("every verify link is drawn the same, in both cards", { skip }, async () => {
  // `.vlink` is the "↗" that makes a row checkable, and it is drawn in the
  // basket and in the ranked contributions — two components, so a scoped
  // `<style>` can only reach one of them. It did: the ranked list rendered
  // browser-default 14px sans with a solid underline and `white-space:
  // normal`, which on a 390px phone broke the line between «CP09» and its
  // arrow and left the arrow hanging alone.
  //
  // Comparing the two against each other rather than against literal values
  // is deliberate — the point is that neither can be restyled alone.
  await withApp(async (page, errors) => {
    const styles = await page.evaluate(() => {
      const read = (el) => {
        const s = getComputedStyle(el);
        return {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          color: s.color,
          whiteSpace: s.whiteSpace,
          borderBottomStyle: s.borderBottomStyle,
          textDecorationLine: s.textDecorationLine,
        };
      };
      const basket = document.querySelector("#sliders .vlink");
      const ranked = document.querySelector(".rank .vlink");
      return { basket: basket && read(basket), ranked: ranked && read(ranked) };
    });
    assert.ok(styles.basket, "no verify link in the basket");
    assert.ok(styles.ranked, "no verify link in the ranked contributions");
    assert.deepEqual(
      styles.ranked,
      styles.basket,
      "the two cards draw the same link differently — a scoped copy of `.vlink` " +
        "has come back into one component and left the other on browser defaults"
    );
    assert.equal(
      styles.ranked.whiteSpace,
      "nowrap",
      "the code and its arrow can break across lines"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a phone is asked before it is told", { skip }, async () => {
  // The order below 820px is ask, answer, refine: the pay field, then the
  // results, then everything the reader can leave alone. It used to be answer
  // then everything, which put the one input the whole page is priced off
  // 2,969px down a 6,670px page — five screens past the figures computed from
  // it.
  //
  // Asserted as an ordering rather than against pixel numbers, which move with
  // every copy edit. What must hold is the sequence, and that the field is
  // reachable without a scroll on the shortest phone we design for.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.waitForTimeout(300);

    const y = await page.evaluate(() => {
      const top = (sel) =>
        document.querySelector(sel)?.getBoundingClientRect().top + window.scrollY;
      return { pay: top(".m-pay"), results: top(".m-results"), inputs: top(".m-inputs") };
    });
    assert.ok(
      y.pay < y.results && y.results < y.inputs,
      `the phone order is not ask/answer/refine: pay=${y.pay} results=${y.results} inputs=${y.inputs}`
    );
    assert.ok(
      y.pay < 664,
      `the salary field is ${Math.round(y.pay)}px down — off the first screen of a 664px phone`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a portrait tablet gets two columns, not the phone stack", { skip }, async () => {
  // 820px is an iPad in portrait, and at 880 it was taking the phone layout —
  // salary field 2,465px down a screen with room for both columns side by
  // side. The breakpoint is the boundary, so it is checked from both sides:
  // one column below it, two above, and no width in between where the cards
  // overlap or the page scrolls sideways.
  await withApp(async (page, errors) => {
    for (const [width, columns] of [
      [390, 1],
      [820, 1],
      [821, 2],
      [1280, 2],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const side = await page.evaluate(() => {
        const pay = document.querySelector(".m-pay").getBoundingClientRect();
        const res = document.querySelector(".m-results").getBoundingClientRect();
        // Two columns when the results card starts to the right of the pay
        // card's right edge; one when it sits below it.
        return {
          sideBySide: res.left >= pay.right - 1,
          overlap: res.left < pay.right - 1 && res.top < pay.bottom - 1,
        };
      });
      assert.equal(
        side.sideBySide ? 2 : 1,
        columns,
        `at ${width}px the layout is ${side.sideBySide ? 2 : 1} column(s), expected ${columns}`
      );
      assert.ok(!side.overlap, `the cards overlap at ${width}px`);
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollW <= width, `the page is ${scrollW}px wide in a ${width}px viewport`);
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the two input cards read as one on a wide screen", { skip }, async () => {
  // The pay field is its own card so a phone can put the results between it
  // and the rest of the inputs. On a desktop that split has no reason to be
  // visible, so the seam is closed: no gap, and the join drawn once.
  //
  // The gap is the assertion that matters. The first attempt placed the two in
  // separate grid rows with the results card spanning both — the spanning card
  // sized the rows, `align-items: start` parked each input card at the top of
  // one far taller than it, and a 28px hole opened between two cards that are
  // supposed to look like one.
  await withApp(async (page, errors) => {
    const seam = await page.evaluate(() => {
      const pay = document.querySelector(".m-pay").getBoundingClientRect();
      const inputs = document.querySelector(".m-inputs").getBoundingClientRect();
      return {
        gap: Math.round(inputs.top - pay.bottom),
        leftAligned: Math.abs(inputs.left - pay.left) < 1,
      };
    });
    assert.ok(
      seam.gap <= 1,
      `there is a ${seam.gap}px hole between the pay card and the inputs card on a desktop`
    );
    assert.ok(seam.leftAligned, "the two input cards do not share a left edge");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a narrow column folds the ranked table and still adds up", { skip }, async () => {
  // Eight rows is about a screen and a half of table between the headline and
  // «в джоба» on a phone. A narrow list draws five and folds the rest, and the
  // fold is only safe because `rankedSplit` puts what it cut into the
  // remainder — so the fold is checked together with the remainder that makes
  // the lead sentence true, never on its own.
  await withApp(async (page, errors) => {
    const rows = () => page.locator(".rank .rankrow").count();
    const wide = await rows();
    assert.ok(wide > 5, `a desktop draws ${wide} ranked rows, so the fold cannot be observed`);

    await page.setViewportSize({ width: 390, height: 664 });
    await page.waitForTimeout(350);
    const narrow = await rows();
    assert.ok(narrow < wide, `a phone draws ${narrow} ranked rows, the same as a desktop`);
    assert.equal(
      await page.locator(".rank .rankrest").count(),
      1,
      "the folded rows left no remainder line, so the column no longer sums to the number rankLead promises"
    );

    // …and the rest are reachable. A cap with no way past it is a table that
    // decided for the reader which of their own groups they may see. Named
    // `.rank-all` rather than `.rank-more`, which the show-why control beside
    // it also wears: a selector matching both clicks whichever the DOM put
    // first, and the fold would go untested the day that order changes.
    await page.locator(".rank .rank-all").click();
    await page.waitForTimeout(300);
    assert.ok((await rows()) > narrow, "the show-all control did not unfold the rest of the table");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the placeholder's payslip and comparator wait for a salary", { skip }, async () => {
  // The gross, the deductions and the Sofia comparison are facts about
  // whoever earns the €900 placeholder until the reader replaces it — the same
  // reasoning that keeps the ladder row silent. Withholding them also keeps
  // the first paint short enough that the headline figure stays on the first
  // screen of a phone with the pay field above it.
  await withApp(async (page, errors) => {
    const pay = page.locator(".m-pay");
    const idle = await pay.innerText();
    // Matched on the payslip's own sentences, not on the word «бруто» alone:
    // the net/gross toggle is a CONTROL labelled with it, and it is drawn
    // whether or not anybody has typed. What must wait is the figures.
    assert.doesNotMatch(
      idle,
      /по договор|на ръка|осигуровки и|под средната|над средната/i,
      `the pay card describes a placeholder's payslip: ${idle.replace(/\s+/g, " ")}`
    );
    assert.equal(
      await pay.locator("details.payslip").count(),
      0,
      "a payslip was itemised for whoever earns the placeholder"
    );

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await pay.innerText();
    assert.match(
      answered,
      /по договор/i,
      "the payslip summary never appeared after a salary was typed"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("adding an income changes nothing until it is answered", { skip }, async () => {
  // A second field seeded with the €900 placeholder would add €900 to the rent
  // burden, the mortgage cap and the basket the moment it appeared — a figure
  // the reader never typed, moving every number on the page in the flattering
  // direction. So the row arrives empty and contributes nothing.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    // The gross out of the summary line, whichever of the two wordings is on
    // screen. The SENTENCE is expected to change — with two incomes it has to
    // say which one it is about — and the FIGURE is expected not to.
    const grossNow = async () =>
      /бруто\)[^\d]*([\d\s\u00a0\u202f]+)/.exec(await page.locator(".m-pay").innerText())?.[1];

    const before = await page.locator(".r-big").innerText();
    const grossBefore = await grossNow();
    assert.ok(grossBefore, "no gross was rendered for a typed salary");

    await page.getByRole("button", { name: /добави още един доход/i }).click();
    await page.waitForTimeout(400);

    assert.equal(await page.locator("#inEarner1").count(), 1, "no second field appeared");
    assert.equal(
      await page.locator(".r-big").innerText(),
      before,
      "an empty second income moved the reader's inflation figure"
    );
    assert.equal(
      await grossNow(),
      grossBefore,
      "an empty second income moved the household's gross"
    );
    assert.equal(
      await page.locator(".m-pay details.payslip").count(),
      1,
      "an empty second income drew a payslip for a person nobody described"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("two incomes are taxed as two contracts, not as one salary", { skip }, async () => {
  // THE DEFECT THIS FEATURE EXISTS TO FIX, checked on the rendered page rather
  // than on a function. Two people taking home €2,000 each are both under the
  // insurance ceiling, so their contracts come to ≈€5,078 gross. Adding the
  // nets first and inverting once applies one ceiling to two people and prints
  // ≈€4,761 — €317 a month adrift, inside every plausible band, and wrong in a
  // way no other test on this page can see.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2000");
    await page.getByRole("button", { name: /добави още един доход/i }).click();
    await page.locator("#inEarner1").fill("2000");
    await page.waitForTimeout(400);

    const pay = await page.locator(".m-pay").innerText();
    const gross = Number(
      (/по договорите \(бруто\) заедно ≈ ([\d\s ]+)/.exec(pay)?.[1] ?? "0").replace(/\D/g, "")
    );
    assert.ok(
      gross >= 5000,
      `the household's gross rendered as ${gross}, which is the single-salary ` +
        "inversion rather than the sum of two contracts"
    );
    // One payslip per person, because a payslip is a document one person gets.
    assert.equal(await page.locator(".m-pay details.payslip").count(), 2, "not one payslip each");
    assert.match(pay, /общо в домакинството/i, "the household total is not stated");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder ranks each earner, and marks each of them", { skip }, async () => {
  // The rungs are individual full-time earnings. Ranking a household total on
  // them reports two people on €900 each as out-earning 78% of Sofia — a
  // position nobody in that household holds.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("900");
    await page.getByRole("button", { name: /добави още един доход/i }).click();
    await page.locator("#inEarner1").fill("900");
    await page.waitForTimeout(400);

    const row = page.locator(".r-row").filter({ hasText: "къде си по заплата" });
    assert.equal(await row.locator(".pctbar .me").count(), 2, "not one marker per earner");
    // The per-income lines are the working behind the corner's range and sit
    // one tap in. Opened here rather than asserted through the closed
    // disclosure, because what this test is about is that each income is
    // ranked on its own rung — not where on the card that is said.
    await row.locator("details.rr-more summary").first().click();
    await page.waitForTimeout(200);
    const text = await row.innerText();
    assert.match(text, /доход 1/i, "the first income has no line of its own");
    assert.match(text, /доход 2/i, "the second income has no line of its own");
    // Two equal earners sit at the same rung, so the corner states one figure
    // rather than a range — and it is each of theirs, not their sum's.
    const alone = /доход 1[^\n]*изпреварва[^\d]*(\d+)%/i.exec(text)?.[1];
    assert.ok(alone, `no rank was rendered for the first income: ${text.replace(/\s+/g, " ")}`);
    assert.ok(
      Number(alone) < 50,
      `€900 was ranked at the ${alone}th percentile — the household total was ranked instead`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("switching to gross moves the field and nothing else", { skip }, async () => {
  // The toggle is a display choice, the same contract the basket's %/€ toggle
  // keeps: the number in the box changes and no result does. Re-reading the
  // typed 900 as a gross instead would rewrite every figure on the page while
  // the reader believes they changed a label.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const inflation = await page.locator(".r-big").innerText();
    const pairBefore = await page.locator(".m-pay .pair").innerText();

    await page.getByRole("button", { name: /^бруто$/i }).click();
    await page.waitForTimeout(400);

    const typed = Number(await page.locator("#inSalary").inputValue());
    assert.ok(
      typed > 2400 * 1.2,
      `the field still reads ${typed} — the toggle relabelled the number instead of converting it`
    );
    assert.equal(
      await page.locator(".r-big").innerText(),
      inflation,
      "flipping the basis moved the reader's inflation figure"
    );
    assert.equal(
      await page.locator(".m-pay .pair").innerText(),
      pairBefore,
      "flipping the basis moved the net/gross pair it is supposed to leave alone"
    );

    // Back again restores exactly what was typed, rather than a rounded
    // conversion of a rounded conversion.
    await page.getByRole("button", { name: /^нето$/i }).click();
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator("#inSalary").inputValue(),
      "2400",
      "the salary crept on a round trip"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "each income is asked for its own raise, and the row waits for all of them",
  { skip },
  async () => {
    // A household's rise is not one number people share, and a blank read as 0%
    // is an invented figure that drags the combined answer down. So the pocket
    // row names the income still missing rather than answering around it.
    await withApp(async (page, errors) => {
      await page.locator("#inSalary").fill("1000");
      await page.getByRole("button", { name: /добави още един доход/i }).click();
      await page.locator("#inEarner1").fill("1000");
      await page.waitForTimeout(400);

      assert.equal(
        await page.locator("#inRaise1").count(),
        1,
        "the second income got no raise field"
      );

      await page.locator("#inRaise").fill("20");
      await page.waitForTimeout(400);
      const row = page.locator(".r-row").filter({ hasText: "джоб" }).first();
      const waiting = await row.innerText();
      assert.match(
        waiting,
        /доход 2/i,
        `the row did not name the income it is waiting for: ${waiting.replace(/\s+/g, " ")}`
      );

      await page.locator("#inRaise1").fill("0");
      await page.waitForTimeout(400);
      const answered = await row.innerText();
      // €1,000 each, one at +20% and one at nothing: the household went from
      // €1,833 to €2,000, a rise of 9.1% — NOT the 10% a plain average gives.
      assert.match(
        answered,
        /9[.,]1%/,
        `the combined raise was not weighted by the earlier pay: ${answered.replace(/\s+/g, " ")}`
      );
      assert.match(
        answered,
        /доход 1: \+20/i,
        "the parts the combined figure was built from are not shown"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the share card draws the reader's own comparison, and no euro figure", { skip }, async () => {
  await withApp(async (page, errors) => {
    // A weight moved onto transport, so the basket parts company with the
    // official one and the card has a verdict to state.
    await page.locator("#inSalary").fill("2400");
    await page.locator('input[type="range"]').nth(6).fill("40");
    await page.waitForTimeout(600);

    const block = page.locator("section.share");
    assert.equal(await block.count(), 1, "no share block at the foot of the results");

    // The picture exists and has actually been painted. A canvas that was
    // never drawn is the failure this suite is for: every other test in the
    // repository would stay green while the reader sees an empty rectangle.
    const painted = await page.evaluate(() => {
      const canvas = document.querySelector("section.share canvas");
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        if (seen.size > 4) break;
      }
      return { width: canvas.width, height: canvas.height, colours: seen.size };
    });
    assert.ok(painted, "the share block rendered no canvas");
    assert.deepEqual(
      { width: painted.width, height: painted.height },
      { width: 1200, height: 630 },
      "the export is not the 1200x630 every unfurler crops least"
    );
    assert.ok(painted.colours > 2, "the canvas is one flat colour, so nothing was drawn on it");

    // It leaves the page as a PNG, which is what a share sheet and a chat
    // window both take. Produced from the canvas, so nothing is fetched.
    const png = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL("image/png").slice(0, 22)
    );
    assert.equal(png, "data:image/png;base64,", png);

    // P2, on the surface the reader is about to send: `extraPerMonth` is
    // salary x r/(100+r) and inverts exactly, so a euro figure beside the rate
    // publishes the 2,400 typed above. The results card above this block is
    // full of them; this block may carry none.
    const shown = await block.innerText();
    assert.doesNotMatch(shown, /€|(?<!\p{L})(EUR|евро|лв)(?!\p{L})/iu, shown.replace(/\s+/g, " "));
    assert.doesNotMatch(shown, /2[\s,.]?400/, `the salary reached the share block: ${shown}`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the share text names both rates and a way back to the site", { skip }, async () => {
  await withApp(async (page, errors) => {
    await page.locator('input[type="range"]').nth(6).fill("40");
    await page.waitForTimeout(600);

    // Rendered rather than hidden behind the copy button: where the clipboard
    // API is unavailable this IS the message, and it can be selected by hand.
    const message = await page.locator("section.share .sh-msg").innerText();
    assert.match(message, /https:\/\/vyarno\.bg/, `no route back to the site: ${message}`);
    // Two rates, so a recipient who has never opened the site can place the
    // sender's number against something. One number alone is a claim nobody
    // can read.
    const rates = message.match(/-?\d+,\d+%/g) ?? [];
    assert.ok(rates.length >= 2, `the message states no comparison: ${message}`);

    // Three surfaces, and the fallbacks are always there. The share sheet is
    // absent in headless Chromium, which is exactly the desktop case: the
    // reader must still be able to copy the text and download the picture.
    for (const name of [/копирай текста/i, /свали картинката/i]) {
      assert.equal(await page.getByRole("button", { name }).count(), 1, `missing: ${name}`);
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the shared picture follows the reader's theme and language", { skip }, async () => {
  await withApp(async (page, errors) => {
    // Reading the pixel is a second state question, and the canvas answers it
    // itself: `ShareCard`'s draw is debounced and waits on `document.fonts`, so
    // an unpainted canvas hands back transparent black — a colour, which every
    // comparison below would accept. Alpha is what says it has been drawn.
    const painted = () =>
      page.waitForFunction(() => {
        const canvas = document.querySelector("section.share canvas");
        return Boolean(canvas) && canvas.getContext("2d").getImageData(4, 4, 1, 1).data[3] > 0;
      });
    const corner = async () => {
      await painted();
      return page.evaluate(() => {
        const canvas = document.querySelector("section.share canvas");
        const { data } = canvas.getContext("2d").getImageData(4, 4, 1, 1);
        return `${data[0]},${data[1]},${data[2]}`;
      });
    };
    /**
     * Wait for the card to be REDRAWN, then let the assertion speak.
     *
     * A repaint has no state of its own to poll — the canvas was already
     * opaque — so the change itself is the signal, and the bound exists only to
     * cap how long a card that never redraws stalls the suite. It returns the
     * instant the pixels move, so it is not a duration the runner has to keep
     * up with; on the failure it is bounding, the assertion below reports what
     * went wrong rather than a timeout.
     */
    const redrawn = (was) =>
      page
        .waitForFunction(
          (prev) => document.querySelector("section.share canvas").toDataURL() !== prev,
          was,
          { timeout: 5000 }
        )
        .catch(() => {});

    const light = await corner();
    const png = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL()
    );
    await page.locator("header.site .pill").first().click();
    await redrawn(png);
    const dark = await corner();
    // Both themes are AA-verified by verify_contrast.mjs, and the card is
    // drawn from the same custom properties — so a card that ignored the theme
    // would be standing on a palette nothing has ever checked.
    assert.notEqual(light, dark, "the card kept the light ground in the dark theme");

    // A picture carries one language, so it is drawn in the one the reader is
    // looking at rather than left to the .l-bg/.l-en CSS the rest of the app
    // switches with.
    const before = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL()
    );
    await page.locator("header.site .pill").nth(1).click();
    await redrawn(before);
    const after = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL()
    );
    assert.notEqual(before, after, "the card stayed in the same language as the page changed");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test.after(async () => {
  await browser?.close();
  site?.server.close();
});
