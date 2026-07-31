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
import { fileURLToPath } from "node:url";
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
async function openApp(path = "/") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
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
 */
async function withApp(fn, path = "/") {
  const { page, errors } = await openApp(path);
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
      ["inputs card", ".m-grid > .m-card"],
      ["basket sliders", "#sliders .cat"],
      ["results card", ".r-big"],
      ["result rows", ".r-row"],
      ["method drawer", "details.how"],
      ["share button", ".sharebtn"],
      ["national strip", ".strip .stat"],
      ["explainer band", ".explain-band"],
      ["footer", "footer"],
    ]) {
      assert.ok(await page.locator(selector).first().count(), `${what} (${selector}) is missing`);
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  });
});

test("the footer's donate link is a link, on every page", { skip }, async () => {
  // The footer is shared, so this is the ask as a reader meets it on the
  // calculator — not on `/legal/`, where they already went looking for it.
  //
  // The computed-background assertion is the one that needs a browser, and it
  // is the rule this suite exists to hold: `support.js` rule 1 forbids the ask
  // growing into a component, and "a donate button" is what every donation
  // guide recommends adding next. A CSS rule filling it in reads as a tidy
  // style tweak in a diff and lands as the thing the module forbids by name.
  await withApp(async (page, errors) => {
    const donate = page.locator("footer a.donate");
    assert.equal(await donate.count(), 1, "the footer prints exactly one donate link");

    const href = await donate.getAttribute("href");
    assert.match(href ?? "", /^https:\/\//, `the donate link is not absolute https: ${href}`);
    assert.equal(
      await donate.getAttribute("rel"),
      "noopener",
      "an outbound link opened in a new tab needs rel=noopener"
    );
    assert.ok(
      (await donate.innerText()).trim().length > 0,
      "the donate link renders no text — a missing string is a blank line, not a fallback"
    );

    const bg = await donate.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.match(
      bg,
      /rgba\(0, 0, 0, 0\)|transparent/,
      `the donate link is drawn with a filled background (${bg}), which makes it ` +
        "a button. support.js rule 1: the ask is one quiet line and one link."
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

test.after(async () => {
  await browser?.close();
  site?.server.close();
});
