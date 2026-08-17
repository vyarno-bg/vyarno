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
      assert.ok(blocks.length >= 8, `/credit/ rendered ${blocks.length} figures`);
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
    const shares = await page
      .locator("main.credit #fixation table tbody tr td:first-of-type")
      .evaluateAll((els) =>
        els.map((el) => Number(el.textContent.replace(",", ".").replace("%", "")))
      );
    assert.equal(shares.length, 4, `the fixation table drew ${shares.length} rows, expected 4`);
    const total = shares.reduce((sum, s) => sum + s, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `the four bucket shares sum to ${total}%, not 100%`);
    const headline = await page.locator("main.credit #fixation .stat strong").first().innerText();
    assert.ok(
      Math.abs(Number(headline.replace(",", ".").replace("%", "")) - shares[0]) < 0.1,
      `the headline share ${headline} is not the first row's ${shares[0]}%`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/credit/");
});

test("the English page is in English and carries the same figures", { skip }, async () => {
  await withApp(async (page, errors) => {
    const heading = await page.locator("main.credit h1").innerText();
    assert.match(heading, /Borrowing in Bulgaria/);
    assert.ok(
      (await page.locator("main.credit .stat").count()) >= 8,
      "the English page drew fewer figures than the Bulgarian one"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/en/credit/");
});

test.after(shutdown);
