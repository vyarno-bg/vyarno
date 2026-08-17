#!/usr/bin/env node
/**
 * Which published field feeds which figure on `/credit/`.
 *
 * The page has no input on it, so nothing a reader does can reach any of this.
 * What is left to get wrong is the wiring: a share read off the wrong bucket,
 * the ГПР rendered where the AAR belongs, a bucket order taken from a list here
 * rather than from the payload. Each renders a number that is correct and a
 * claim that is not — and on this page the claim is one somebody may sign a
 * thirty-year contract under.
 *
 * The published payload is read as well as fixtures, because the block is new
 * and the shape a gate lets through is the shape the page has to render.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  creditFixation,
  creditLimits,
  creditRates,
  creditRenegotiation,
} from "../src/lib/view/credit.js";

const PUBLISHED = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../data/published/mortgage.json", import.meta.url)),
    "utf8"
  )
);

test("the three rates come off three different blocks", () => {
  const rates = creditRates(PUBLISHED);
  assert.equal(rates.aar.value, PUBLISHED.new_business.value_pct);
  assert.equal(rates.aprc.value, PUBLISHED.new_business.aprc.value_pct);
  assert.equal(rates.outstanding.value, PUBLISHED.outstanding_stock.value_pct);
  // The ГПР includes charges, so reading it where the AAR belongs overstates
  // every payment the calculator draws. They are two blocks and two links.
  assert.ok(rates.aprc.value >= rates.aar.value);
  assert.notEqual(rates.aprc.sourceUrl, rates.outstanding.sourceUrl);
  for (const figure of [rates.aar, rates.aprc, rates.outstanding]) {
    assert.match(figure.sourceUrl, /^https:\/\//);
    assert.match(figure.refPeriod, /^\d{4}-\d{2}$/);
  }
});

test("the fixation buckets keep the payload's own order and shares", () => {
  const fixation = creditFixation(PUBLISHED);
  assert.deepEqual(
    fixation.buckets.map((b) => b.bucket),
    PUBLISHED.fixation.buckets.map((b) => b.bucket),
    "the order is БНБ's, shortest fixation first — a list here would drop a new bucket"
  );
  assert.equal(Math.round(fixation.buckets.reduce((sum, b) => sum + b.sharePct, 0)), 100);
  // The headline is the first bucket and nothing else. Summing the three
  // fixed buckets and subtracting would give the same number today and a
  // different one the month a fifth bucket appears.
  assert.equal(fixation.floating.value, fixation.buckets[0].sharePct);
  assert.ok(fixation.floating.method.includes("shortest fixation bucket"));
});

test("a bucket nobody lent into carries no rate, rather than a zero", () => {
  const fixation = creditFixation({
    fixation: {
      ref_period: "2026-06",
      total_eur_m: 100,
      buckets: [
        { bucket: "up_to_1y", share_pct: 100, volume_eur_m: 100, rate_pct: 2.4 },
        { bucket: "over_10y", share_pct: 0, volume_eur_m: 0, rate_pct: 0 },
      ],
    },
  });
  // 0 is what the workbook prints in an empty cell. Rendered as «0,00%» it
  // reads as a bank lending for nothing, which is the one number on this page
  // a reader would act on hardest.
  assert.equal(fixation.buckets[1].ratePct, 0);
  assert.equal(fixation.buckets[1].sharePct, 0);
});

test("the shares over time come out oldest first, whatever order the JSON held", () => {
  const fixation = creditFixation({
    fixation: { floating_share_by_period: { "2026-06": 99.6, "2007-01": 95.1, "2015-03": 96.7 } },
  });
  assert.deepEqual(
    fixation.sharesByPeriod.map((p) => p.period),
    ["2007-01", "2015-03", "2026-06"]
  );
});

test("renegotiation is reported as a share of new business, not of pure new lending", () => {
  const split = creditRenegotiation(PUBLISHED);
  const block = PUBLISHED.new_business_split;
  assert.equal(split.share.value, block.renegotiated_share_pct);
  const denominator = block.pure_new_eur_m + block.renegotiated_eur_m;
  assert.ok(
    Math.abs(split.share.value - (100 * block.renegotiated_eur_m) / denominator) < 0.05,
    "the share divides by new business — pure new plus renegotiated — not by pure new alone"
  );
  assert.ok(split.share.value > 0 && split.share.value < 100);
});

test("the limits keep БНБ's three and ours apart", () => {
  const limits = creditLimits(PUBLISHED);
  assert.equal(limits.ltvMaxPct + limits.minDownPaymentPct, 100);
  // The 30% line is this site's and is stricter than both the regulator's
  // ceiling and what borrowers average. A page that printed the four in one
  // column would be attributing ours to БНБ.
  assert.ok(limits.prudentDstiPct < limits.observedDstiPct);
  assert.ok(limits.observedDstiPct < limits.dstiMaxPct);
  assert.match(limits.sourceUrl, /bnb\.bg/);
});

test("every reader of a missing payload gets nulls rather than a thrown page", () => {
  for (const payload of [null, undefined, {}]) {
    assert.equal(creditRates(payload).aar.value, null);
    assert.deepEqual(creditFixation(payload).buckets, []);
    assert.equal(creditRenegotiation(payload).share.value, null);
    assert.equal(creditLimits(payload), null);
  }
});
