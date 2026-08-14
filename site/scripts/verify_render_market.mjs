/**
 * `/market/` in a real browser — the page, and the promise it makes.
 *
 * The other render suites prove the calculator draws. This one proves the
 * property page keeps the three commitments that make it worth publishing, and
 * every one of them is invisible to a source-reading test:
 *
 * 1. **Every figure carries its provenance.** A `.stat` rendering a number with
 *    no source line under it is a figure a reader has to take on trust, and the
 *    whole argument of the page is that they should not have to.
 * 2. **Both languages are in the served HTML.** The prerender strips the half
 *    the entry does not declare, so a caption assembled from the language store
 *    would reach a crawler in one language — and this page is built to be
 *    quoted.
 * 3. **There is no input on it, ever.** The rule `/how/` follows, for the same
 *    reason: every derived value takes payloads rather than scalars, and a
 *    control appearing here is the first sign that stopped being true.
 *
 * The figures themselves are checked against the published payloads rather than
 * against literals. A test that hardcodes 16,227 dwellings passes for one
 * quarter and then reports the market as broken.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { withApp, shutdown, skip } from "./render-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "..", "data", "published");
const payload = (stem) => {
  try {
    return JSON.parse(readFileSync(join(DATA, `${stem}.json`), "utf8"));
  } catch {
    return null;
  }
};

test.after(shutdown);

/**
 * A `before` hook that serves one payload with an `as_of` far in the past.
 *
 * The freshness verdict is the one thing on these pages that no fixture and no
 * committed file can produce: it is computed against the reader's own clock, so
 * a suite running on green data can only ever see the state where nothing is
 * late. Ageing the file on its way to the tab is what puts the other state on
 * screen — and that state is the whole point of the line under test.
 *
 * The rest of the payload is served verbatim, so every figure on the page is
 * still the published one and the page under measurement is the real page.
 */
const servedStale = (stem) => async (page) => {
  const aged = { ...payload(stem), as_of: "2019-01-01" };
  await page.route(`**/data/published/${stem}.json`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(aged) })
  );
};

test("every figure on the market page carries a source under it", { skip }, async () => {
  // Cards and tables both, because most of this page's figures moved into
  // tables and a rule that only walks `.stat` would have gone on passing over a
  // page whose tables cite nothing. What has to be true is the same either way:
  // a digit with no publisher, no period and no link under it is a figure a
  // reader has to take on trust, and the whole argument of the page is that
  // they should not have to.
  await withApp(
    async (page, errors) => {
      const stats = page.locator("main.market .stat");
      const tables = page.locator("main.market table.fig-table");
      const cards = await stats.count();
      const tabled = await tables.count();
      assert.ok(
        tabled >= 5,
        `the market page draws ${tabled} figure tables — it should carry six sections'`
      );
      assert.ok(cards >= 3, `the market page draws ${cards} figure cards`);

      for (let i = 0; i < cards; i += 1) {
        const stat = stats.nth(i);
        const value = (await stat.locator(".sv").innerText()).trim();
        assert.match(
          value,
          /\d/,
          `card ${i} renders "${value}" with no digit in it — a blank payload ` +
            "field reaches the page as an empty stat rather than as an error"
        );
        const source = stat.locator(".ss a");
        assert.ok(
          (await source.count()) >= 1,
          `the figure "${value}" has no source link. Every digit on this page ` +
            "carries its publisher, its period and a link, or it should not be here."
        );
        const href = await source.first().getAttribute("href");
        assert.match(href ?? "", /^https?:\/\//, `the source link for "${value}" is not a URL`);
        const caption = (await source.first().innerText()).trim();
        assert.ok(
          caption.includes("·"),
          `the source line for "${value}" is "${caption}" — it should name the ` +
            "publisher and the period the figure describes"
        );
      }

      // Every table cites too, and the citation is the element after its scroll
      // box rather than something inside it: a caption inside a horizontally
      // scrolling region is one a phone reader has to scroll sideways to reach.
      const uncited = await tables.evaluateAll((els) =>
        els
          .map((el, i) => {
            // A table that cites on every ROW needs no line beside it. The
            // range strip is the case: six series against six different
            // windows, so one caption under it could not carry six periods and
            // the provenance sits on the row it belongs to.
            const rows = [...el.querySelectorAll("tbody tr")];
            if (rows.length && rows.every((r) => r.querySelector(".ss a[href^='http']"))) {
              return null;
            }

            const box = el.closest(".scroll") ?? el;
            // A numbers table publishes the series of the figure above it and
            // is cited by that figure's own source line, which sits above the
            // disclosure it lives in. Sibling disclosures are stepped over:
            // where one figure publishes two series — the six cities' prices
            // and their sales counts — the second `<details>` follows the
            // first, and its citation is the same line above both. Everything
            // that is not a disclosure cites after itself.
            let near = box.closest("details.numbers") ?? box;
            const upwards = near !== box;
            do {
              near = upwards ? near.previousElementSibling : near.nextElementSibling;
            } while (near && upwards && near.matches("details.numbers"));
            // **The neighbour has to BE a source line, not merely hold a
            // link.** Stepping over sibling disclosures widened what this rule
            // will accept, and what it accepted was any element with an
            // outbound `<a>` in it — a paragraph linking Eurostat's methodology
            // reads as a citation to this walk while the table beside it cites
            // nobody. `.ss` and `.cap` are the two classes the page writes a
            // source line as, and both are checked for the link as well.
            const cites =
              near?.matches(".ss, .cap") && near.querySelector("a[href^='http']") !== null;
            return cites ? null : `table ${i} beside "${near?.className ?? "nothing"}"`;
          })
          .filter(Boolean)
      );
      assert.deepEqual(
        uncited,
        [],
        `these figure tables carry no source line beside them: ${uncited.join("; ")}. ` +
          "A table of published figures cites its publisher exactly as a card does."
      );

      // Every table cell holds a figure or a visible em dash. An empty cell is
      // a payload field that stopped arriving, and it reads as a value of
      // nothing rather than as data that is missing.
      //
      // `textContent` rather than `innerText`: the numbers tables sit inside a
      // closed `<details>`, so every cell in them renders as empty text while
      // holding a figure. What is checked here is content, not visibility.
      const blanks = await tables.locator("tbody td").evaluateAll(
        (tds) =>
          tds.filter(
            // A cell holding a drawing is not a cell holding a figure: the
            // six-city table's history column is a sparkline, and its
            // accessible name carries the numbers instead. Nor is a note cell:
            // Eurostat flag a few quarters out of eighty-five, and a marker on
            // every row would mark nothing.
            (td) =>
              !td.querySelector("svg") &&
              !td.classList.contains("flag") &&
              !/[\d\u2014]/.test(td.textContent)
          ).length
      );
      assert.equal(blanks, 0, `${blanks} table cells render neither a digit nor an em dash`);
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("every figure whose table shows more than it links the query too", { skip }, async () => {
  // Eurostat's databrowser opens a dataset with every unit it carries at once,
  // so a reader following «16 227 · Евростат» lands on a table reading −19.8
  // for the same country and quarter — the quarter-on-quarter rate, and one
  // click from the page's own argument to a figure that appears to contradict
  // it. The second link returns this number and nothing else.
  //
  // The rule is per source line rather than a count, because a count passes
  // while any one figure is missing its query: **every line citing a Eurostat
  // databrowser page carries one.** НСИ's do not and need not — their source
  // link is the workbook itself, which holds the cell and nothing beside it.
  await withApp(
    async (page, errors) => {
      const missing = await page.locator("main.market .ss").evaluateAll((lines) =>
        lines
          .map((line) => {
            const first = line.querySelector("a:not(.q-link)");
            const href = first?.getAttribute("href") ?? "";
            if (!/databrowser/.test(href)) return null;
            return line.querySelector("a.q-link") ? null : href;
          })
          .filter(Boolean)
      );
      assert.deepEqual(
        missing,
        [],
        `these figures cite a Eurostat table and link no query:\n  ${missing.join("\n  ")}\n\n` +
          "That table shows every unit in the dataset at once, so the link alone " +
          "can land a reader on a different number for the same quarter."
      );

      const queries = page.locator("main.market .ss a.q-link");
      const n = await queries.count();
      assert.ok(n >= 6, `only ${n} query links on the page — the rule above matched nothing`);
      for (let i = 0; i < n; i += 1) {
        const href = await queries.nth(i).getAttribute("href");
        assert.match(
          href ?? "",
          /\/api\/|format=JSON/i,
          `query link ${i} points at ${href} — that is not a query returning the figure`
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test(
  "every chart's scale contains zero, and none of them crops its own data",
  { skip },
  async () => {
    // A y-axis cropped to a property series' own range turns any of them into a
    // cliff, and it is exactly the bias this page refuses. Measured rather than
    // read off the source: the scale lives in the component as arithmetic, and a
    // floor introduced there draws a chart that looks entirely reasonable.
    //
    // The invariant is what a zero-containing axis actually means — **the drawn
    // distance from the baseline is proportional to the value.** Subtract any
    // floor and the smallest reading shrinks faster than the largest, so the two
    // ratios part. It is checked against the published series rather than against
    // a literal, so a refresh cannot fail it.
    const market = payload("house_market");
    const structure = payload("house_market_structure");
    if (!market || !structure) return; // no refresh in this checkout

    const col = (rows, f) => Object.values(rows).map((r) => (f ? r[f] : r));
    const ratioOf = (values, reference = null) => {
      const bounds = reference === null ? values : [...values, reference];
      const min = Math.min(0, ...bounds);
      const max = Math.max(0, ...bounds);
      // The shortest and the tallest mark, as a fraction of the drawn plot.
      const drawn = values.map((v) => Math.abs(v - Math.max(min, Math.min(max, 0))) / (max - min));
      return Math.min(...drawn) / Math.max(...drawn);
    };

    // The count's year-on-year change, worked out here rather than imported —
    // a test that called the wiring's own function would agree with it however
    // wrong both were. Read off the LABEL a year back, which is the property
    // `verify_mirror_math.mjs` holds from the other side.
    const counts = market.deals.series_by_period;
    const yoy = {};
    for (const period of Object.keys(counts).sort()) {
      const [year, quarter] = period.split("-");
      const before = counts[`${Number(year) - 1}-${quarter}`]?.total;
      if (Number.isFinite(before) && before !== 0) {
        yoy[period] = ((counts[period].total - before) / before) * 100;
      }
    }
    // The two panels are drawn over the quarters they SHARE, so the price panel
    // is a slice of the published rate rather than the whole record.
    const shared = Object.keys(yoy).filter((p) =>
      Number.isFinite(market.price_index.annual_rate_pct[p]?.total)
    );
    const pairPrice = shared.map((p) => market.price_index.annual_rate_pct[p].total);

    // **In the order the page draws them**, which is the order a reader meets
    // them in: what a home costs, then what one changed hands for, then how
    // many did, then the two of those on one row of quarters, then the burden.
    const expected = [
      // Both index lines share one scale, so the nominal line's extremes are
      // drawn against whichever of the two maxima is larger.
      [
        "house price index",
        ratioOf(
          col(market.price_index.series_by_period, "total"),
          Math.max(100, ...Object.values(market.price_index_real.series_by_period))
        ),
      ],
      ["annual price change", ratioOf(col(market.price_index.annual_rate_pct, "total"), 0)],
      // The two deal lines share one scale, and the chart's marks are the hit
      // boxes over the NEW line — that is the series whose extremes are drawn.
      ["average deal", ratioOf(col(market.avg_deal_eur.series_by_period, "new"))],
      ["dwellings sold", ratioOf(col(market.deals.series_by_period, "total"))],
      [
        "the change in dwellings sold",
        ratioOf(
          shared.map((p) => yoy[p]),
          0
        ),
      ],
      ["prices over the same quarters", ratioOf(pairPrice, 0)],
      ["housing cost overburden", ratioOf(col(structure.housing_cost_overburden.series_by_period))],
    ];

    await withApp(
      async (page, errors) => {
        const figures = page.locator("main.market figure.chart");
        const charts = page.locator("main.market figure.chart svg.pane");
        const n = await charts.count();
        assert.equal(
          n,
          expected.length,
          `the market page draws ${n} charts and this test knows ${expected.length}. ` +
            "Every plot on the page is measured here or the rule guards the ones it remembers."
        );

        for (let i = 0; i < n; i += 1) {
          const [what, ratio] = expected[i];
          const svg = charts.nth(i);

          const label = (await svg.getAttribute("aria-label")) ?? "";
          assert.ok(
            label.length > 40 && /\d/.test(label),
            `the ${what} chart has no text alternative naming its figures: "${label}"`
          );
          assert.equal(
            await svg.getAttribute("role"),
            "img",
            `${what} is not announced as an image`
          );

          // The axis labels are HTML beside the box rather than text inside it,
          // so they are read off the figure and not off the SVG. What is
          // asserted is unchanged: a scale that does not print its own zero is
          // one a reader cannot tell a truncated axis from.
          const ticks = (await figures.nth(i).locator(".plot-tick").allTextContents()).map((t) =>
            t.trim()
          );
          assert.ok(ticks.includes("0"), `the ${what} chart draws no zero: ${ticks.join(", ")}`);

          // How far each mark sits from the zero line, in drawn units.
          const drawn = await svg.evaluate((el) => {
            const zero = el.querySelector("line.plot-axis").getBBox().y;
            const bars = [...el.querySelectorAll("rect.plot-bar")];
            if (bars.length) {
              const d = bars.map((b) => b.getBBox().height);
              return { lo: Math.min(...d), hi: Math.max(...d) };
            }
            // The FIRST series, never a second drawn on the same scale: the
            // index chart puts the deflated line under the nominal one so the
            // solid stroke reads on top, and measuring whichever path comes
            // first in the DOM would check the wrong extremes.
            const box = el.querySelector("path.plot-line:not(.second)").getBBox();
            const d = [Math.abs(zero - box.y), Math.abs(zero - (box.y + box.height))];
            return { lo: Math.min(...d), hi: Math.max(...d) };
          });
          const drawnRatio = drawn.lo / drawn.hi;
          assert.ok(
            Math.abs(drawnRatio - ratio) < 0.03,
            `the ${what} chart draws its smallest reading at ${(drawnRatio * 100).toFixed(1)}% of ` +
              `its largest, where the published figures are ${(ratio * 100).toFixed(1)}% apart. ` +
              "The scale does not contain zero, and a truncated y-axis on a property chart is the " +
              "one distortion this page cannot afford."
          );
        }
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/market/",
      {}
    );
  }
);

test(
  "the four answers are the first figures on the page, and fit one screen",
  { skip },
  async () => {
    // A reader arriving here wants four things: is it dearer than it used to be,
    // by how much really, what does one cost in something I can picture, and are
    // people buying. Every one of them was reachable and reaching it meant
    // scrolling to a section and reading a chart — and the page then ENDED on a
    // row of cards whose labels were definitions rather than statements.
    //
    // So the summary is above the working, and both halves of that are asserted:
    // no chart and no table may come before it, and on the phone all four have to
    // be on the screen at once. The second is the brittle-looking one and it is
    // the one worth having — a paragraph added above the row is exactly the edit
    // that undoes this, it reads as an improvement while making it, and nothing
    // else on the page would notice.
    await withApp(
      async (page, errors) => {
        const probe = await page.evaluate(() => {
          const main = document.querySelector("main.market");
          const cards = [...main.querySelectorAll(".answers .stat")];
          const order = (selector) => {
            const first = main.querySelector(selector);
            return first ? [...main.querySelectorAll("*")].indexOf(first) : Infinity;
          };
          return {
            values: cards.map((c) => c.querySelector(".sv").textContent.trim()),
            bottom: Math.max(...cards.map((c) => c.getBoundingClientRect().bottom)),
            screen: window.innerHeight,
            answersAt: order(".answers"),
            chartAt: order("figure.chart"),
            tableAt: order("table.fig-table"),
          };
        });

        assert.equal(
          probe.values.length,
          4,
          `the answer row draws ${probe.values.length} cards. It answers the four questions a ` +
            "reader arrives with, and a page that answers three of them has quietly picked one to drop."
        );
        for (const value of probe.values) {
          assert.match(value, /\d/, `an answer card renders "${value}" with no digit in it`);
        }
        assert.ok(
          probe.answersAt < probe.chartAt && probe.answersAt < probe.tableAt,
          "a chart or a table comes before the answer row. The summary is above the working, " +
            "or a reader has to read the working to reach the summary."
        );
        assert.ok(
          probe.bottom <= probe.screen,
          `the answer row ends ${Math.round(probe.bottom)}px down a ${probe.screen}px screen at ` +
            "360px wide, so a reader has to scroll to see all four. Whatever sits above the row " +
            "costs more than it gives."
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/market/",
      { viewport: { width: 360, height: 800 } }
    );
  }
);

test(
  "a payload that stopped refreshing says so on the page, and names itself",
  { skip },
  async () => {
    // `/market/` and `/how/` are the two pages built to be quoted and cited, and
    // neither could tell a reader their figures were late. A payload whose
    // workflow stops firing shows an old period caption and nothing else: the
    // caption is correct — it is what the figure describes — and the page goes on
    // looking exactly as it does on the day of a refresh.
    //
    // It NAMES the payload rather than counting it, which is the difference from
    // the calculator's own banner. There the count sits above a disclosure
    // listing every payload with its own date; here there is no panel, and «едно
    // от числата е закъсняло» with no way to find out which is a warning a reader
    // can do nothing with.
    if (!payload("house_market")) return; // no refresh in this checkout

    await withApp(
      async (page, errors) => {
        const note = page.locator(".late");
        assert.equal(await note.count(), 1, "an overdue payload raises no warning on /market/");
        const text = (await note.innerText()).trim();
        // The manifest's own name for it, so a row renamed there renames this.
        assert.ok(
          text.includes("Сделки с жилища"),
          `the warning does not name the late payload: "${text}"`
        );
        assert.match(text, /\d+/, `the warning does not say how late it is: "${text}"`);

        // …and the four answers still fit the phone with it up. This is the one
        // that makes the placement honest: a warning between the header and the
        // page pushes everything under it down, and the summary a reader came for
        // is what would go off the bottom.
        const probe = await page.evaluate(() => {
          const cards = [...document.querySelectorAll("main.market .answers .stat")];
          return {
            bottom: Math.max(...cards.map((c) => c.getBoundingClientRect().bottom)),
            screen: window.innerHeight,
          };
        });
        assert.ok(
          probe.bottom <= probe.screen,
          `with the overdue warning up the answer row ends ${Math.round(probe.bottom)}px down a ` +
            `${probe.screen}px screen at 360px. The warning belongs above the page and the four ` +
            "answers belong on the first screen; if both cannot hold, the warning is not what moves."
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/market/",
      { viewport: { width: 360, height: 800 } },
      servedStale("house_market")
    );

    // Nothing at all while every payload is inside its own cadence, which is the
    // ordinary state and the one the rest of this file runs in. A warning that is
    // always up is one nobody reads on the day it means something.
    await withApp(
      async (page, errors) => {
        assert.equal(
          await page.locator(".late").count(),
          0,
          "the overdue warning is up on /market/ with every committed payload inside its own " +
            "cadence. Either a payload has genuinely gone stale — refresh it — or the verdict " +
            "is being computed against something other than `as_of` and the manifest."
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/market/",
      {}
    );
  }
);

test("the charts are legible on the phone, not only on the desk", { skip }, async () => {
  // The failure this exists to refuse, measured on the built page: an SVG sized
  // `width: 100%` against a fixed `viewBox` scales its whole coordinate system,
  // and text is part of it. With the axis labels inside the box the six plots
  // rendered their 11px type at 6.2px at a 360px viewport, and the plot itself
  // came to 83px tall once the label padding was taken out of the same box.
  //
  // 360px is the primary target rather than the fallback, so the assertion is
  // made there. It is on the RENDERED size — the number a reader's eye gets —
  // which is why the labels live in HTML beside the plot: a declaration of
  // 11px inside the box is 11px in the source and 6px on the device.
  //
  // The floor is the page's own smallest type. It cannot be met by moving the
  // labels back inside and declaring 20px, because the box would then scale
  // that to 20px only at the one width it was drawn for, and this walk runs at
  // the narrowest.
  await withApp(
    async (page, errors) => {
      const probe = await page.evaluate(() => {
        const out = [];
        for (const figure of document.querySelectorAll("main.market figure.chart")) {
          const pane = figure.querySelector("svg.pane");
          const box = pane.getBoundingClientRect();
          const sizes = [...figure.querySelectorAll(".plot-tick")].map((el) => {
            const declared = parseFloat(getComputedStyle(el).fontSize);
            // What the label is drawn at. Inside the box that is the declared
            // size times the box's own scale; in HTML the two are the same
            // number, and the point of the measurement is that they are.
            const scale = el.closest("svg") ? box.width / pane.viewBox.baseVal.width : 1;
            return Number((declared * scale).toFixed(2));
          });
          // Where the labels actually land, as a fraction of the plot. A tick
          // that names a level and does not sit at it is worse than no tick,
          // and it is not a thing a reader reports — it looks like a rendering
          // glitch. The grid positions each one with a percentage `top`, which
          // a relatively positioned grid item resolves against its GRID AREA:
          // a row sized to its own content makes every tick land within one
          // line-height of the top of the plot, on all six charts at once,
          // while every text assertion about them stays green.
          const spread = [...figure.querySelectorAll(".yaxis .plot-tick")].map(
            (el) =>
              (el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - box.top) /
              box.height
          );
          out.push({
            height: Math.round(box.height),
            labels: sizes.length,
            smallest: sizes.length ? Math.min(...sizes) : 0,
            highest: Math.min(...spread),
            lowest: Math.max(...spread),
            // A label that starts left of the page is one nobody reads either.
            offPage: [...figure.querySelectorAll(".plot-tick")].some(
              (el) => el.getBoundingClientRect().left < 0
            ),
          });
        }
        return { charts: out, scrollWidth: document.documentElement.scrollWidth };
      });

      assert.ok(probe.charts.length >= 5, `only ${probe.charts.length} charts found to measure`);
      for (const [i, chart] of probe.charts.entries()) {
        assert.ok(chart.labels >= 2, `chart ${i} draws ${chart.labels} axis labels at 360px`);
        assert.ok(
          chart.smallest >= 11,
          `chart ${i} renders its smallest axis label at ${chart.smallest}px on a 360px ` +
            "viewport. --fs-micro is 11px and it is the floor for the whole site; a chart " +
            "that scales its own type below it is unreadable on the device most readers " +
            "arrive on."
        );
        assert.ok(
          chart.height >= 110,
          `chart ${i} draws a plot ${chart.height}px tall at 360px — the marks have less ` +
            "vertical room than a line of body copy"
        );
        assert.equal(chart.offPage, false, `chart ${i} hangs an axis label off the left edge`);
        // Every chart on this page has zero inside its scale and prints it, so
        // the bottom label is at the foot of the plot. How high the top one
        // sits is data — an axis rounded out to its step puts the topmost tick
        // above the series' own peak — so what is asserted here is that the
        // labels SPAN the box rather than where each one lands.
        assert.ok(
          chart.lowest > 0.9,
          `chart ${i} puts its lowest axis label at ${(chart.lowest * 100).toFixed(0)}% of the ` +
            "plot's height. Zero is inside every scale on this page and belongs at the foot of it."
        );
        assert.ok(
          chart.lowest - chart.highest > 0.4,
          `chart ${i} bunches its axis labels into ${((chart.lowest - chart.highest) * 100).toFixed(0)}% ` +
            "of the plot's height. They are supposed to span it — a tick naming a level and not " +
            "sitting at that level names nothing, and it reads as a rendering glitch rather than " +
            "as a wrong axis."
        );
      }
      assert.equal(
        probe.scrollWidth,
        360,
        `the page scrolls sideways at 360px (${probe.scrollWidth}px wide). A chart, a table ` +
          "or a card is wider than the viewport and is not inside a scroll box of its own."
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    { viewport: { width: 360, height: 800 } }
  );
});

test("the range strip puts every marker where the published figures put it", { skip }, async () => {
  // The strip's whole claim is that a dot on a line says where the newest
  // reading sits inside its own series' record. A marker that is anywhere else
  // is worse than no marker: it is a picture of a number, drawn wrong, on the
  // page that exists to be checked.
  //
  // So the position is recomputed here from the committed payloads and compared
  // against where the browser actually painted the dot — the drawn centre as a
  // fraction of the drawn track, not the `cx` attribute, because a CSS rule
  // that scales or offsets the box would leave the attribute right and the
  // picture wrong.
  //
  // **The extremes are the SERIES' own, never zero.** `plotSeries` floors its
  // scale at or below zero so no chart can crop an axis, and reusing that here
  // would put all six of these in the top fifth of their tracks and make the
  // strip say the same thing six times. What is asserted is the arithmetic the
  // strip claims: peak, trough, latest.
  const market = payload("house_market");
  const structure = payload("house_market_structure");
  if (!market || !structure) return; // no refresh in this checkout

  const at = (entries) => {
    const values = Object.keys(entries)
      .sort()
      .map((k) => entries[k])
      .filter(Number.isFinite);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return (values[values.length - 1] - low) / (high - low);
  };
  const col = (rows, f) =>
    Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, f ? r[f] : r]));

  // The count is placed by its change against the same quarter a year earlier
  // and never by its level, because a level of this series carries the
  // calendar: transactions peak in fourth quarters, so a first-quarter reading
  // sits low in its own record whatever the market is doing, and the marker
  // moves with the month of the year.
  const yoy = {};
  const counts = market.deals.series_by_period;
  for (const period of Object.keys(counts).sort()) {
    const [year, quarter] = period.split("-");
    const before = counts[`${Number(year) - 1}-${quarter}`]?.total;
    if (Number.isFinite(before) && before !== 0) {
      yoy[period] = ((counts[period].total - before) / before) * 100;
    }
  }

  const expected = [
    ["the change in dwellings sold", at(yoy)],
    ["house price index", at(col(market.price_index.series_by_period, "total"))],
    ["deflated index", at(col(market.price_index_real.series_by_period))],
    ["annual price change", at(col(market.price_index.annual_rate_pct, "total"))],
    // Price-to-income is deliberately not on the strip — its published value is
    // already an index against its own long-run average, and a one-line row
    // cannot draw that 100. `verify_view_market.mjs` holds the absence with its
    // reason.
    ["housing cost overburden", at(col(structure.housing_cost_overburden.series_by_period))],
  ];

  await withApp(
    async (page, errors) => {
      const drawn = await page.evaluate(() =>
        [...document.querySelectorAll("main.market table.range tbody tr")].map((tr) => {
          const track = tr.querySelector("line.rng-track").getBoundingClientRect();
          const dot = tr.querySelector("circle.rng-dot").getBoundingClientRect();
          return {
            label: tr.querySelector("th a").innerText.trim(),
            at: (dot.left + dot.width / 2 - track.left) / track.width,
            named: tr.querySelector("svg.rng").getAttribute("aria-label") ?? "",
          };
        })
      );

      assert.equal(
        drawn.length,
        expected.length,
        `the strip draws ${drawn.length} rows and this test knows ${expected.length}. Every ` +
          "series it places is measured here, or the rule guards the ones it remembers."
      );
      for (const [i, [what, want]] of expected.entries()) {
        // The track is drawn with round caps and the dot has a radius, so the
        // two boxes differ by a stroke either side. A whole percent of the
        // track is well inside that and nowhere near the gap a wrong series
        // would open.
        assert.ok(
          Math.abs(drawn[i].at - want) < 0.02,
          `the ${what} marker sits at ${(drawn[i].at * 100).toFixed(1)}% of its track where the ` +
            `published series puts it at ${(want * 100).toFixed(1)}%. A dot that is not where ` +
            "the arithmetic says is a picture of a number, drawn wrong."
        );
        assert.ok(
          drawn[i].named.length > 30 && /\d/.test(drawn[i].named),
          `the ${what} track has no text alternative naming its readings: "${drawn[i].named}"`
        );
      }

      // …and the strip carries no total, no rank and no score. Six positions
      // against six different records do not add up to anything, and a seventh
      // row summing them would be the one figure on this site nobody could
      // check (docs/principles.md P6).
      const heads = await page.locator("main.market table.range thead th").allInnerTexts();
      assert.equal(heads.length, 3, `the strip has ${heads.length} columns: ${heads.join(" | ")}`);
      assert.equal(
        await page.locator("main.market table.range tfoot").count(),
        0,
        "the range strip grew a footer row. Six positions against six different records " +
          "do not total, and anything drawn across them is a composite this page may not make."
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("the city column draws both changes on one scale, from one zero", { skip }, async () => {
  // The six rows carry the only place on the page where the national divergence
  // — prices one way, sales the other — exists city by city, and they carried it
  // as two columns of digits. The bars draw the two figures already in the row,
  // so the claim is the table's; what the picture adds is that six cities can be
  // compared at a glance, and that is only true if every bar runs from one zero
  // against one scale.
  //
  // **Asserted as linearity rather than against a recomputed axis.** What makes
  // the rows comparable is that a bar's length is proportional to its own figure
  // with the SAME constant on every row, and that holds whatever bounds the
  // column rounds itself out to. A test that rebuilt the axis here would be
  // reimplementing the component and would agree with it however wrong both were.
  const nsi = payload("nsi_housing");
  if (!nsi) return; // no refresh in this checkout

  const rows = nsi.city_price_index_yoy.cities.map((c) => ({
    code: c.code,
    price: c.value_pct,
    deals: nsi.city_deals_yoy.cities.find((d) => d.code === c.code)?.value_pct ?? null,
  }));

  await withApp(
    async (page, errors) => {
      const drawn = await page.evaluate(() =>
        [...document.querySelectorAll("main.market table.cities tbody tr")]
          .map((tr) => {
            const svg = tr.querySelector("svg.now");
            if (!svg) return null;
            const zero = svg.querySelector("line.now-zero").getBoundingClientRect();
            const bar = (sel) => {
              const box = svg.querySelector(sel).getBoundingClientRect();
              return { width: box.width, left: box.left - zero.left, right: box.right - zero.left };
            };
            return {
              city: tr.querySelector("th").innerText.trim(),
              price: bar("rect.now-price"),
              deals: bar("rect.now-deals"),
              named: svg.getAttribute("aria-label") ?? "",
            };
          })
          .filter(Boolean)
      );
      assert.equal(drawn.length, rows.length, `${drawn.length} of ${rows.length} rows drawn`);

      const scales = [];
      for (const [i, row] of rows.entries()) {
        for (const key of ["price", "deals"]) {
          const value = row[key];
          const box = drawn[i][key];
          assert.ok(Number.isFinite(value), `${row.code} publishes no ${key} figure`);
          // A bar starts at zero and runs the way its own figure points. Drawn
          // the other way it says a city whose sales fell had them rise, with
          // the right number printed in the cell beside it.
          if (value < 0) {
            assert.ok(
              box.right <= 1,
              `${row.code}'s ${key} figure is ${value} and its bar runs right of zero`
            );
          } else {
            assert.ok(
              box.left >= -1,
              `${row.code}'s ${key} figure is ${value} and its bar runs left of zero`
            );
          }
          // The 0.8-unit floor keeps a rounds-to-nothing change visible, so a
          // bar that short says nothing about the scale it was drawn on.
          if (Math.abs(value) > 2) scales.push(box.width / Math.abs(value));
        }
      }
      assert.ok(scales.length >= 8, `${scales.length} bars long enough to measure`);
      const spread = Math.max(...scales) / Math.min(...scales);
      assert.ok(
        spread < 1.05,
        `the bars are drawn at ${scales.map((s) => s.toFixed(2)).join(", ")} px per point. One ` +
          "scale across the six cities is what makes the rows comparable; per row, every city " +
          "fills its own cell and the column says nothing."
      );
      for (const row of drawn) {
        assert.ok(
          row.named.length > 30 && /\d/.test(row.named),
          `${row.city}'s bars have no text alternative naming them: "${row.named}"`
        );
      }

      // …and the column states the scale it drew them on, once, in its head.
      const axis = await page
        .locator("main.market table.cities thead .nowaxis span")
        .allInnerTexts();
      assert.deepEqual(
        [axis.length, axis.includes("0")],
        [3, true],
        `the column head labels its scale as ${axis.join(" | ")} — both ends and the zero ` +
          "between them, or the bars are lengths against nothing"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );

  // A city whose two workbooks are a quarter apart draws NOTHING. The columns
  // either side keep printing their figures and each says which quarter it is
  // from; the picture has nowhere to put that, and two bars in one cell assert
  // they describe the same quarter. Served rather than committed, because the
  // shipped payload has all six cities in step — the state under test is one no
  // committed file can produce.
  const parted = {
    ...nsi,
    city_deals_yoy: {
      ...nsi.city_deals_yoy,
      cities: nsi.city_deals_yoy.cities.map((c, i) =>
        i === 0 ? { ...c, ref_period: "1999-Q1" } : c
      ),
    },
  };
  await withApp(
    async (page, errors) => {
      const cells = await page.evaluate(() =>
        [...document.querySelectorAll("main.market table.cities tbody tr")].map((tr) => {
          const cell = tr.querySelector("td:last-child");
          return { drawn: Boolean(cell.querySelector("svg")), text: cell.innerText.trim() };
        })
      );
      assert.equal(cells[0].drawn, false, "a city whose two figures are a quarter apart is drawn");
      assert.equal(
        cells[0].text,
        "—",
        `the undrawable cell reads "${cells[0].text}" rather than as visibly missing`
      );
      assert.ok(
        cells.slice(1).every((c) => c.drawn),
        "one city out of step stopped the whole column being drawn"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {},
    async (page) => {
      await page.route("**/data/published/nsi_housing.json", (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(parted) })
      );
    }
  );
});

test("the marked columns are the quarters the year-on-year figure compares", { skip }, async () => {
  // The sawtooth on the count chart is the loudest thing on the page and it is
  // the calendar. The tint is what says so — and a tint on the wrong columns is
  // worse than none, because it makes a claim: THESE are the comparable ones.
  //
  // The failure it guards is drawing every fourth column by position. That is
  // the same quarter each year only while nothing is missing, and it is exactly
  // the mistake `yearOnYearChanges` refuses to make with the numbers — a chart
  // marked one way and a percentage computed the other would disagree with
  // nothing to say which was right.
  const market = payload("house_market");
  if (!market) return; // no refresh in this checkout

  const periods = Object.keys(market.deals.series_by_period).sort();
  const quarter = periods[periods.length - 1].slice(-2);
  const want = periods.filter((p) => p.endsWith(quarter));

  await withApp(
    async (page, errors) => {
      const marked = await page.evaluate(() =>
        [...document.querySelectorAll("main.market #volume figure.chart rect.plot-bar")]
          .filter((r) => r.classList.contains("season"))
          .map((r) => r.querySelector("title").textContent.split(":")[0])
      );
      assert.deepEqual(
        marked,
        want,
        "the tinted columns are not the quarters that share the newest reading's place in the " +
          "year. A mark on a chart is a claim about which columns are comparable."
      );
      assert.ok(
        marked.length > 1 && marked.length < periods.length,
        `${marked.length} of ${periods.length} columns are marked — a mark on all of them or on ` +
          "one of them names nothing."
      );

      // …and the key names it. A tint nobody can look up is decoration.
      const keys = await page
        .locator("main.market #volume figure.chart figcaption .key")
        .allInnerTexts();
      assert.equal(keys.length, 1, `the count chart draws ${keys.length} keys`);
      assert.ok(keys[0].trim().length > 8, `the key reads "${keys[0]}"`);
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );

  // **The committed payload cannot tell the two rules apart, and a test that
  // cannot go red is not a guard.** Its quarters run unbroken, so every fourth
  // column by POSITION is also the same quarter by LABEL — the mutation this
  // test exists to catch passes against the shipped data. So one quarter is
  // dropped on the way to the tab: positional marking then walks onto the
  // quarters either side of the gap, and label marking does not move at all.
  // The same device `servedStale` uses for the freshness verdict, and the same
  // reason — the state under test is one no committed file can produce.
  const gapped = periods.find((p, i) => i > 4 && !p.endsWith(quarter));
  await withApp(
    async (page, errors) => {
      const marked = await page.evaluate(() =>
        [...document.querySelectorAll("main.market #volume figure.chart rect.plot-bar")]
          .filter((r) => r.classList.contains("season"))
          .map((r) => r.querySelector("title").textContent.split(":")[0])
      );
      assert.deepEqual(
        marked,
        want.filter((p) => p !== gapped),
        `with ${gapped} missing from the series, the tint no longer lands on the quarters that ` +
          "share the newest reading's place in the year — so it is counting columns rather than " +
          "reading their periods, which is the mistake the year-on-year arithmetic refuses to make."
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {},
    async (page) => {
      const series = { ...market.deals.series_by_period };
      delete series[gapped];
      const served = { ...market, deals: { ...market.deals, series_by_period: series } };
      await page.route("**/data/published/house_market.json", (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(served) })
      );
    }
  );
});

test("the two panels drawn together are drawn over the same box", { skip }, async () => {
  // Two plots stacked one above the other claim their columns describe the same
  // quarters. `marketVolumeAgainstPrices` makes that true of the DATA; this is
  // the other half, and it fails for a reason no wiring test can see: the label
  // gutter beside a plot is sized to that plot's own longest tick, so two
  // panels whose axes read «−28,3%» and «0» are drawn at different widths and
  // the same quarter lands at two different x positions. Every figure stays
  // published and every axis stays honest, and the picture makes a comparison
  // nobody can trust.
  await withApp(
    async (page, errors) => {
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll("main.market .pair svg.pane")].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right };
        })
      );
      assert.equal(boxes.length, 2, `the pair draws ${boxes.length} panels`);
      // A pixel of tolerance for sub-pixel layout, and nothing like the eight a
      // differently-sized gutter opens.
      assert.ok(
        Math.abs(boxes[0].left - boxes[1].left) < 1 &&
          Math.abs(boxes[0].right - boxes[1].right) < 1,
        `the two panels are drawn over [${boxes[0].left.toFixed(1)}, ${boxes[0].right.toFixed(1)}] ` +
          `and [${boxes[1].left.toFixed(1)}, ${boxes[1].right.toFixed(1)}]. They share one row of ` +
          "quarters, so a quarter in the top panel sits above a different quarter in the bottom one."
      );

      // …and the window is drawn once, under the lower panel. Two axes read as
      // two windows that happen to agree.
      assert.equal(
        await page.locator("main.market .pair .xyears").count(),
        1,
        "the pair draws its own window twice"
      );
      assert.equal(
        await page.locator("main.market .pair .xaxis").count(),
        0,
        "the pair labels only the two ends of a window a reader has to read a middle out of"
      );

      // Every year in the window is a rule in BOTH panels, at the same place.
      // The rules are what carry a column down onto the line under it, and one
      // panel ruled and the other not is an alignment a reader cannot check.
      const rules = await page.evaluate(() =>
        [...document.querySelectorAll("main.market .pair svg.pane")].map((el) =>
          [...el.querySelectorAll("line.plot-year")].map((l) => Number(l.getAttribute("x1")))
        )
      );
      assert.deepEqual(rules[0], rules[1], "the two panels rule different years");
      assert.ok(rules[0].length > 3, `the pair draws ${rules[0].length} year rules`);
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    { viewport: { width: 360, height: 800 } }
  );
});

test("no period reaches a reader in the notation the pipeline keys it by", { skip }, async () => {
  // A series states its own window as the keys the payload uses — `2006-Q1`,
  // `2025-Q4` — and `periodLong` is what turns one into «Q1 2006». Four of the
  // six charts put the raw key into their text alternative while the two beside
  // them read the formatted one, so the same plot was described one way to a
  // screen reader and the other way to an eye, on the page whose smallest
  // promise is that a figure and its period are legible together.
  //
  // Both surfaces are walked, because they fail separately: a caption is
  // rendered by the template and a text alternative is assembled inside a `t()`
  // slot, and the one nobody looks at is the one that goes stale.
  //
  // **The `<title>` marks are deliberately outside this.** One per point on an
  // eighty-five-quarter line, they are the browser's own tooltip on a mark a
  // reader is already pointing at — the terse key is what identifies the point
  // and there is no sentence around it to read oddly. `docs/testing-strategy.md`
  // §"What does NOT get a test" is the same call: a rule that would fire on 288
  // marks to catch nothing a reader reads is a rule that gets relaxed.
  await withApp(
    async (page, errors) => {
      const ISO = /\d{4}-(?:Q[1-4]|\d{2})\b/;
      const found = await page.evaluate(() => {
        const main = document.querySelector("main.market");
        const out = [];
        for (const el of main.querySelectorAll("[aria-label]")) {
          out.push(["aria-label", el.getAttribute("aria-label")]);
        }
        // Rendered text only — an SVG `<title>` is not rendered, so the marks
        // stay out of this without being filtered by name.
        out.push(["visible text", main.innerText]);
        return out;
      });

      const offenders = [];
      for (const [where, text] of found) {
        const hit = ISO.exec(text ?? "");
        if (hit) offenders.push(`${where}: ${hit[0]} — ${text.trim().slice(0, 100)}`);
      }
      assert.deepEqual(
        offenders,
        [],
        `these reach a reader as a payload key rather than as a period:\n  ` +
          `${offenders.join("\n  ")}\n\nformat.js#periodLong is what every other period on ` +
          "this page goes through, and it returns the same string for an annual series — so a " +
          "period that skips it is invisible until the series stops being annual."
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("every chart publishes its own numbers, and every mark names itself", { skip }, async () => {
  // A plot shows a shape and hides every value in it. Twenty-one years of an
  // index is exactly the case where a reader wants ONE quarter and the chart
  // cannot give it to them — and a `<title>` answers that for a pointer only,
  // which leaves out touch, the keyboard and every screen reader.
  //
  // So each chart is also published as a real table. That is the WCAG text
  // alternative, the way to read an exact figure off eighty-five quarters, and
  // what makes the page quotable. A `<details>` is a disclosure and not an
  // input: the rule that this page takes nothing from the reader is untouched,
  // which the input test next door asserts from the other side.
  await withApp(
    async (page, errors) => {
      const charts = page.locator("main.market figure.chart svg");
      const n = await charts.count();
      for (let i = 0; i < n; i += 1) {
        const marks = charts.nth(i).locator("rect.plot-bar, rect.plot-hit");
        const titled = await marks.locator("title").count();
        const total = await marks.count();
        assert.ok(total > 4, `chart ${i} draws ${total} inspectable marks`);
        assert.equal(
          titled,
          total,
          `chart ${i} has ${titled} named marks against ${total} drawn — a bar a reader ` +
            "cannot put a period and a value to is a shape rather than a figure"
        );
      }

      const tables = page.locator("main.market details.numbers");
      const count = await tables.count();
      assert.ok(
        count >= n,
        `${n} charts and ${count} numbers tables. Every plot carries its own, because a ` +
          "`<title>` is unreachable by touch, by keyboard and by a screen reader."
      );
      for (let i = 0; i < count; i += 1) {
        const rows = await tables.nth(i).locator("tbody tr").count();
        assert.ok(rows > 4, `numbers table ${i} publishes ${rows} rows`);
        const summary = (await tables.nth(i).locator("summary").innerText()).trim();
        assert.match(
          summary,
          /\d/,
          `numbers table ${i} is headed "${summary}" and does not say how much is in it`
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("the six-city table draws each city's own history on one shared scale", { skip }, async () => {
  // Six sparklines each drawn to its own range are six pictures of the same
  // shape, and comparing rows is the only reason to put a chart in a column.
  // They share `cities.priceScale`, so Русе falling and Бургас rising are drawn
  // against the same yardstick — measured by checking that the zero rule sits
  // at the same height in every one of them.
  //
  // **The payload decides whether this test has a subject; the page never
  // does.** Skipping on a selector that matches nothing conflates the two — a
  // checkout with no НСИ refresh and a page that stopped drawing the column
  // look identical from the DOM, so deleting the six sparklines outright, which
  // is the regression this test is named for, leaves the suite green. An early
  // return on a missing element is a green test for a deleted feature
  // (docs/testing-strategy.md §"The standard a test has to meet").
  if (!payload("nsi_housing")) return; // no НСИ figures published in this checkout
  await withApp(
    async (page, errors) => {
      const sparks = page.locator("main.market table.fig-table.cities svg.spark");
      const n = await sparks.count();
      assert.ok(n >= 6, `the six-city table draws ${n} histories`);

      const zeros = await sparks.evaluateAll((els) =>
        els.map((el) => Number(el.querySelector("line.plot-ref").getAttribute("y1")).toFixed(3))
      );
      assert.equal(
        new Set(zeros).size,
        1,
        `the six sparklines put their zero line at ${[...new Set(zeros)].join(", ")} — they are ` +
          "drawn on different scales, so comparing one row with another compares nothing"
      );
      for (let i = 0; i < n; i += 1) {
        const label = (await sparks.nth(i).getAttribute("aria-label")) ?? "";
        assert.ok(label.length > 20 && /\d/.test(label), `sparkline ${i} is unnamed: "${label}"`);
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("the page shows the published figures, not a fallback", { skip }, async () => {
  // Read out of the payloads rather than written down here: a literal passes
  // for one quarter and then reports a refreshed market as a regression.
  const market = payload("house_market");
  const structure = payload("house_market_structure");
  if (!market || !structure) return; // no refresh in this checkout

  const period = market.ref_period;
  const deals = market.deals.series_by_period[period].total;
  const owners = structure.tenure.owner_pct;

  await withApp(
    async (page, errors) => {
      const body = await page.locator("main.market").innerText();
      // Digits only: the page groups thousands in the reader's own language,
      // and asserting on the separator would be asserting on the formatter.
      const digits = body.replace(/[\s .,]/g, "");
      assert.ok(
        digits.includes(String(Math.round(deals))),
        `the published deal count ${deals} at ${period} is not on the page`
      );
      assert.ok(
        digits.includes(String(owners).replace(".", "")),
        `the published owner-occupier share ${owners}% is not on the page`
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("every figure of ours says so, and links what reproduces it", { skip }, async () => {
  // Eurostat permit derivation on condition it is stated clearly to the end
  // user. That is the licence half. The other half is the point of the page: a
  // reader who thinks a number is invented can open the query behind it and get
  // the same digits back, and a disclosure with no link discharges the first
  // obligation while failing the second.
  await withApp(
    async (page, errors) => {
      const ours = page.locator("main.market p.ours");
      const n = await ours.count();
      assert.ok(n >= 3, `only ${n} derived figures on the page disclose themselves`);

      for (let i = 0; i < n; i += 1) {
        const block = ours.nth(i);
        const text = (await block.innerText()).trim();
        assert.ok(
          /наша сметка|our arithmetic/i.test(text),
          `a derivation note does not say the figure is ours: ${text.slice(0, 80)}`
        );
        const checks = block.locator('a[href*="ec.europa.eu"]');
        assert.ok(
          (await checks.count()) >= 1,
          `a derivation note links nothing a reader could re-run: ${text.slice(0, 80)}`
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test(
  "the six-city table dates each column, and draws a fall as a real minus",
  { skip },
  async () => {
    // Two things a reader takes off this table without being told, and both are
    // claims the markup has to actually make.
    //
    // The period: HPI_2.6 and HSI_2.4.5 are separate files on НСИ's portal and
    // either can be republished first, so one caption over both columns says
    // something about the data rather than describing it. Every column head
    // carries its own quarter.
    //
    // The sign: five of the six sales figures are falls right now, and a
    // hand-rolled `x > 0 ? "+" : ""` renders them with `toLocaleString`'s hyphen
    // — narrower than the U+2212 the rest of the site draws, and read as a dash
    // rather than as a minus at 12px in a column of percentages.
    //
    // Gated on the payload rather than on the table being there, for the reason
    // the sparkline test above carries: a selector that matches nothing is a
    // deleted table and an unpublished one at once, and a `return` on it passes
    // both.
    const nsi = payload("nsi_housing");
    if (!nsi) return; // no НСИ figures published in this checkout
    await withApp(
      async (page, errors) => {
        const table = page.locator("main.market table.fig-table.cities");
        assert.ok(
          await table.count(),
          "the six-city table is not on the page, though nsi_housing.json publishes " +
            "the figures it draws"
        );

        // Found by class rather than by position: the history column sits
        // between the two figure columns and carries a range, not a quarter.
        const heads = await table.locator("thead th.num").allInnerTexts();
        assert.equal(heads.length, 2, `the city table has ${heads.length} figure columns`);
        for (const head of heads) {
          assert.match(
            head.trim(),
            /Q[1-4]\s*\d{4}/,
            `a figure column of the city table is headed "${head.trim()}" with no period in ` +
              "it — the two workbooks are released separately and either can be a quarter behind"
          );
        }

        const cells = await table.locator("tbody td").allInnerTexts();
        assert.ok(cells.length >= 12, `the city table draws ${cells.length} cells`);
        const ascii = cells.filter((c) => /(^|\s)-\d/.test(c));
        assert.deepEqual(
          ascii,
          [],
          `these cells draw a fall with U+002D: ${ascii.join(", ")}. format.js#percentSigned ` +
            "uses U+2212, which is what every other figure on the site is drawn with."
        );
        // …and a sign is actually being drawn, so the rule above is not passing
        // on a table of unsigned numbers.
        assert.ok(
          cells.some((c) => c.includes("\u2212")),
          "no cell in the city table carries a minus at all — every НСИ city " +
            "figure is a change, and falls are what the table exists to show"
        );

        // Both histories reach the page, not only the priced one. НСИ publish a
        // sales series per city as well as a price series, over a shorter
        // window, and the page carried it in the payload while drawing only its
        // newest cell. The two disclosures are told apart by the counts in their
        // own summaries, which come from the two series' own lengths — so this
        // goes red if either stops being published as well as if either stops
        // being drawn.
        const lengths = ["city_price_index_yoy", "city_deals_yoy"].map(
          (block) => Object.keys(nsi[block]?.cities?.[0]?.series_by_period ?? {}).length
        );
        assert.ok(lengths[0] > 2 && lengths[1] > 2, `city series lengths: ${lengths.join(", ")}`);
        const summaries = (
          await page.locator("main.market details.numbers summary").allInnerTexts()
        ).map((text) => text.replace(/[\s .,]/g, ""));
        for (const [i, n] of lengths.entries()) {
          assert.ok(
            summaries.some((text) => text.includes(String(n))),
            `no disclosure on the page publishes the ${n}-quarter city series ` +
              `(${["prices", "sales counts"][i]}). НСИ publish it per city and the page would ` +
              "be showing only its newest cell, which is a number where the payload carries a " +
              "history."
          );
        }
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/market/",
      {}
    );
  }
);

test(
  "the tenure table shows every share the survey publishes, and they add up",
  { skip },
  async () => {
    // The table showed four of the six shares EU-SILC publish, and the two it
    // left out are the ones that make the rest legible: 84.4% own with no loan at
    // all — which is the fact two paragraphs elsewhere on the page lean on, and a
    // reader had to subtract to find it — and 11.7% pay a reduced rent or none,
    // which is by far the larger half of renting here, so a table showing only
    // the market-price half described the smaller case.
    //
    // Read off the payload rather than listed here, so a share Eurostat add later
    // fails this instead of quietly not being drawn. The sum is the other half:
    // owners and renters are on one base and add to the published total, which is
    // the check a reader can make with their eyes and the reason it is a table.
    const structure = payload("house_market_structure");
    if (!structure) return; // no refresh in this checkout
    const tenure = structure.tenure;
    const shares = Object.entries(tenure).filter(
      ([key, value]) => key.endsWith("_pct") && key !== "total_pct" && Number.isFinite(value)
    );
    assert.ok(shares.length >= 6, `the tenure block publishes ${shares.length} shares`);
    assert.ok(
      Math.abs(tenure.owner_pct + tenure.rent_pct - tenure.total_pct) < 0.15,
      `owners (${tenure.owner_pct}) and renters (${tenure.rent_pct}) do not add to the published ` +
        `total (${tenure.total_pct}). The table says they are shares of one and the same base.`
    );

    await withApp(
      async (page, errors) => {
        // Located by its section rather than by position: the numbers tables
        // under the charts are `table.fig-table` too, so an index counts past
        // several of them and lands somewhere else the day a chart is added.
        const rows = await page.locator("main.market #credit table.fig-table").innerText();
        const digits = rows.replace(/[\s .,]/g, "");
        const missing = shares
          .filter(([, value]) => !digits.includes(String(value).replace(".", "")))
          .map(([key, value]) => `${key} = ${value}%`);
        assert.deepEqual(
          missing,
          [],
          `the tenure table does not draw these published shares: ${missing.join(", ")}. ` +
            "Every one of them is a share of the same base, and the ones left out are the ones " +
            "that make the column add up to the total the prose claims it adds up to."
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      "/market/",
      {}
    );
  }
);

test("the market page has no input of any kind", { skip }, async () => {
  // The same rule `/how/` follows. Every derived value on this page takes
  // payloads rather than scalars precisely so a reader's own figure has no
  // signature to be threaded into — a control appearing here is the first
  // visible sign that stopped being true.
  await withApp(
    async (page, errors) => {
      for (const selector of ["input", "textarea", "select", '[contenteditable="true"]']) {
        assert.equal(
          await page.locator(`main.market ${selector}`).count(),
          0,
          `the market page grew a <${selector}>. It is a page of national ` +
            "figures and it takes nothing from the reader."
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("both languages reach the served HTML, in both trees", { skip }, async () => {
  // The page is built to be quoted, so what a crawler is served has to carry
  // the words. `.l-bg` / `.l-en` pairs both ship and CSS hides one; a caption
  // picked by the language store would reach a crawler in one language only.
  for (const [path, shown, hidden] of [
    ["/market/", ".l-bg", ".l-en"],
    ["/en/market/", ".l-en", ".l-bg"],
  ]) {
    await withApp(
      async (page, errors) => {
        assert.ok(
          await page.locator(`main.market ${shown}`).first().isVisible(),
          `${path} does not draw its own language`
        );
        assert.equal(
          await page.locator(`main.market ${hidden}:visible`).count(),
          0,
          `${path} draws the other language as well as its own`
        );
        // …and the hidden half is nonetheless present in the document, which is
        // the half a crawler reads.
        assert.ok(
          (await page.locator(`main.market ${hidden}`).count()) > 0,
          `${path} ships no ${hidden} at all — the other language is missing ` +
            "from the served HTML rather than merely hidden"
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      },
      path,
      {}
    );
  }
});

test("the English page names every publisher in its own alphabet", { skip }, async () => {
  // «НСИ» and "NSI" both reached the English page, once inside a single
  // sentence: "The price changes are NSI's — … Every value is a cell НСИ
  // published." One body, two names, and a reader with no Cyrillic cannot tell
  // that they are the same institution — on the page whose argument is that
  // every figure can be traced to whoever published it.
  //
  // The COPY layer transliterates already (NSI, BNB, ECB, Eurostat) and
  // `verify_copy.mjs` §"every COPY string is written in its own alphabet" holds
  // it there. What that rule cannot see is the long bilingual prose inlined in
  // the component, which is most of the words on this page (site/AGENTS.md
  // §Copy says why it is inlined). This is the same rule over the rendered
  // result, which is where the two halves finally meet.
  //
  // **Asserted over what a reader is SERVED, not over the source.** The `/en/`
  // tree is the prerendered English half with the Bulgarian stripped, so any
  // Cyrillic left in it is Cyrillic on an English page — no flattening, no
  // guessing which span a template literal will land in.
  await withApp(
    async (page, errors) => {
      const cyrillic = await page.evaluate(() => {
        const text = document.querySelector("main.market").innerText;
        // Reported with enough either side to find the sentence it is in. A
        // bare list of letters names the alphabet and not the place.
        return [...text.matchAll(/[\p{Script=Cyrillic}]+/gu)].map((m) =>
          text.slice(Math.max(0, m.index - 45), m.index + m[0].length + 25).replace(/\s+/g, " ")
        );
      });
      assert.deepEqual(
        cyrillic,
        [],
        `the English market page carries Cyrillic:\n  ${cyrillic.join("\n  ")}\n\n` +
          "Publishers are named the way COPY names them — NSI, BNB, ECB, Eurostat, imot.bg. " +
          "The footer's «Данни от Евростат / ЕЦБ / НСИ / БНБ / имот.bg» is a licence " +
          "condition and lives outside main (docs/legal.md)."
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/en/market/",
    {}
  );
});

test("the market page is reachable from the calculator, and links back", { skip }, async () => {
  // Three entry points, and the one that converts is the home row's: a reader
  // just told how many years of pay a home costs is the reader already asking
  // what the market is doing. The header pill serves everyone.
  await withApp(
    async (page, errors) => {
      assert.equal(
        await page.locator('header.site .controls a[href="/market/"]').count(),
        1,
        "the calculator's header carries no route to /market/"
      );
      assert.ok(
        (await page.locator('a[href="/market/"]').count()) >= 2,
        "the calculator offers only one route to /market/ — the header pill, " +
          "the home row's link and the footer are three surfaces with three jobs"
      );
      await page.locator('header.site .controls a[href="/market/"]').click();
      await page.waitForURL(/\/market\/?$/);
      assert.ok(await page.locator("main.market").count(), "the header link did not land");
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    {}
  );

  await withApp(
    async (page, errors) => {
      assert.ok(
        (await page.locator('main.market a[href="/how/"]').count()) >= 1,
        "the market page offers no route to /how/"
      );
      assert.ok(
        (await page.locator('main.market a[href="/"]').count()) >= 1,
        "the market page offers no route back to the calculator"
      );
      assert.equal(
        await page.locator('footer.site a[href="/market/"]').count(),
        0,
        "the footer links /market/ from /market/ — a page linking to itself is noise"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

// ---------------------------------------------------------------------------
// The treatment every table on this page and on `/how/` is drawn with
// ---------------------------------------------------------------------------
//
// `fig-table.css` is one stylesheet mounted by two entries, and the three
// assertions below are about it rather than about `/market/`. They live here
// because this is the page that draws fifty-one of these tables, so a rule that
// stopped working has fifty-one places to show — and because a `main.how`
// selector and a `main.market` one measure the same rule twice.

test("a table wider than its column scrolls under the reader's own keys", { skip }, async () => {
  // `overflow-x: hidden` clips exactly the columns `auto` would and leaves them
  // unreachable. Everything else about the box survives it: it still takes
  // focus, `role="region"` still announces it, `scrollWidth` still exceeds
  // `clientWidth`, and assigning `scrollLeft` from a script still moves it — so
  // proving the box scrolls BY setting `scrollLeft` proves nothing a reader
  // gets. An arrow key is the whole difference: under `hidden` the container is
  // not user-scrollable, and the last columns of every table on two pages are
  // gone for anybody without a mouse.
  //
  // Measured at 360px, which is where these tables overflow at all.
  await withApp(
    async (page, errors) => {
      const box = await page.evaluate(() => {
        const el = [...document.querySelectorAll("main.market .scroll")].find(
          (candidate) => candidate.scrollWidth > candidate.clientWidth + 4
        );
        if (!el) return null;
        el.focus();
        return {
          name: el.getAttribute("aria-label") ?? "(unnamed)",
          over: el.scrollWidth - el.clientWidth,
          focused: document.activeElement === el,
          start: el.scrollLeft,
        };
      });
      assert.ok(
        box,
        "no table on /market/ is wider than its box at 360px, so the box under " +
          "test is not the one this is about"
      );
      assert.ok(box.focused, `the scroll box around "${box.name}" refused focus`);

      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      const moved = await page.evaluate(() => document.activeElement.scrollLeft);
      assert.ok(
        moved > box.start,
        `the box around "${box.name}" hides ${box.over}px of table and did not move ` +
          "under an arrow key, so those columns are unreachable by keyboard"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    { viewport: { width: 360, height: 780 } }
  );
});

test("no figure in a table touches the text of the row or column beside it", { skip }, async () => {
  // Cell padding is the only thing holding the columns of a ledger apart, and
  // losing it breaks the page in the way that leaves every other assertion
  // green: the figures are all still there, still right, still cited, and every
  // right-aligned number is drawn against the first letter of the next
  // column's label.
  //
  // Measured over the INK rather than over the boxes. A cell's border box is
  // the same width whatever its padding, so the gap that matters is between
  // where one cell's text stops and the next one's starts — a range over the
  // cell's contents is what gives that, and it reads whatever the row is made
  // of. The bound is well under the 10px `fig-table.css` sets and well over the
  // 1px rule left when the padding goes.
  await withApp(
    async (page, errors) => {
      const seen = await page.evaluate(() => {
        const ink = (cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const r = range.getBoundingClientRect();
          return r.width > 0 && r.height > 0 ? r : null;
        };
        let columns = null;
        let rows = null;
        let pairs = 0;
        for (const table of document.querySelectorAll("main.market table.fig-table")) {
          const grid = [...table.querySelectorAll("tr")].map((tr) => [...tr.children].map(ink));
          for (const row of grid) {
            for (let i = 0; i + 1 < row.length; i += 1) {
              if (!row[i] || !row[i + 1]) continue;
              pairs += 1;
              const gap = row[i + 1].left - row[i].right;
              if (columns === null || gap < columns) columns = gap;
            }
          }
          for (let i = 0; i + 1 < grid.length; i += 1) {
            for (let c = 0; c < Math.min(grid[i].length, grid[i + 1].length); c += 1) {
              if (!grid[i][c] || !grid[i + 1][c]) continue;
              pairs += 1;
              const gap = grid[i + 1][c].top - grid[i][c].bottom;
              if (rows === null || gap < rows) rows = gap;
            }
          }
        }
        return { columns, rows, pairs };
      });
      assert.ok(seen.pairs > 200, `only ${seen.pairs} pairs of cells could be measured`);
      assert.ok(
        seen.columns >= 4,
        `the tightest pair of columns on the page leaves ${seen.columns}px between one ` +
          "cell's text and the next one's, so a figure is drawn against its neighbour"
      );
      assert.ok(
        seen.rows >= 6,
        `the tightest pair of rows leaves ${seen.rows}px between them, so the table ` +
          "reads as a block of digits rather than as lines"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});

test("the marked row is tinted, not merely carrying the class", { skip }, async () => {
  // `tr.mark` is a claim: it says WHICH row of the published table the figure
  // quoted above it came from. Drawn with no tint the claim is not made at all —
  // the row is still in the DOM, still classed, still the right row, and a
  // reader looking for the cell that backs the sentence has a table of
  // identical lines.
  await withApp(
    async (page, errors) => {
      const tints = await page.evaluate(() => {
        const bg = (el) => getComputedStyle(el).backgroundColor;
        const clear = "rgba(0, 0, 0, 0)";
        return {
          marked: [...document.querySelectorAll("main.market tr.mark")].map(bg),
          plain: [
            ...new Set([...document.querySelectorAll("main.market tbody tr:not(.mark)")].map(bg)),
          ],
          clear,
        };
      });
      assert.ok(tints.marked.length >= 3, `${tints.marked.length} rows are marked on the page`);
      for (const paint of tints.marked) {
        assert.notEqual(
          paint,
          tints.clear,
          "a marked row is drawn with no background at all, so nothing on screen " +
            "says which published row the figure above it was read off"
        );
        assert.ok(
          !tints.plain.includes(paint),
          `a marked row is painted ${paint}, which is what the rows around it are ` +
            "painted — the mark then distinguishes nothing"
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/market/",
    {}
  );
});
