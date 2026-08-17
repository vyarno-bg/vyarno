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
  creditArrears,
  creditFixation,
  creditLimits,
  creditOutstanding,
  creditProducts,
  creditRates,
  creditRenegotiation,
  creditSavings,
} from "../src/lib/view/credit.js";

const CREDIT = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../data/published/credit.json", import.meta.url)), "utf8")
);
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

test("the products come out dearest first, with the deposits marked as paid not charged", () => {
  const products = creditProducts(CREDIT);
  assert.deepEqual(
    products.map((p) => p.key),
    ["card", "consumer", "overdraft", "deposit_term", "deposit_overnight"]
  );
  // Dearest first is the order, and it is the point: the figure a reader is
  // least likely to know is the one the section opens on.
  const lending = products.filter((p) => !p.isDeposit);
  for (let i = 1; i < lending.length; i += 1) {
    assert.ok(
      lending[i - 1].rate.value >= lending[i].rate.value,
      `${lending[i - 1].key} (${lending[i - 1].rate.value}%) should not sit below ${lending[i].key}`
    );
  }
  assert.deepEqual(
    products.filter((p) => p.isDeposit).map((p) => p.key),
    ["deposit_term", "deposit_overnight"]
  );
});

test("the card block carries no APRC, because BG publishes none", () => {
  const card = creditProducts(CREDIT).find((p) => p.key === "card");
  assert.equal(card.monthlyVolumeEurM, null, "no NEW BUSINESS volume: the ЕЦБ key is a 404");
  assert.equal(card.aprcPct, null);
  // A missing figure has to say it is one (P11), and the page prints this
  // string rather than leaving the absence to be noticed. The volume is no
  // longer one of them — БНБ publish it — so this names the APRC alone.
  assert.ok(card.noAprc.length > 20);
  assert.doesNotMatch(card.noAprc, /volume/i, "the volume exists now; only the APRC does not");
  const consumer = creditProducts(CREDIT).find((p) => p.key === "consumer");
  assert.ok(consumer.aprcPct >= consumer.rate.value);
});

test("a quantity beside a rate carries its own publisher, never the rate's", () => {
  // ЕЦБ MIR publishes no outstanding volume for BG at all, so every amount on
  // this page is БНБ's while the rate above it is the ЕЦБ's. A card that
  // rendered one source line over the pair would credit one publisher with the
  // other's number, which is the single worst error this page could make.
  for (const product of creditProducts(CREDIT).filter((p) => p.stockEurM !== null)) {
    assert.equal(product.stockSource, "bnb", product.key);
    assert.match(product.stockSourceUrl, /bnb\.bg/, product.key);
    assert.match(product.rate.sourceUrl, /ecb\.europa\.eu/, product.key);
    assert.match(product.stockRefPeriod, /^\d{4}-\d{2}$/, product.key);
  }
  const card = creditProducts(CREDIT).find((p) => p.key === "card");
  const overdraft = creditProducts(CREDIT).find((p) => p.key === "overdraft");
  // The card figure is the balance being CHARGED interest, which is a subset of
  // every card balance — and the overdraft figure is БНБ's block with that card
  // block taken out, so the two cannot both be reading the same cell.
  assert.ok(card.stockEurM > 0 && overdraft.stockEurM > 0);
  assert.notEqual(card.stockEurM, overdraft.stockEurM);
  // Only the derived one claims to be derived.
  assert.ok(overdraft.stockBasis.includes("card"));
  assert.equal(card.stockBasis, null);
});

test("an amount only sits beside a rate that describes it", () => {
  // **The bug this exists for shipped and was caught in a screenshot.** The
  // consumer card's headline is what a loan signed LAST MONTH costs (8.76%,
  // new business); what is owed on consumer credit is an €11.3 bn book at
  // 6.91%. Rendered together they read as «8.76% on €11.3 bn» — a rate over a
  // population it does not describe, which is the denominator swap this whole
  // project exists to prevent, printed on the page that argues it.
  //
  // Card and overdraft may carry both, and the reason is a fact about MIR
  // rather than a preference: revolving credit is reported as new business
  // EQUAL to the outstanding amount, which is why БНБ's outstanding cells
  // reproduce A2Z3 and A2Z1 to 0.02 pp and the pipeline gates that they do.
  const REVOLVING = new Set(["card", "overdraft"]);
  for (const product of creditProducts(CREDIT)) {
    if (product.stockEurM === null) continue;
    assert.ok(
      REVOLVING.has(product.key),
      `${product.key} pairs an amount with a rate that is not the rate on it`
    );
  }
  const consumer = creditProducts(CREDIT).find((p) => p.key === "consumer");
  assert.equal(consumer.stockEurM, null, "consumer credit's stock belongs to the owed table");
  // …and it is in that table, beside the rate that IS its own.
  const block = creditOutstanding(CREDIT).blocks.find((b) => b.block === "consumer");
  assert.ok(block.volumeEurM > 1000);
  assert.notEqual(block.ratePct, consumer.rate.value);
});

test("the deposit card shows both what is quoted and what is earned", () => {
  // A saver is quoted the new-business rate and is living in the stock one,
  // and most of the money in a term deposit was locked in when they paid
  // nothing. Showing only the first tells a reader their savings are keeping up
  // better than they are.
  const term = creditProducts(CREDIT).find((p) => p.key === "deposit_term");
  assert.ok(term.monthlyVolumeEurM > 0, "how much went in last month");
  assert.ok(term.stockRatePct > 0, "what the money already in one earns");
  assert.ok(
    term.stockRatePct < term.rate.value,
    `the stock rate (${term.stockRatePct}%) should sit below the quoted one (${term.rate.value}%)`
  );
  // Both are the ЕЦБ's own, so this pair shares one publisher and the card
  // does not need a second attribution the way the card and overdraft do.
  assert.match(term.stockSourceUrl, /ecb\.europa\.eu/);
  assert.equal(term.stockSource, null);
});

test("the outstanding blocks add up to the total, and the rate is not ours", () => {
  const owed = creditOutstanding(CREDIT);
  const summed = owed.blocks.reduce((total, b) => total + b.volumeEurM, 0);
  assert.ok(Math.abs(summed - owed.totalEurM) < 0.01, `${summed} against ${owed.totalEurM}`);
  assert.ok(Math.abs(owed.blocks.reduce((s, b) => s + b.sharePct, 0) - 100) < 0.01);
  // **The published rate is the ЕЦБ's own A20, not the blend the pipeline gates
  // with.** Printing our arithmetic where a publisher's figure belongs is the
  // thing `outstanding.rate_source` exists to keep visible, so the two URLs
  // have to come off different hosts.
  assert.match(owed.sourceUrl, /bnb\.bg/);
  assert.match(owed.rate.sourceUrl, /ecb\.europa\.eu/);
  // Largest block first, which is the order the page draws them.
  for (let i = 1; i < owed.blocks.length; i += 1) {
    assert.ok(owed.blocks[i - 1].volumeEurM >= owed.blocks[i].volumeEurM);
  }
});

test("every stock series is drawn from zero, whatever its own floor is", () => {
  const owed = creditOutstanding(CREDIT);
  for (const [name, series] of Object.entries(owed.series)) {
    assert.equal(series.min, 0, `${name} must contain zero`);
    assert.ok(series.points.length > 200, `${name} goes back to ${owed.startsAt}`);
    assert.deepEqual(
      series.points.map((p) => p.period),
      [...series.points.map((p) => p.period)].sort(),
      `${name} must be oldest first`
    );
  }
  // A y-axis cropped to a debt series' own range turns nineteen years of
  // ordinary growth into a cliff, and «nobody owes anything» is the floor that
  // means something for a euro amount.
  const housing = owed.series.housing;
  assert.ok(housing.first.value < housing.latest.value / 5, "the growth is real, not a crop");
});

test("the arrears block keeps households and companies apart", () => {
  const npl = creditArrears(CREDIT);
  // The claim the page makes, and the only one CBD2 supports in every quarter.
  assert.ok(npl.corporations > npl.households);
  for (const period of Object.values(npl.series)) {
    assert.ok(period.points.length > 8);
    assert.equal(period.min, 0);
  }
  // Three scopes, three links: a reader checking «whose loans» has to be able
  // to reach the series each figure came from rather than one standing for all.
  assert.equal(new Set(Object.values(npl.scopeSourceUrls)).size, 3);
  for (const url of Object.values(npl.scopeSourceUrls)) assert.match(url, /CBD2/);
  assert.match(npl.refPeriod, /^\d{4}-Q[1-4]$/, "quarterly, and it says so");
  assert.ok(npl.denominator.length > 20, "whose loans over what portfolio, in the payload");
});

test("a missing outstanding or arrears block drops its section rather than throwing", () => {
  for (const payload of [null, undefined, {}]) {
    assert.equal(creditOutstanding(payload), null);
    assert.equal(creditArrears(payload), null);
  }
});

test("a missing credit payload drops the section rather than throwing", () => {
  for (const payload of [null, undefined, {}]) assert.deepEqual(creditProducts(payload), []);
});

test("the savings ratio divides one population by itself, never across publishers", () => {
  const savings = creditSavings(CREDIT);
  // The seam this guards: `outstanding.total_eur_m` is БНБ's and counts sector
  // Домакинства alone in two of its blocks, while both figures here are BSI's
  // and count the non-profit institutions with them. The two differ by about a
  // fiftieth, which is small enough to look like a rounding slip and is a
  // different population.
  assert.equal(savings.loansEurM, CREDIT.savings.loans_eur_m);
  assert.notEqual(savings.loansEurM, CREDIT.outstanding.total_eur_m);
  assert.equal(savings.depositsEurM, CREDIT.savings.deposits_eur_m);
  assert.ok(Math.abs(savings.ratio - savings.depositsEurM / savings.loansEurM) < 1e-4);
  // The page prints one publisher over this pair, so neither URL may be БНБ's.
  for (const url of [savings.depositsSourceUrl, savings.loansSourceUrl]) {
    assert.match(url, /data-api\.ecb\.europa\.eu\/service\/data\/BSI\//);
  }
});

test("both lines cover the same months, and the chart is told one scale", () => {
  const savings = creditSavings(CREDIT);
  const { deposits, loans } = savings.series;
  assert.deepEqual(
    deposits.points.map((p) => p.period),
    loans.points.map((p) => p.period)
  );
  // A component reaching for `deposits.max` would be right only while deposits
  // are the larger, and the subject of the chart is that gap closing. Asserting
  // it against today's payload proves nothing — deposits ARE the larger, so
  // `deposits.max` and the max of the pair are the same number. The scale has
  // to be read off a pair where they differ, or the claim is untested.
  assert.equal(savings.scaleMax, deposits.max);
  const crossed = creditSavings({
    savings: {
      deposits_by_period: { "2022-01": 100, "2022-02": 110 },
      loans_by_period: { "2022-01": 90, "2022-02": 400 },
    },
  });
  assert.equal(crossed.scaleMax, 400);
  // Levels, so the floor is zero — an axis cropped to the pair's own range
  // draws the gap as a cliff.
  assert.equal(deposits.min, 0);
  assert.equal(loans.min, 0);
});

test("the cushion is read at both ends of the window, from that end's two levels", () => {
  const savings = creditSavings(CREDIT);
  const { deposits, loans } = savings.series;
  assert.ok(Math.abs(savings.ratioFirst - deposits.first.value / loans.first.value) < 1e-9);
  assert.ok(Math.abs(savings.ratioLatest - deposits.latest.value / loans.latest.value) < 1e-9);
  // The latest end is the figure the pipeline gated and the card prints, so the
  // two arithmetics have to agree or one of them is being read off a stale key.
  assert.ok(Math.abs(savings.ratioLatest - savings.ratio) < 1e-4);
});

test("a missing savings block drops its section rather than throwing", () => {
  assert.equal(creditSavings(null), null);
  assert.equal(creditSavings({}), null);
  const empty = creditSavings({ savings: {} });
  assert.equal(empty.ratio, null);
  assert.equal(empty.depositsEurM, null);
  assert.deepEqual(empty.series.deposits.points, []);
});
