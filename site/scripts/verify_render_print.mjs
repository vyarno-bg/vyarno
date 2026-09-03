/**
 * What the site becomes on paper.
 *
 * Print is the one medium nothing else in this repository looks at, and its
 * failure mode is the worst available: silently wrong, on a format a reader
 * takes into a meeting. Every assertion here is made under
 * `emulateMedia({media: "print"})` against the built page, so it measures what
 * a printer receives rather than what `print.css` declares.
 *
 * The rule the file exists for is `P9`: verifiability scales down and never
 * away. Paper CAN carry a link, so on paper every source address is printed —
 * and a printed Вярно page that cannot be checked has lost the argument it
 * exists to make.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

/** Put the page into print media and let the styles settle. */
async function printing(page) {
  await page.emulateMedia({ media: "print" });
  // 250 ms, not 120: `tokens.css` declares `transition: background 0.2s,
  // color 0.2s` on `body`, and an assertion that runs inside that 200 ms
  // window reads a colour value interpolated between the two states — a
  // value the test would then pin into a sentinel with a number that varies
  // by runner. The only suite that exposed this was the dark-theme one,
  // but every other suite that calls `printing()` runs the same transition
  // path on a fresh page-load, so the wait lives here rather than at the
  // call site.
  await page.waitForTimeout(250);
}

test("a page printed in the dark theme comes out on a light ground", { skip }, async () => {
  // A dark theme printed is a full-bleed black rectangle per sheet: unreadable
  // on a monochrome laser, most of a cartridge on anything else, and the reader
  // who chose it chose it for a screen. The dark block is gated with `@media
  // screen` in `tokens.css` rather than restated in `print.css`, so what this
  // measures is that the light palette is what remains in effect.
  //
  // Measured as luminance rather than as a hex value: the assertion is that
  // paper is light, and pinning the exact colour would go red on any retune of
  // a palette `verify_contrast.mjs` already governs.
  //
  // **Switch to print media BEFORE setting `data-theme="dark"`.** `body` in
  // `tokens.css` carries `transition: background 0.2s, color 0.2s`, and
  // applying dark first then print sets `--paper` from `#10140f` to `#fff`
  // mid-transition; the 120 ms wait then lands on an interpolated colour
  // (RGB ≈ 240..255 across all channels) that varies by runner and trip the
  // `> 0.9` luminance threshold. Going print-first means `data-theme="dark"`
  // changes `--paper` only under `@media screen`, which is inactive in print
  // media, so `body { background: var(--paper) }` resolves to `#fff` either
  // way and no transition runs.
  await withApp(async (page, errors) => {
    await printing(page);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const screen = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--paper").trim()
    );
    const paper = await page.evaluate(() => {
      const rgb = getComputedStyle(document.body)
        .backgroundColor.match(/[\d.]+/g)
        .map(Number);
      return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    });
    assert.ok(
      paper > 0.9,
      `the dark theme prints a ground of luminance ${paper.toFixed(2)} (screen --paper is ${screen})`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("every source link prints the address behind it", { skip }, async () => {
  // The links are the product. On screen «точно това число» is a click; on
  // paper it was underlined text pointing nowhere, so a printed page of sourced
  // official statistics carried no way to check a single figure.
  //
  // Asserted through the rendered pseudo-element rather than through the
  // stylesheet, and on the page with the most of them.
  await withApp(async (page, errors) => {
    await printing(page);
    const r = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="http"]')];
      const missing = links.filter(
        (a) => !getComputedStyle(a, "::after").content.includes(a.getAttribute("href"))
      );
      return {
        total: links.length,
        missing: missing.slice(0, 3).map((a) => a.getAttribute("href")),
      };
    });
    assert.ok(r.total > 20, `only ${r.total} external links on /market/ — the page changed shape`);
    assert.deepEqual(r.missing, [], `links printed with no address: ${r.missing.join(" ")}`);
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/market/");
});

test("nothing printed is wider than the sheet", { skip }, async () => {
  // On paper an element past the page box is LOST, not scrolled — there is no
  // scrollbar to reach it with. Two screen-correct rules cause it: a cell held
  // on one line so a period cannot be split from its publisher, and a table in
  // an `overflow-x: auto` box so a phone never scrolls the document sideways.
  // Both carry a printed URL now, which is the content that goes over the edge.
  //
  // Measured against the body's own box at a page-width viewport, which is what
  // the printer's page box corresponds to.
  for (const route of ["/", "/market/", "/how/"]) {
    await withApp(
      async (page) => {
        await printing(page);
        const over = await page.evaluate(() => {
          const limit = document.body.getBoundingClientRect().right;
          const out = [];
          for (const el of document.querySelectorAll("body *")) {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if (box.right > limit + 2)
              out.push(
                `${el.tagName.toLowerCase()}.${
                  String(el.className)
                    .replace(/svelte-\S+/g, "")
                    .trim()
                    .split(/\s+/)[0] ?? ""
                } +${Math.round(box.right - limit)}px`
              );
          }
          return [...new Set(out)].slice(0, 5);
        });
        assert.deepEqual(over, [], `${route} prints past the page box: ${over.join(" | ")}`);
      },
      route,
      { viewport: { width: 794, height: 1123 } }
    );
  }
});

test("the working prints and the raw series does not", { skip }, async () => {
  // Every disclosure is closed on a printed page, so the derivations — the
  // method this project exists to publish — were absent from paper entirely.
  // They are forced open, with one exception the markup already names: a
  // `.numbers` disclosure holds the upstream's own series, 355 rows across
  // `/market/`, which is seven sheets of index values and is what the verify
  // link beside it fetches. The working is what paper is for; the dump is what
  // the URL is for.
  await withApp(
    async (page) => {
      await printing(page);
      // `checkVisibility`, not a bounding box: a subtree skipped by
      // `content-visibility` keeps its laid-out geometry for the geometry APIs,
      // so a rect here reports 3,154px for content the printer never receives.
      const r = await page.evaluate(() => {
        const shown = (sel) => {
          const d = [...document.querySelectorAll(sel)].find((x) => !x.open);
          if (!d) return null;
          const kid = d.querySelector(":scope > *:not(summary)");
          return kid ? kid.checkVisibility({ contentVisibilityAuto: true }) : null;
        };
        return { method: shown("details.method"), numbers: shown("details.numbers") };
      });
      assert.equal(
        r.method,
        true,
        "a closed method disclosure prints nothing, so the working is off the sheet"
      );
      assert.equal(
        r.numbers,
        false,
        "the raw series prints, which is seven sheets of index values"
      );
    },
    "/market/",
    { viewport: { width: 794, height: 1123 } }
  );
});

test("the masthead prints its name and not its controls", { skip }, async () => {
  // Sticky positioning prints the bar over whatever the first page break put
  // under it, and the four routes and two switches are affordances for a
  // cursor. The wordmark stays: it is what says whose figures these are.
  await withApp(async (page, errors) => {
    await printing(page);
    const r = await page.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().height > 0 : null;
      };
      return {
        position: getComputedStyle(document.querySelector("header.site")).position,
        routes: vis("header.site nav.routes"),
        controls: vis("header.site .controls"),
        brand: vis("header.site .brand"),
      };
    });
    assert.notEqual(r.position, "sticky", "the masthead is still sticky on paper");
    assert.equal(r.routes, false, "the route words print, and none of them does anything");
    assert.equal(r.controls, false, "the theme and language switches print");
    assert.equal(
      r.brand,
      true,
      "the wordmark does not print, so the sheet says whose figures these are nowhere"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test.after(shutdown);
