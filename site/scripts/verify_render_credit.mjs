#!/usr/bin/env node
/**
 * `/credit/` in a browser.
 *
 * The page renders published figures and has no input on it, so what these
 * assert is that the figures ARRIVE and arrive captioned. Nothing else can see
 * that: a keyed `{#each}` naming a field the payload does not have evaluates
 * every key to `undefined`, Svelte rejects it at runtime, and the page renders
 * blank while every other suite in the repository stays green.
 *
 * The one claim worth a test of its own is the fixed/floating split. It is the
 * figure the page exists for, it is a share of a total, and a reader may sign a
 * thirty-year contract having read it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

/**
 * A rendered figure back to a number, in either language. `format.js#number`
 * goes through `toLocaleString`, so above 999 the marks differ AND both appear:
 * «1 234,5» against "1,234.5". Reading the LAST separator as the decimal and
 * everything before it as grouping is the only parse that takes both.
 */
const figure = (text) => {
  const bare = String(text).replace(/[^\d.,-]/g, "");
  const cut = Math.max(bare.lastIndexOf(","), bare.lastIndexOf("."));
  if (cut === -1) return Number(bare);
  return Number(`${bare.slice(0, cut).replace(/[.,]/g, "")}.${bare.slice(cut + 1)}`);
};

test(
  "the borrowing page draws its figures, each with a publisher and a period",
  { skip },
  async () => {
    await withApp(async (page, errors) => {
      const blocks = await page.locator("main.credit .stat").evaluateAll((els) =>
        els.map((el) => ({
          value: (el.querySelector("strong")?.textContent ?? "").trim(),
          label: (el.querySelector(".lbl")?.textContent ?? "").trim(),
          href: el.querySelector(".src")?.getAttribute("href") ?? "",
        }))
      );
      assert.ok(blocks.length >= 13, `/credit/ rendered ${blocks.length} figures`);
      for (const block of blocks) {
        assert.ok(block.label, "a figure on /credit/ carries no label saying what it is");
        assert.notEqual(block.value, "—", `«${block.label.slice(0, 40)}» rendered no value`);
        assert.match(
          block.href,
          /^https:\/\//,
          `«${block.label.slice(0, 40)}» links to "${block.href}" rather than out to its publisher`
        );
      }
      // Both publishers whose figures this page carries, reachable from it. The
      // footer's attribution is a licence condition and these make it checkable —
      // the assertion `verify_render_country.mjs` makes for its own four.
      const hrefs = await page
        .locator("main.credit a[href^='https://']")
        .evaluateAll((els) => els.map((el) => el.getAttribute("href")).join(" "));
      for (const host of ["bnb.bg", "ecb.europa.eu"]) {
        assert.ok(hrefs.includes(host), `/credit/ renders figures from ${host} and links to none`);
      }
      assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
    }, "/credit/");
  }
);

test("the fixation table adds up to the whole of new lending", { skip }, async () => {
  // A share table that does not sum to 100 is one where a bucket is missing or
  // one is being drawn twice, and either way the headline share above it is
  // being read against a total the rows do not make.
  await withApp(async (page, errors) => {
    const cells = await page
      .locator("main.credit #fixation table tbody tr td:first-of-type")
      .evaluateAll((els) => els.map((el) => el.textContent));
    const shares = cells.map(figure);
    assert.equal(shares.length, 4, `the fixation table drew ${shares.length} rows, expected 4`);
    const total = shares.reduce((sum, s) => sum + s, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `the four bucket shares sum to ${total}%, not 100%`);
    const headline = await page.locator("main.credit #fixation .stat strong").first().innerText();
    assert.ok(
      Math.abs(figure(headline) - shares[0]) < 0.1,
      `the headline share ${headline} is not the first row's ${shares[0]}%`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/credit/");
});

test(
  "what money costs is drawn dearest first, with a deposit at the bottom",
  { skip },
  async () => {
    // The section's whole argument is the ordering: a card rate means little
    // until it is under one number and over another. A payload arriving in a
    // different order, or a deposit rendered among the borrowing rows, loses it.
    await withApp(async (page, errors) => {
      // `figure` is a Node function and `evaluateAll` runs in the page, so the
      // text crosses the boundary and the parse happens on this side.
      const drawn = await page.locator("main.credit #other .stat").evaluateAll((els) =>
        els.map((el) => ({
          raw: el.querySelector("strong")?.textContent ?? "",
          pays: el.classList.contains("pays"),
        }))
      );
      const rows = drawn.map((r) => ({ pct: figure(r.raw), pays: r.pays }));
      assert.equal(rows.length, 5, `the section drew ${rows.length} products, expected 5`);
      const lending = rows.filter((r) => !r.pays);
      const deposits = rows.filter((r) => r.pays);
      assert.equal(deposits.length, 2);
      assert.deepEqual(
        lending.map((r) => r.pct),
        [...lending.map((r) => r.pct)].sort((a, b) => b - a),
        "the borrowing rows are not in descending order"
      );
      assert.ok(
        deposits.every((d) => d.pct < Math.min(...lending.map((r) => r.pct))),
        "a deposit is paying more than the cheapest thing on the page costs"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    }, "/credit/");
  }
);

test("the English page is in English and carries the same figures", { skip }, async () => {
  await withApp(async (page, errors) => {
    const heading = await page.locator("main.credit h1").innerText();
    assert.match(heading, /Borrowing in Bulgaria/);
    assert.ok(
      (await page.locator("main.credit .stat").count()) >= 13,
      "the English page drew fewer figures than the Bulgarian one"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/en/credit/");
});

test(
  "the English page writes its figures the way an English reader reads them",
  { skip },
  async () => {
    // `format.js#number` defaults to Bulgarian, so a call site that does not hand
    // it the reader's language renders «2,41%» on the English page — where a
    // comma is the thousands mark, so the rate reads as two hundred and forty
    // one. Every percentage here goes through that one function.
    await withApp(async (page, errors) => {
      const percents = await page
        .locator("main.credit strong, main.credit td.num")
        .evaluateAll((els) =>
          els.map((el) => el.textContent.trim()).filter((text) => text.endsWith("%"))
        );
      assert.ok(percents.length >= 12, `the English page drew ${percents.length} percentages`);
      for (const shown of percents) {
        assert.match(
          shown,
          /^\d{1,3}(,\d{3})*(\.\d+)?%$/,
          `«${shown}» is not an English number — its decimal mark reads as a thousands separator`
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    }, "/en/credit/");
  }
);

test("every axis label on the page is the gridline it sits on", { skip }, async () => {
  // Rounding a tick label to whole percent drew the 2,5% gridline as «3%», so
  // the axis read 0 · 3 · 5 · 8 · 10 over five evenly spaced lines. Equal steps
  // is the property that catches a label rounded away from its own tick, and it
  // is asserted over EVERY chart rather than the one it was found on: the ticks
  // a `niceTicks` step lands on move with the data, so a chart truthful today
  // because its steps happen to be whole is one nobody would be told about.
  await withApp(async (page, errors) => {
    const axes = await page
      .locator("main.credit .chart .yaxis")
      .evaluateAll((els) =>
        els.map((el) =>
          [...el.querySelectorAll(".plot-tick")].map((tick) => tick.textContent.trim())
        )
      );
    assert.ok(axes.length >= 4, `/credit/ drew ${axes.length} charts with an axis`);
    for (const labels of axes) {
      assert.ok(labels.length >= 4, `a chart drew ${labels.length} axis ticks`);
      const values = labels.map(figure);
      const steps = values.slice(1).map((v, i) => v - values[i]);
      for (const step of steps) {
        assert.ok(
          Math.abs(step - steps[0]) < 1e-9,
          `the axis labels ${labels.join(" \u00b7 ")} are not evenly spaced`
        );
      }
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/credit/");
});

test("the fixation curve is drawn against the whole 0-100%", { skip }, async () => {
  // The share has never been below 84%. An axis cropped to its own range draws
  // the 2022 dip as the country giving up on floating rates, which is the one
  // reading this section may not produce — and the caption has to keep saying
  // the share is of VOLUME, since a reader takes it for a count of contracts.
  await withApp(async (page, errors) => {
    const labels = await page
      .locator("main.credit #fixation .chart .yaxis .plot-tick")
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    assert.ok(labels.length >= 4, `the fixation curve drew ${labels.length} axis ticks`);
    const values = labels.map(figure);
    assert.equal(Math.min(...values), 0, `the fixation axis starts at ${Math.min(...values)}%`);
    assert.equal(Math.max(...values), 100, `the fixation axis ends at ${Math.max(...values)}%`);
    const caption = await page.locator("main.credit #fixation .note").innerText();
    assert.match(caption, /обема|volume/);
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/credit/");
});

test("the three prices are drawn as three lines under a legend of three", { skip }, async () => {
  // The reading is the gap between them, so a legend naming a line the plot
  // does not draw — or a line the legend does not name — is worse than no
  // chart: a reader cannot tell which of the three they are looking at.
  await withApp(async (page, errors) => {
    const chart = page.locator("main.credit #other .chart");
    assert.equal(await chart.locator(".plot-line").count(), 3, "the price chart drew three lines");
    const keys = await chart
      .locator("figcaption .key")
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    assert.equal(keys.length, 3, `the legend names ${keys.length} lines`);
    assert.ok(
      keys.every((key) => key.length > 0),
      "a legend key rendered blank, which is what a missing translation looks like"
    );
    // Three distinct strokes, so which line is which can be read off the plot
    // rather than guessed from where it sits. The mortgage takes `.floor` and
    // never `.total`: that class fades to 55% and the home-loan line lies on
    // the zero rule, where a faded hairline is §8's opening claim rendered
    // invisible on a phone.
    assert.equal(await chart.locator(".plot-line.floor").count(), 1);
    assert.equal(await chart.locator(".plot-line.second").count(), 1);
    assert.equal(await chart.locator(".plot-line.total").count(), 0);
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/credit/");
});

test.after(shutdown);
