/**
 * The national strip and the charts drawn beside it.
 *
 * Five one-number tiles and a card carrying a chart, plus the tax-wedge
 * figure. What these are for is the geometry a stylesheet cannot promise: a
 * row that leaves an orphaned cell, an SVG whose two axes scale differently,
 * a chart key naming a series the marks do not draw.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";
import { published } from "./published-payload.mjs";
import { bgNetSalary, payrollParams } from "../src/lib/mirror.js";
import { regionQuarter, regionRow, SOFIA_CITY_CODE } from "../src/lib/view/region.js";
import { periodLong } from "../src/lib/format.js";

/**
 * A period as the strip writes it, from the one implementation the site shares.
 *
 * Taken from `format.js` rather than restated here: the assertion is that the
 * card carries the period a reader is shown, and a second copy of the rule in
 * the test would go on passing over a card that had stopped using the first.
 */
const said = (value) => periodLong(value, "bg");

test("the housing card says which of its figures are ours", { skip }, async () => {
  // имот.bg publish one average per district and nothing for Sofia as a whole,
  // so the median across the districts, the price of a 70 m² home built on it
  // and the change since the baseline are all our arithmetic over their cells.
  // The card credits имот.bg and links to them, which is right for the district
  // averages and puts their name over our working for the other three — the
  // quiet way a card stops being checkable, because a reader who follows the
  // link finds nothing to match the number against (P3).
  //
  // /how/ has carried the disclosure beside the same three figures all along
  // and `verify_copy.mjs` holds it there; this is the calculator's copy of the
  // same obligation, on the surface most readers actually see.
  await withApp(async (page, errors) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
    const card = page.locator(".strip .stat.wide");
    assert.ok(await card.count(), "the housing card is not on the strip");
    const text = (await card.innerText()).replace(/\s+/g, " ");
    assert.match(
      text,
      /Това число е наше/,
      `the housing card credits имот.bg for figures we computed: ${text}`
    );
    assert.ok(
      await card.locator("a[href='/legal/#sources']").count(),
      "the disclosure no longer routes to the sources document, which carries " +
        "the Eurostat non-responsibility wording it is half of"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a strip card's source caption sits under its own content", { skip }, async () => {
  // `align-items: stretch` makes every card in a row as tall as the tallest,
  // and the median-pay card carries three footer lines to its neighbours' one.
  // With the caption pushed to the foot by `margin-top: auto`, each of the
  // others was handed that difference as a hole between its label and its
  // date: 175px in the inflation tile, 138px in the fastest-rising one, 199px
  // in unemployment, measured at 1280. The section read as four mostly-empty
  // boxes and each caption had come loose from the figure it dates.
  //
  // Asserted against whatever element precedes the caption rather than against
  // `.sl`, so it covers the housing card too — a sparkline sits between the
  // two there, and the rule is the same one: a caption follows the thing it
  // captions. The slack still exists and still goes somewhere; the point is
  // that it goes to the bottom of a short card, not into its middle.
  //
  // The bound is the caption's own 10px of padding plus room for a fractional
  // layout, well under any gap `margin-top: auto` produces on this row.
  await withApp(async (page) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
    const gaps = await page.locator(".strip .stat").evaluateAll((els) =>
      els.map((card) => {
        const ss = card.querySelector(".ss");
        const above = ss?.previousElementSibling;
        if (!ss || !above) return null;
        return {
          card: (card.querySelector(".sl")?.innerText ?? "?").replace(/\s+/g, " ").slice(0, 40),
          gap: Math.round(ss.getBoundingClientRect().top - above.getBoundingClientRect().bottom),
        };
      })
    );
    const measured = gaps.filter(Boolean);
    assert.ok(measured.length >= 5, `only ${measured.length} strip captions could be measured`);
    const adrift = measured.filter((g) => g.gap > 16);
    assert.deepEqual(
      adrift,
      [],
      "a strip card's source caption is pushed away from the content it " +
        `dates: ${adrift.map((g) => `${g.gap}px under "${g.card}"`).join(", ")}`
    );
  });
});

test("the national strip leaves no orphaned cell on its last row", { skip }, async () => {
  // The strip renders five one-number tiles plus one card carrying a chart. A
  // fixed-column grid held its column width, so the tail of the last row was an
  // empty cell — a 5-up row and a lone sixth card. The cards must fill their
  // row instead, and the wide chart card takes a row of its own, because a card
  // twice its neighbours' height stretches every tile beside it to match.
  await withApp(async (page, errors) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
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
      // The strip's city-scoped cards need an област picked: there is no default
      // (P7), so before a reader chooses they render what they are waiting for
      // rather than somebody else's figures.
      await page.selectOption("#region-select", "sofiya");
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

test("a strip card names its period in the source line and nowhere else", { skip }, async () => {
  // Each card is a figure, a label, and one `.ss` source line carrying the
  // publisher and the period. A period printed a second time somewhere else in
  // the same card is one fact with two homes: the two are rendered from
  // separate expressions and drift the day either payload field moves, and
  // until then the card just says the same month twice.
  //
  // Written over EVERY card rather than over the one that broke it. A check
  // naming the unemployment tile would stay green the moment the next card put
  // its own month beside its value, and the rule being kept is about the strip
  // — the reader learns once that the period lives under the figure, and that
  // holds for all six.
  //
  // Only the qualified forms count: 2026-07, 2026-Q1, 2026-07-23. A bare
  // four-digit year is deliberately NOT matched, because four digits is also
  // €2501 per square metre and 2015 on a chart axis, and a rule that fires on
  // those is one somebody switches off rather than one that catches anything.
  const PERIOD = /\d{4}-(?:Q[1-4]|\d{2}(?:-\d{2})?)/g;
  await withApp(async (page) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
    const cards = await page.locator(".strip .stat").evaluateAll((els) =>
      els.map((el) => {
        const withoutSource = el.cloneNode(true);
        for (const ss of withoutSource.querySelectorAll(".ss")) ss.remove();
        return {
          source: (el.querySelector(".ss")?.innerText ?? "").replace(/\s+/g, " "),
          rest: withoutSource.innerText.replace(/\s+/g, " "),
        };
      })
    );
    assert.ok(cards.length >= 5, `the strip rendered ${cards.length} cards`);
    const repeats = cards.flatMap(({ source, rest }) =>
      [...new Set(source.match(PERIOD) ?? [])]
        .filter((p) => rest.includes(p))
        .map((p) => `"${p}" is in the source line AND in "${rest.trim().slice(0, 90)}"`)
    );
    assert.deepEqual(
      repeats,
      [],
      "a strip card prints its reference period twice, so one card answers " +
        `"when is this from" in two places:\n  ${repeats.join("\n  ")}`
    );
  });
});

test("the strip shows the same cards whatever the reader typed", { skip }, async () => {
  // Gating the Sofia average-wage card on a typed salary makes the section a
  // reader sees depend on their own input, while the card carries no figure
  // derived from it. A card count that shifts between five and six is also a
  // count no layout can be tuned for.
  await withApp(async (page) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
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

test("the Sofia card carries НСИ's own gross, not only our net", { skip }, async () => {
  // The card leads with a net, and НСИ publish no net for anything. That figure
  // is our payroll conversion of their published Sofia-city gross, so their cell
  // has to be on the card beside it and the conversion has to be ours in words.
  //
  // **Read out of the payload rather than written here**, so the assertion is
  // the identity — the number on the card IS the one in `region_salary.json` —
  // and not a constant that goes stale at the next quarterly refresh and gets
  // "fixed" by copying whatever the card now shows.
  //
  // `verify_copy.mjs` holds the same rule over the STRING, and it cannot hold
  // this: a template feeding the gross slot the net it already had satisfies
  // every check on the copy while the card says 1486 twice under НСИ's name.
  // The slot is asserted there; the value behind it is asserted here.
  //
  // **Both slots, and the period.** A caption with three placeholders has three
  // ways to carry the wrong figure, and asserting one of them proves the other
  // two nothing: feeding the NET slot the gross renders «1 915 € · ≈ 1 915 €
  // нето по наша сметка», which still shows НСИ's own cell and still attributes
  // the conversion, so a check on those two alone passes a card claiming their
  // Sofia average takes home every lev of it. The period is the same shape —
  // blanked to an em dash it leaves an undated wage under a dated credit.
  const wage = regionRow(published("region_salary"), SOFIA_CITY_CODE);
  // **The quarter comes from `regionQuarter`, which is what the card reads.**
  // `regionRow` returns the область's row and no period at all, so
  // `wage.ref_period` was `undefined` here — and `new RegExp(undefined)` is the
  // EMPTY pattern, which matches every string there is. The assertion below ran
  // on every green build and could not fail: a card with its date blanked to an
  // em dash would have passed it, which is precisely the case its own comment
  // says it exists for.
  const quarter = regionQuarter(published("region_salary"), SOFIA_CITY_CODE).refPeriod;
  const payroll = published("payroll");
  const gross = Math.round(wage.value_eur);
  assert.ok(gross > 0, "region_salary.json carries no value to render for Sofia-city");
  // Our conversion, through the same function the page runs it through, so the
  // assertion is the identity rather than a second implementation of the
  // payroll that would need updating whenever the rates move.
  const net = Math.round(bgNetSalary(wage.value_eur, payrollParams(payroll)).net);
  assert.ok(net > 0 && net < gross, "the payroll conversion did not produce a net below the gross");

  await withApp(async (page, errors) => {
    // **Pick an област first, because there is no default.** P7: the page shows
    // no city-scoped figure until a reader says where they live, so the card
    // this test is about does not exist before that. Selecting is therefore
    // part of the scenario rather than setup around it — and a run that
    // asserted without selecting would be asserting against the empty state.
    await page.selectOption("#region-select", "sofiya");

    // The AVERAGE card, by its own label, which now names the област. Matching
    // on the «НСИ» credit alone lands on the median card next to it, which
    // cites the same publisher as one of two inputs to a figure it says in as
    // many words is worked out — a dataset-and-vintage credit rather than a
    // claim about what НСИ printed.
    const stat = page
      .locator(".strip .stat", {
        hasText: /средна нетна заплата · София|average NET pay · Sofia/,
      })
      .first();
    // **The caption, not the card.** The card LEADS with the net, so a figure
    // asserted against the whole card is satisfied by the headline it was
    // already showing — the caption's own net slot can carry anything and the
    // match still lands. Every claim below is about what the «НСИ ·» credit
    // spans, so it is read off the line that carries the credit.
    const caption = await stat.locator(".ss").innerText();
    // Both thousands separators, because `integer()` groups per locale and the
    // BG and EN renderings of 1915 differ by the character between 1 and 915.
    const grouped = (n) => new RegExp(String(n).replace(/^(\d)(\d{3})$/, "$1\\s?$2"));
    assert.match(
      caption,
      grouped(gross),
      `НСИ publish ${gross} gross for Sofia and it is nowhere on the line that ` +
        `credits them — only a figure we derived from it:\n${caption}`
    );
    assert.match(
      caption,
      grouped(net),
      `our conversion of НСИ's ${gross} gross is ${net} net and the credit line ` +
        `shows neither — its net slot is carrying something else:\n${caption}`
    );
    assert.match(
      caption,
      /(по наша сметка|our conversion)/,
      `the gross-to-net step on the wage card is not attributed to us:\n${caption}`
    );
    // The quarter the two figures describe, written the way a reader says it.
    // Both are averages over one of НСИ's reporting periods and neither means
    // anything without it — «1 915 € · ≈ 1 486 € нето» dates a Q1 average to
    // nothing at all. Asserted in the READ form rather than the payload's own
    // key, because the strip sits directly under a bar that writes «числата са
    // към юни 2026 г.»: the same month in two notations on one screen is a
    // difference a reader has to convert before they can see it is not one.
    assert.match(
      caption,
      new RegExp(said(quarter)),
      `the wage card dates its figures to ${said(quarter)} nowhere:\n${caption}`
    );
    // **The star on НСИ's sheet, where the reader meets the number.** They mark
    // a whole year provisional until they finalise it, so their newest quarter
    // carries it for about a year — and this table and the sector card's are the
    // same publication read two ways, three rows apart on the same page. Shown
    // on one and not the other, a reader has no way to tell the two claims are
    // the same claim. Read off the payload, so a finalised quarter drops the
    // assertion with the marker rather than pinning a word that must go.
    if (published("region_salary")?.is_preliminary) {
      assert.match(
        caption,
        /(предварителни данни|preliminary)/,
        `${quarter} is still provisional at НСИ and the Sofia card shows ` +
          `it as settled:\n${caption}`
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("Eurostat's estimate is marked as one, on both surfaces", { skip }, async () => {
  // The headline rate reaches the reader twice on this page — the banner above
  // the calculator and the first strip card — and both print it as an official
  // figure with a month on it. On a flash that month's reading is Eurostat's
  // early estimate and it moves when the full release lands, so a page that
  // marks one surface and not the other tells a reader whichever it is they
  // happened to read.
  //
  // Driven off `is_flash` rather than asserting the marker unconditionally:
  // the payload is a flash today and will be a full release after the next
  // refresh, and a test pinned to the marker would then be failed by correct
  // data. The negative branch is not decoration either — it is what catches a
  // marker rendered whatever the payload says, which is the same defect from
  // the other side.
  const head = published("hicp_headline");
  const flash = head.is_flash === true;

  await withApp(async (page, errors) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
    const banner = await page.locator(".data-strip-inner .off-fig").innerText();
    const card = await page
      .locator(".strip .stat", { hasText: /инфлация за година|annual inflation/ })
      .first()
      .locator(".ss")
      .innerText();
    // The rendered marker, not a literal: the banner is uppercased by CSS, and
    // `innerText` returns what the reader sees, so a hardcoded «експресна»
    // never matches while the page is right.
    const MARK = /експресна оценка|flash estimate/i;
    for (const [where, text] of [
      ["banner", banner],
      ["strip card", card],
    ]) {
      assert.equal(
        MARK.test(text),
        flash,
        flash
          ? `hicp_headline.json is Eurostat's flash and the ${where} states the ` +
              `rate as settled:\n${text}`
          : `hicp_headline.json is a full release and the ${where} hedges it as ` +
              `an estimate anyway:\n${text}`
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("no SVG on the page is drawn with distorted axes", { skip }, async () => {
  // The Sofia sparkline was a fixed 110×22 box rendered at `width: 100%` with
  // `preserveAspectRatio="none"`, so at a card's real width the horizontal scale
  // was several times the vertical one: the 2px stroke thinned out and every
  // year's round marker rendered as an ellipse.
  await withApp(async (page, errors) => {
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
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
      // The strip's city-scoped cards need an област picked: there is no default
      // (P7), so before a reader chooses they render what they are waiting for
      // rather than somebody else's figures.
      await page.selectOption("#region-select", "sofiya");
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

      // **And it traces the marginal rate rather than a second copy of the
      // effective one.** Handed the same key, the two paths are the same
      // numbers: the wash sits exactly under the line for the whole plot, the
      // legend still names two series, both assertions above still pass, and
      // the chart's entire finding — that the effective rate falls above the
      // ceiling while the marginal rate holds — is drawn as a shape that says
      // nothing. Above the ceiling the wash's top edge has to be BELOW the
      // line, which is that gap and nothing else, so it is measured where the
      // frame cuts them: the fill is scanned down from the top of the plot at
      // the line's own end, and where it starts is where the wash's edge is.
      const series = await page
        .locator("svg.wedge")
        .first()
        .evaluate((svg) => {
          const wash = svg.querySelector("path.wedge-marginal");
          const line = svg.querySelector("path.wedge-effective");
          const baseY = Number(svg.querySelector("line.wedge-base").getAttribute("y1"));
          const end = line.getPointAtLength(line.getTotalLength());
          let washTop = null;
          for (let y = 0; y <= baseY && washTop === null; y += 0.25) {
            if (wash.isPointInFill(new DOMPoint(end.x - 3, y))) washTop = y;
          }
          return { lineEndY: end.y, washTop, baseY };
        });
      assert.ok(
        series.washTop !== null && series.washTop < series.baseY,
        "the wash has no filled height at the right edge of the frame, so the " +
          "marginal rate is drawn as nothing there"
      );
      assert.ok(
        series.washTop - series.lineEndY > 5,
        `at the frame's right edge the wash's top edge is at ${series.washTop} and the ` +
          `effective line ends at ${series.lineEndY} — the two coincide, so the chart ` +
          "draws one series twice and the drop above the ceiling is invisible"
      );

      // Each SERIES key is a swatch with real area. The ceiling's key is a rule,
      // because the mark it names is a rule.
      //
      // Asserted rather than skipped when the selector finds nothing: a `continue`
      // here means renaming a key's class — the one-character edit that leaves a
      // legend drawn and a swatch blank — passes this test with the loop having
      // measured nothing. An early exit on a missing element is a green test for a
      // deleted feature (docs/testing-strategy.md §"The standard a test has to
      // meet"), and it is the same rule the full-width card's test above states.
      for (const cls of [".wedge-key .e", ".wedge-key .m"]) {
        const swatch = page.locator(cls);
        assert.ok(
          await swatch.count(),
          `the key names no series at ${cls}, so either the swatch is gone or its ` +
            "class no longer matches the mark it stands for"
        );
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
    // The strip's city-scoped cards need an област picked: there is no default
    // (P7), so before a reader chooses they render what they are waiting for
    // rather than somebody else's figures.
    await page.selectOption("#region-select", "sofiya");
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

test.after(shutdown);
