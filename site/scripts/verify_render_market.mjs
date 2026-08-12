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
            const box = el.closest(".scroll") ?? el;
            // A numbers table publishes the series of the chart above it and is
            // cited by that chart's own source line, which sits directly above
            // the disclosure it lives in. Everything else cites after itself.
            const disclosure = box.closest("details.numbers");
            const near = disclosure ? disclosure.previousElementSibling : box.nextElementSibling;
            const links = near ? near.querySelectorAll("a[href^='http']").length : 0;
            return links >= 1 ? null : `table ${i} beside "${near?.className ?? "nothing"}"`;
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

    const expected = [
      ["dwellings sold", ratioOf(col(market.deals.series_by_period, "total"))],
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
      ["price to income", ratioOf(col(structure.price_to_income.series_by_period), 100)],
      ["housing cost overburden", ratioOf(col(structure.housing_cost_overburden.series_by_period))],
    ];

    await withApp(
      async (page, errors) => {
        const charts = page.locator("main.market figure.chart svg");
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

          const ticks = (await svg.locator("text.plot-tick").allTextContents()).map((t) =>
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
  await withApp(
    async (page, errors) => {
      const sparks = page.locator("main.market table.fig-table.cities svg.spark");
      const n = await sparks.count();
      if (!n) return; // no нси payload in this checkout
      assert.ok(n >= 6, `only ${n} cities carry a history`);

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
    await withApp(
      async (page, errors) => {
        const table = page.locator("main.market table.fig-table.cities");
        if (!(await table.count())) return; // no нси payload in this checkout

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
