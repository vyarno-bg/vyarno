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
      for (let i = 0; i < tabled; i += 1) {
        const cited = await tables.nth(i).evaluate((el) => {
          const box = el.closest(".scroll") ?? el;
          const after = box.nextElementSibling;
          const links = after ? [...after.querySelectorAll("a[href^='http']")] : [];
          return {
            after: after?.className ?? null,
            links: links.length,
            text: after?.innerText ?? "",
          };
        });
        assert.ok(
          cited.links >= 1,
          `figure table ${i} is followed by "${cited.after}" carrying ${cited.links} source ` +
            "links. A table of published figures cites its publisher exactly as a card does."
        );
      }

      // Every table cell holds a figure or a visible em dash. An empty cell is
      // a payload field that stopped arriving, and it reads as a value of
      // nothing rather than as data that is missing.
      const blanks = await tables
        .locator("tbody td")
        .evaluateAll((tds) => tds.filter((td) => !/[\d\u2014]/.test(td.innerText)).length);
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

test("both charts are drawn from zero, and say what they show", { skip }, async () => {
  // A y-axis cropped to a property series' own range turns any of them into a
  // cliff, and it is exactly the bias this page refuses. Measured rather than
  // read off the source: the scale lives in the component as arithmetic, and a
  // floor introduced there draws a chart that looks entirely reasonable.
  //
  // The invariant is the one a zero-based axis actually means — **the drawn
  // heights are in the same ratio as the values.** Subtract any floor and the
  // smallest reading shrinks faster than the largest, so the two ratios part.
  const market = payload("house_market");
  const structure = payload("house_market_structure");
  if (!market || !structure) return; // no refresh in this checkout

  const deals = Object.values(market.deals.series_by_period).map((r) => r.total);
  const pti = Object.values(structure.price_to_income.series_by_period);
  const expected = [
    ["dwellings sold", Math.min(...deals) / Math.max(...deals)],
    // The reference rule at 100 is part of this plot's own scale, so the
    // largest thing on it is whichever of the series and the rule is higher.
    ["price to income", Math.min(...pti) / Math.max(100, ...pti)],
  ];

  await withApp(
    async (page, errors) => {
      const charts = page.locator("main.market figure.chart svg");
      const n = await charts.count();
      assert.equal(n, expected.length, `the market page draws ${n} charts`);

      for (let i = 0; i < n; i += 1) {
        const [what, ratio] = expected[i];
        const svg = charts.nth(i);

        const label = (await svg.getAttribute("aria-label")) ?? "";
        assert.ok(
          label.length > 40 && /\d/.test(label),
          `the ${what} chart has no text alternative naming its figures: "${label}"`
        );
        assert.equal(await svg.getAttribute("role"), "img", `${what} is not announced as an image`);

        const ticks = (await svg.locator("text.plot-tick").allTextContents()).map((t) => t.trim());
        assert.ok(ticks.includes("0"), `the ${what} chart draws no zero: ${ticks.join(", ")}`);

        const drawn = await svg.evaluate((el) => {
          const base = el.querySelector("line.plot-axis").getBBox().y;
          const bars = [...el.querySelectorAll("rect.plot-bar")];
          if (bars.length) {
            const heights = bars.map((b) => b.getBBox().height);
            return { lo: Math.min(...heights), hi: Math.max(...heights) };
          }
          const box = el.querySelector("path.plot-line").getBBox();
          return { lo: base - (box.y + box.height), hi: base - box.y };
        });
        const drawnRatio = drawn.lo / drawn.hi;
        assert.ok(
          Math.abs(drawnRatio - ratio) < 0.03,
          `the ${what} chart draws its smallest reading at ${(drawnRatio * 100).toFixed(1)}% of ` +
            `its largest, where the published figures are ${(ratio * 100).toFixed(1)}% apart. ` +
            "The axis does not start at zero, and a truncated y-axis on a property chart is the " +
            "one distortion this page cannot afford."
        );
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

        for (const col of [2, 3]) {
          const head = (await table.locator(`thead th:nth-child(${col})`).innerText()).trim();
          assert.match(
            head,
            /Q[1-4]\s*\d{4}/,
            `column ${col} of the city table is headed "${head}" with no period in it — ` +
              "the two workbooks are released separately and either can be a quarter behind"
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
