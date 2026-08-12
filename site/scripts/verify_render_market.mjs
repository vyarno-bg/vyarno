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

test("the market page renders its figures, each with a source under it", { skip }, async () => {
  await withApp(
    async (page, errors) => {
      const stats = page.locator("main.market .stat");
      const n = await stats.count();
      assert.ok(n >= 8, `the market page draws ${n} figures — it should carry the six sections'`);

      for (let i = 0; i < n; i += 1) {
        const stat = stats.nth(i);
        const value = (await stat.locator(".sv").innerText()).trim();
        assert.ok(value, `figure ${i} renders no value`);
        assert.match(
          value,
          /\d/,
          `figure ${i} renders "${value}" with no digit in it — a blank payload ` +
            "field reaches the page as an empty stat rather than as an error"
        );
        const source = stat.locator(".ss a");
        assert.equal(
          await source.count(),
          1,
          `the figure "${value}" has no source link. Every digit on this page ` +
            "carries its publisher, its period and a link, or it should not be here."
        );
        const href = await source.getAttribute("href");
        assert.match(href ?? "", /^https?:\/\//, `the source link for "${value}" is not a URL`);
        const caption = (await source.innerText()).trim();
        assert.ok(
          caption.includes("·"),
          `the source line for "${value}" is "${caption}" — it should name the ` +
            "publisher and the period the figure describes"
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
