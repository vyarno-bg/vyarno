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
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
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
    // decided for the reader which of their own groups they may see.
    await page.locator(".rank .rank-more").click();
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
    await page.waitForTimeout(600);
    const corner = () =>
      page.evaluate(() => {
        const canvas = document.querySelector("section.share canvas");
        const { data } = canvas.getContext("2d").getImageData(4, 4, 1, 1);
        return `${data[0]},${data[1]},${data[2]}`;
      });

    const light = await corner();
    await page.locator("header.site .pill").first().click();
    await page.waitForTimeout(700);
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
    await page.waitForTimeout(700);
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
