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
  // Two routes, and the pair is the assertion. The header belongs to the
  // calculator alone — `/legal/` and `/support/` write their own — so a reader
  // who walked into one of those has only the footer, and a reader who never
  // scrolls has only the header.
  await withApp(async (page, errors) => {
    const inHeader = page.locator('header.site .controls a[href="/how/"]');
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

test("the header still fits a phone with the route on it", { skip }, async () => {
  // The bar is a fixed 54px holding a wordmark and three controls, and the
  // route to `/how/` is the third. At 360px the brand's tagline wrapped to two
  // lines inside that fixed height — the promise «икономиката, честно»
  // rendered as a layout fault — so under 400px the tagline is what gives.
  // Nothing about that is visible from the markup, which is why it is measured.
  await withApp(
    async (page, errors) => {
      const bar = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const brand = document.querySelector("header.site .brand");
        const controls = [...document.querySelectorAll("header.site .controls > *")];
        return {
          vw,
          barHeight: Math.round(
            document.querySelector("header.site .bar").getBoundingClientRect().height
          ),
          brandHeight: Math.round(brand.getBoundingClientRect().height),
          taglineShown: Boolean(document.querySelector("header.site .brand small")?.offsetHeight),
          controls: controls.length,
          rightmost: Math.round(
            Math.max(...controls.map((el) => el.getBoundingClientRect().right))
          ),
        };
      });
      assert.equal(bar.controls, 3, `the header carries ${bar.controls} controls, expected 3`);
      assert.ok(
        bar.rightmost <= bar.vw + 1,
        `a header control reaches ${bar.rightmost}px past the ${bar.vw}px viewport`
      );
      assert.ok(
        bar.brandHeight <= bar.barHeight,
        `the brand is ${bar.brandHeight}px tall in a ${bar.barHeight}px bar — it has wrapped`
      );
      assert.equal(bar.taglineShown, false, "the tagline is still drawn on a 360px bar");
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    { viewport: { width: 360, height: 800 } }
  );
});

test("every page carries a route to the country page, except itself", { skip }, async () => {
  // The footer is on all five pages, so it is what makes `/how/` reachable from
  // the two that write their own header. `/how/` is the exception: a page that
  // links to itself is noise, and the four document links in the same row
  // already follow that rule.
  for (const path of ["/legal/", "/support/"]) {
    await withApp(
      async (page, errors) => {
        assert.equal(
          await page.locator('footer.site a[href="/how/"]').count(),
          1,
          `${path} offers no route to /how/`
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      path,
      {}
    );
  }
  await withApp(
    async (page, errors) => {
      assert.equal(
        await page.locator('footer.site a[href="/how/"]').count(),
        0,
        "/how/ links to itself in its own footer"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/how/",
    {}
  );
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

test.after(shutdown);
