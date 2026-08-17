/**
 * The responsive layouts, and the routes between pages.
 *
 * A phone, a portrait tablet and a wide screen get three different
 * arrangements of the same page, and the failure each guards against is a
 * figure the reader cannot reach: an input five screens below the numbers
 * priced off it, a table that overflows the viewport instead of scrolling
 * inside its own column, a header that stops fitting once the route is on it.
 *
 * Asserted as ORDERING and as containment rather than against pixel numbers,
 * which move with every copy edit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

test("the country page is reachable without opening anything", { skip }, async () => {
  // `/how/` carries every figure the site runs on, with its publisher and its
  // period — the answer to "where does this come from", which is the question a
  // first-time reader has before they trust a number. A route that answers it
  // four thousand pixels down and behind a click — the explainer's disclosure
  // at the foot of the calculator is where one would naturally go — arrives
  // after the reader has already decided whether to believe the page.
  //
  // Two routes, and the pair is the assertion. The header's route out is the
  // one the reader is not on — `/legal/` and `/support/` carry «← към
  // калкулатора» in the same slot — so a reader who walked into one of those
  // has only the footer, and a reader who never scrolls has only the header.
  await withApp(async (page, errors) => {
    const inHeader = page.locator('header.site .routes a[href="/how/"]');
    assert.equal(await inHeader.count(), 1, "the calculator's header carries no route to /how/");
    assert.ok((await inHeader.innerText()).trim(), "the header's route to /how/ has no label");

    const inFooter = page.locator('footer.site a[href="/how/"]');
    assert.equal(await inFooter.count(), 1, "the calculator's footer carries no route to /how/");

    // Not inside the landmark that discharges ЗЕТ чл. 4 — that nav is labelled
    // "legal" and holds what the law asks for, which a page of figures is not.
    assert.equal(
      await page.locator('footer.site nav.legal-links a[href="/how/"]').count(),
      0,
      "the route to /how/ was put inside the legal landmark"
    );

    // And it actually goes there rather than merely being drawn.
    await inHeader.click();
    await page.waitForURL(/\/how\/?$/);
    assert.ok(await page.locator("main.how").count(), "the header link did not land on /how/");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

/**
 * Every entry, in both languages, at the two widths that decide the bar.
 *
 * `/` in Bulgarian was the whole of this test, and that is exactly how the bar
 * came to run off the right edge of every English page unnoticed. The bar is
 * decided by WORDS: «числата» is 71px and "the numbers" was 106px, «← към
 * калкулатора» is 149px and "← to the calculator" was 169px, and "Vyarno" is
 * 18px wider than «Вярно» before a single control is drawn. Measured at 360px
 * before the fix, /en/ ran to 383px and the other four English entries to
 * 386px, so the document scrolled sideways and took the sticky header and every
 * paragraph with it — on half the site, at the width most readers arrive at.
 *
 * So the route list is every route, and the language is half of what makes a
 * case. 320px is here because it is the narrowest phone still in use and the
 * one that has no margin at all; the bar wraps rather than overflowing if it
 * ever runs out of room there, and the assertion below is about the document,
 * not about the row count.
 */
const BAR_ROUTES = [
  "/",
  "/how/",
  "/market/",
  "/credit/",
  "/legal/",
  "/support/",
  "/404.html",
  "/en/",
  "/en/how/",
  "/en/market/",
  "/en/credit/",
  "/en/legal/",
  "/en/support/",
];

for (const path of BAR_ROUTES) {
  for (const width of [320, 360]) {
    test(`the header fits a ${width}px phone on ${path}`, { skip }, async () => {
      await withApp(
        async (page, errors) => {
          const bar = await page.evaluate(() => {
            const vw = document.documentElement.clientWidth;
            // What a reader can see. Three of the bar's controls are written as
            // a `.l-bg` / `.l-en` pair — the routes and the language link,
            // whose hrefs differ by language — so the DOM holds more elements
            // than it draws. A count over the DOM would measure how the markup
            // is assembled; what has to fit is what is drawn.
            const controls = [...document.querySelectorAll("header.site .controls > *")].filter(
              (el) => el.offsetParent !== null
            );
            const boxes = [document.querySelector("header.site .brand"), ...controls].map((el) =>
              el.getBoundingClientRect()
            );
            // WCAG 2.5.5, over every target the bar draws. The skip link is out
            // by name: it sits off-screen until focused, so it has no box to
            // hold. Counted rather than listed because one undersized control
            // is the whole finding — the theme button measured 23.8x27 here,
            // under even 2.5.8's 24x24, and nothing in the repo could see it.
            const targets = [
              ...document.querySelectorAll("header.site a:not(.skip), header.site button"),
            ]
              .filter((el) => el.offsetParent !== null)
              .map((el) => el.getBoundingClientRect());
            return {
              vw,
              docWidth: Math.round(document.documentElement.scrollWidth),
              undersized: targets.filter((b) => b.width < 44 || b.height < 44).length,
              taglineShown: Boolean(
                document.querySelector("header.site .brand small")?.offsetHeight
              ),
              rightmost: Math.round(Math.max(...targets.map((b) => b.right))),
              // One row, measured as one row. Not by a shared top edge — the
              // wordmark and a button and four anchors are not the same height,
              // and `align-items: center` gives each its own top. What makes a
              // row is that every box overlaps every other vertically.
              rowGap: Math.round(
                Math.max(...boxes.map((b) => b.top)) - Math.min(...boxes.map((b) => b.bottom))
              ),
            };
          });
          // The document, not the bar. An overflowing control is only a problem
          // because of what it does to everything else on the page.
          assert.equal(
            bar.docWidth,
            bar.vw,
            `${path} at ${width}px scrolls ${bar.docWidth - bar.vw}px sideways`
          );
          assert.ok(
            bar.rightmost <= bar.vw + 1,
            `on ${path} at ${width}px a header control reaches ${bar.rightmost}px ` +
              `past the ${bar.vw}px viewport`
          );
          assert.equal(
            bar.undersized,
            0,
            `on ${path} at ${width}px ${bar.undersized} header target(s) are under 44x44`
          );
          // THE CONTROL ROW stays one row, in both languages. The routes take a
          // line of their own below 760px and that is the design; the wordmark
          // and the two toggles sharing theirs is what a longer word in either
          // language would break, and wrapping hides it — the document stops
          // scrolling sideways and every width check passes while the sticky
          // header quietly grows another 52px.
          //
          // 320px is left out on purpose: it is below the width this bar is
          // designed to hold, and the wrap is the answer there rather than a
          // failure.
          if (width === 360) {
            assert.ok(
              bar.rowGap < 0,
              `on ${path} at 360px the control row has wrapped — ${bar.rowGap}px of ` +
                "clear air between two controls"
            );
            assert.equal(bar.taglineShown, false, `${path} still draws the tagline at 360px`);
          }
          assert.deepEqual(errors, [], errors.join(" | "));
        },
        path,
        { viewport: { width, height: 800 } }
      );
    });
  }
}

// Every page of published figures, and the footer is what makes each reachable
// from the pages whose header points back to the calculator instead.
//
// **A loop over all of them rather than a case for `/how/`, and that is the
// whole lesson of this test.** It checked one route while the footer was written
// as one `{#if}` per route, so when `/credit/` shipped as the sixth route and
// reached the masthead and not the footer, nothing here went red: the assertion
// named `/how/` and `/how/` was still fine. The rule is "every content route,
// from every page, except its own", and stated that way a seventh route is
// covered the moment it is added to the list below.
const CONTENT_ROUTES = ["/how/", "/market/", "/credit/"];

test("every page carries a route to every other page of figures", { skip }, async () => {
  for (const path of [...CONTENT_ROUTES, "/legal/", "/support/", "/"]) {
    await withApp(
      async (page, errors) => {
        for (const route of CONTENT_ROUTES) {
          const count = await page.locator(`footer.site a[href="${route}"]`).count();
          if (route === path) {
            // A page that links to itself is noise, and the four document links
            // in the same row already follow that rule.
            assert.equal(count, 0, `${path} links to itself in its own footer`);
          } else {
            assert.equal(count, 1, `${path} offers no route to ${route}`);
          }
        }
        // The routes are their own landmark: that nav is labelled "legal" and
        // holds what discharges ЗЕТ чл. 4, and a page of figures is not that.
        assert.equal(
          await page.locator('footer.site nav.legal-links a[href="/market/"]').count(),
          0,
          `${path} files a page of figures under the legal landmark`
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      path,
      {}
    );
  }
});

test("the method drawer fits a phone, and its table scrolls inside it", { skip }, async () => {
  // The calculator's counterpart to the `/how/` test above, and it fails
  // differently. Below 820px `.m-grid` is a single track, so a track sized to
  // its content is sized to the widest thing any card holds — the drawer's
  // five-column table, which needs about 446px. Every card in the stack then
  // draws 446px wide inside a 360px viewport: the salary field, the figures and
  // the header all sit off-centre and the reader drags the whole document
  // sideways to read prose that fits. `minmax(0, 1fr)` in card.css is what caps
  // the track at the viewport, and nothing else on the page reveals whether it
  // is there.
  //
  // The three parts go together deliberately. Capping the track without a
  // scroll box hands the overflow to `.how`, where reaching the «провери»
  // column drags the prose out of view; a box that is not a tab stop leaves the
  // last two columns unreachable by keyboard, which is the same defect the
  // country page's box was written to fix.
  await withApp(
    async (page, errors) => {
      const drawer = page.locator(".m-results details.how").first();
      assert.ok(await drawer.count(), "the method drawer is missing from the results card");
      await drawer.locator("summary").first().click();
      await page.waitForTimeout(250);

      const seen = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const box = document.querySelector(".m-results details.how .scroll");
        return {
          docScroll: document.documentElement.scrollWidth,
          docClient: vw,
          cards: [...document.querySelectorAll(".m-grid .m-card")].map((el) =>
            Math.round(el.getBoundingClientRect().right)
          ),
          box: box && {
            over: box.scrollWidth - box.clientWidth,
            right: Math.round(box.getBoundingClientRect().right),
            tabIndex: box.tabIndex,
            role: box.getAttribute("role"),
            label: (box.getAttribute("aria-label") ?? "").trim(),
          },
        };
      });

      assert.ok(
        seen.docScroll <= seen.docClient + 1,
        `the open drawer makes the page ${seen.docScroll}px wide in a ` +
          `${seen.docClient}px viewport`
      );
      assert.ok(seen.cards.length >= 3, `the phone stack rendered ${seen.cards.length} cards`);
      for (const right of seen.cards) {
        assert.ok(
          right <= seen.docClient + 1,
          `a card reaches ${right}px past the ${seen.docClient}px viewport, so the ` +
            "single grid track was sized by the drawer's table rather than by the phone"
        );
      }

      assert.ok(seen.box, "the drawer's table sits in no scroll box");
      assert.ok(
        seen.box.over > 0,
        "the drawer's table overflows nothing at 360px, so either it shrank out " +
          "of the shape this protects or the box stopped clipping and the page " +
          "is about to scroll instead"
      );
      assert.ok(
        seen.box.right <= seen.docClient + 1,
        `the drawer's scroll box reaches ${seen.box.right}px past the viewport`
      );
      assert.equal(seen.box.tabIndex, 0, "the drawer's scroll box is not a tab stop");
      assert.equal(seen.box.role, "region", "the drawer's focusable scroll box announces no role");
      assert.ok(seen.box.label, "the drawer's focusable scroll box has no accessible name");

      assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
    },
    "/",
    { viewport: { width: 360, height: 800 } }
  );
});

test("the sector picker is laid out like every other control in its card", { skip }, async () => {
  // It used to be the one side-by-side label-and-control pair here, with the
  // select shrinking into whatever was left beside «Твоят сектор». At 360px
  // that was 178px, which clipped «— избери дейност —» to «— избери дейно» on
  // the control whose options are НСИ's section names — the longest strings on
  // the page.
  //
  // Both widths, because the failure this replaced was a layout that depended
  // on measuring text: a `ch` floor is the font's own `0` advance, the select
  // falls back to a different face per platform, and the rule that wrapped the
  // row on Linux left it one line on Windows CI at 179px. Asserting the same
  // thing at 360 and at 1280 is what makes the check independent of whose font
  // is installed — a stacked field is full width at every width.
  //
  // And on the width rather than on the text fitting: a native <select> clips
  // its option without reporting overflow, so `scrollWidth` reads as content
  // that fits and passes the broken layout. Watched it do exactly that.
  for (const width of [360, 1280]) {
    await withApp(
      async (page, errors) => {
        const box = await page.evaluate(() => {
          const field = document.querySelector(".sector").getBoundingClientRect();
          const sel = document.querySelector("#sector-pick").getBoundingClientRect();
          const label = document.querySelector(".sector label").getBoundingClientRect();
          return {
            field: Math.round(field.width),
            sel: Math.round(sel.width),
            stacked: sel.top >= label.bottom,
          };
        });
        assert.ok(
          box.sel >= box.field - 2,
          `at ${width}px the sector picker is ${box.sel}px inside a ${box.field}px field, ` +
            "so it is sharing the line with its label and clipping НСИ's section names"
        );
        assert.ok(box.stacked, `at ${width}px the label is not on its own line above the picker`);
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/",
      { viewport: { width, height: 800 } }
    );
  }
});

test("a phone is asked before it is told", { skip }, async () => {
  // The order below 820px is ask, answer, refine: the pay field, then the
  // results, then everything the reader can leave alone. Answer-then-everything
  // is the arrangement that suggests itself — the figures are what the page is
  // for — and on a 6,670px phone page it puts the one input all of them are
  // priced off 2,969px down, five screens past the numbers computed from it.
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
        payFirst: pay.top < inputs.top,
        leftAligned: Math.abs(inputs.left - pay.left) < 1,
      };
    });
    // The order first, because the seam measurement cannot see it. `.m-col`
    // drawn bottom-up puts the salary field BELOW the thirteen sliders it
    // prices everything off — the same defect the phone stack above is
    // arranged to avoid, arriving on the desktop instead — and
    // `inputs.top - pay.bottom` then reads several hundred pixels NEGATIVE,
    // which is a hole reported as a seam closed tighter than asked.
    assert.ok(
      seam.payFirst,
      "the inputs card is drawn above the pay field on a wide screen. The " +
        "salary is what every figure on the page is priced off, so it is what " +
        "the column asks for first."
    );
    assert.ok(
      Math.abs(seam.gap) <= 1,
      `the pay card and the inputs card are ${seam.gap}px apart on a desktop, ` +
        "and the join between them is drawn once because they read as one card"
    );
    assert.ok(seam.leftAligned, "the two input cards do not share a left edge");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the unit glyph sits in the gutter the field reserves, not over the digits",
  { skip },
  async () => {
    // `.field .unit::after` writes the € or the % inside the input's own box, and
    // the input's `padding-right` is the room set aside for it. Anchored from the
    // wrong edge it lands on the first digit the reader types: the glyph is
    // `pointer-events: none`, so there is nothing to click, nothing throws, the
    // field reports the right value, and «900» is on screen as a € painted over
    // the 9.
    //
    // Read as resolved offsets because a pseudo-element has no box to measure —
    // an absolutely positioned one resolves BOTH `left` and `right` to used
    // values, so the pair answers where it actually landed whichever of the two
    // the rule set. Over every unit on the page rather than the first: the next
    // suffix added is the case this is for.
    await withApp(async (page, errors) => {
      const glyphs = await page.locator(".field .unit").evaluateAll((els) =>
        els.map((unit) => {
          const after = getComputedStyle(unit, "::after");
          const input = unit.querySelector("input");
          return {
            glyph: after.content,
            right: parseFloat(after.right),
            width: parseFloat(after.width),
            gutter: parseFloat(getComputedStyle(input).paddingRight),
          };
        })
      );
      assert.ok(
        glyphs.length >= 2,
        `${glyphs.length} unit suffixes are drawn, so this checks little`
      );
      for (const g of glyphs) {
        assert.ok(g.width > 0, `the ${g.glyph} suffix renders no glyph at all`);
        assert.ok(
          g.right >= 0 && g.right + g.width <= g.gutter,
          `the ${g.glyph} suffix reaches ${(g.right + g.width).toFixed(1)}px in from the ` +
            `field's right edge, past the ${g.gutter}px of padding the input keeps clear ` +
            "for it — so it is drawn over the reader's own digits"
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

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

test("the two marked links in the footer stay on one row", { skip }, async () => {
  // They are one flex item so that `justify-content: space-between` cannot
  // place them independently. Left as two, the row count decided where each
  // went: at 1100px the source finished one line and the Facebook page opened
  // the next, alone at the left edge beside the build stamp, reading as a
  // stray rather than as the pair it is.
  //
  // Asserted as "same row", not as coordinates, because the widths move with
  // every copy edit — and checked at a width where the row is genuinely tight,
  // since a wide viewport fits everything and proves nothing.
  //
  // NOT a gutter check. `--gutter` computes to 0 on a phone, so a footer link
  // ending at the viewport edge is the content edge and not an overflow; a
  // check written against the padding box there can never go red. What guards
  // `flex: 0 1 auto` is the pair of `the header fits a 320px phone` cases on
  // the English routes, whose longer labels push the document wide the moment
  // the pair may not shrink.
  await withApp(
    async (page, errors) => {
      const rows = await page.evaluate(() => {
        const marked = [...document.querySelectorAll("footer.site .marks a")];
        return marked.map((a) => Math.round(a.getBoundingClientRect().top));
      });
      assert.equal(rows.length, 2, `the footer carries ${rows.length} marked links, expected 2`);
      assert.equal(
        rows[0],
        rows[1],
        `the source and the Facebook page are drawn on different rows (${rows.join(" vs ")}), ` +
          "so one of them is alone at the end of the footer"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    { viewport: { width: 1100, height: 800 } }
  );
});

test.after(shutdown);
