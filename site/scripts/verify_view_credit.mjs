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
  creditBusinessSpread,
  creditFixation,
  creditFixationHistory,
  creditLimits,
  creditOutstanding,
  creditProductHistory,
  creditProducts,
  creditRates,
  creditStockHistory,
  peakWorthNaming,
  troughWorthNaming,
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

test("the third rate is the housing book, which is what its label claims", () => {
  // §5 renders the whole household book at 4,5% on this same page, so a reader
  // meets the two together. The same БНБ workbook carries an all-loans column:
  // picking it leaves every figure correct and «жилищни» in the label false.
  const rates = creditRates(PUBLISHED);
  const housing = CREDIT.outstanding.blocks.find((b) => b.block === "housing");
  assert.equal(rates.outstanding.value, housing.rate_pct);
  assert.equal(rates.bookVolumeEurM, housing.volume_eur_m);
  assert.notEqual(rates.outstanding.value, CREDIT.outstanding.rate_pct);
});

test("the rate curve is the card above it, drawn from zero", () => {
  // The section opens «Това е третата лихва отгоре», so the last point has to
  // BE that card. A floor above zero would draw a fall from 9% to under 3% as a
  // cliff, which is the one way a correct series still misleads.
  const history = creditStockHistory(PUBLISHED);
  const rates = creditRates(PUBLISHED);
  assert.equal(history.latest.value, rates.outstanding.value);
  assert.equal(history.series.min, 0);
  assert.equal(
    history.series.points.length,
    Object.keys(PUBLISHED.outstanding_stock.series_by_period).length
  );
  assert.equal(history.peak.value, Math.max(...history.series.points.map((p) => p.value)));
  assert.ok(history.peak.value > history.latest.value);
});

test("a mortgage payload with no rate history drops the curve rather than throwing", () => {
  assert.equal(creditStockHistory(null), null);
  assert.equal(creditStockHistory({ outstanding_stock: {} }), null);
  assert.equal(
    creditStockHistory({ outstanding_stock: { series_by_period: { "2026-06": 2.7 } } }),
    null
  );
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
  const history = creditFixationHistory({
    fixation: { floating_share_by_period: { "2026-06": 99.6, "2007-01": 95.1, "2015-03": 96.7 } },
  });
  assert.deepEqual(
    history.series.points.map((p) => p.period),
    ["2007-01", "2015-03", "2026-06"]
  );
});

test("the fixation curve's axis reaches zero, so the dip is drawn as a dip", () => {
  // The series has never been below 84%. Measured against its own range the
  // 2022 dip is the whole height of the plot and reads as fixing collapsing;
  // against zero it is what it is, a share that stayed near its ceiling. There
  // is no argument here that would let a caller raise the floor.
  const history = creditFixationHistory(PUBLISHED);
  assert.equal(history.series.min, 0);
  assert.ok(history.trough.value > 50, `the trough is ${history.trough.value}%`);
  assert.ok(history.trough.value < history.peak.value);
  // The month the page names comes off the points, never out of the prose.
  const shares = PUBLISHED.fixation.floating_share_by_period;
  assert.equal(history.trough.value, Math.min(...Object.values(shares)));
  assert.equal(history.latest.value, shares[PUBLISHED.fixation.ref_period]);
});

test("a fixation series too short to be a line comes back as no chart at all", () => {
  // One point renders a path with a single `M` command and no stroke — a
  // figure with an axis, a caption and nothing drawn in it.
  assert.equal(
    creditFixationHistory({ fixation: { floating_share_by_period: { "2026-06": 99.6 } } }),
    null
  );
  assert.equal(creditFixationHistory(null), null);
});

test("the three prices share one scale, and it is the dearest of them", () => {
  // Three lines on one axis need ONE scale. A component reaching for the card's
  // own max is right only while the card is the dearest thing on the page, and
  // a consumer rate above it would be drawn off the top of the box.
  const history = creditProductHistory(CREDIT, PUBLISHED);
  const { card, consumer, mortgage } = history.series;
  assert.equal(history.scaleMax, Math.max(card.max, consumer.max, mortgage.max));
  for (const series of [card, consumer, mortgage]) {
    assert.equal(series.min, 0, "a rate axis that does not reach zero draws a wobble as a cliff");
    assert.ok(
      series.points.length > 60,
      `${series.points.length} points is not six years of months`
    );
  }
  // The three come off three different published blocks, which is the wiring
  // this exists to hold: the mortgage rate is `mortgage.json`'s new business
  // and the other two are `credit.json`'s, and swapping any pair draws a
  // correct line under the wrong key.
  assert.equal(card.latest.value, CREDIT.card.value_pct);
  assert.equal(consumer.latest.value, CREDIT.consumer.value_pct);
  assert.equal(mortgage.latest.value, PUBLISHED.new_business.value_pct);
  // The consumer loan is the one of the three that turned. Its peak is inside
  // the window rather than at either end, which is what the section claims.
  assert.notEqual(consumer.peak.period, consumer.from);
  assert.notEqual(consumer.peak.period, consumer.to);
});

test("no chart is drawn where one of the three prices is missing", () => {
  // Two lines under a legend naming three is worse than no chart: the reading
  // is the gap between them, and a reader cannot see which one did not arrive.
  assert.equal(creditProductHistory({ card: CREDIT.card, consumer: CREDIT.consumer }, null), null);
  assert.equal(creditProductHistory(null, PUBLISHED), null);
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
    assert.equal(creditBusinessSpread(payload, payload), null);
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

test("the company line is cut to the months the mortgage line is published on", () => {
  const spread = creditBusinessSpread(CREDIT, PUBLISHED);
  const { business, home } = spread.series;
  assert.deepEqual(
    business.points.map((p) => p.period),
    home.points.map((p) => p.period)
  );
  // The published corporate series really is the longer one, so the cut is
  // doing work rather than being a no-op over two equal windows. Without this
  // the test above passes on a function that returns both series whole.
  assert.ok(
    Object.keys(CREDIT.business_lending.series_by_period).length > business.points.length,
    "the corporate series is no longer than the mortgage one, so nothing was cut"
  );
  assert.equal(spread.from, home.from);
  // The window is the intersection and not the mortgage series' own: a
  // corporate payload that stopped early has to shorten the chart, not leave a
  // line running past its last reading.
  const short = creditBusinessSpread(
    { business_lending: { series_by_period: { "2020-01": 3, "2020-02": 3.1 } } },
    { new_business: { series_by_period: { "2020-01": 2, "2020-02": 2.1, "2020-03": 2.2 } } }
  );
  assert.deepEqual(
    short.series.home.points.map((p) => p.period),
    ["2020-01", "2020-02"]
  );
  // Levels drawn from zero, so the gap is drawn as a gap and not as a cliff.
  assert.equal(business.min, 0);
  assert.equal(home.min, 0);
  // One scale for the pair, read off a payload where the HOME rate is the
  // taller. Against today's it is the corporate one, so `scaleMax: business.max`
  // and the max of the pair are the same number and the claim goes untested.
  const homeDearer = creditBusinessSpread(
    { business_lending: { series_by_period: { "2020-01": 2, "2020-02": 2.5 } } },
    { new_business: { series_by_period: { "2020-01": 9, "2020-02": 8 } } }
  );
  assert.equal(homeDearer.scaleMax, 9);
});

test("the difference is the company rate minus the home one, of the same month", () => {
  const spread = creditBusinessSpread(CREDIT, PUBLISHED);
  const { business, home } = spread.series;
  // The direction is the whole sentence: reversed, every «+» on the page reads
  // «−» and the section says the opposite of what the payload holds.
  for (const [i, point] of spread.gap.points.entries()) {
    assert.equal(point.period, business.points[i].period);
    assert.ok(Math.abs(point.value - (business.points[i].value - home.points[i].value)) < 1e-9);
  }
  assert.equal(spread.gap.latest.period, spread.to);
  // `latestIsWidest` picks which of the section's two sentences renders, so it
  // is read off a payload whose widest month is NOT the last one — against
  // today's, where they coincide, a function returning `true` unconditionally
  // would pass.
  const past = creditBusinessSpread(
    { business_lending: { series_by_period: { "2020-01": 5, "2020-02": 3, "2020-03": 4 } } },
    { new_business: { series_by_period: { "2020-01": 2, "2020-02": 2, "2020-03": 2 } } }
  );
  assert.equal(past.gap.widest.period, "2020-01");
  assert.equal(past.gap.narrowest.period, "2020-02");
  assert.equal(past.gap.latestIsWidest, false);
  const nowWidest = creditBusinessSpread(
    { business_lending: { series_by_period: { "2020-01": 3, "2020-02": 5 } } },
    { new_business: { series_by_period: { "2020-01": 2, "2020-02": 2 } } }
  );
  assert.equal(nowWidest.gap.latestIsWidest, true);
});

test("a missing savings block drops its section rather than throwing", () => {
  assert.equal(creditSavings(null), null);
  assert.equal(creditSavings({}), null);
  const empty = creditSavings({ savings: {} });
  assert.equal(empty.ratio, null);
  assert.equal(empty.depositsEurM, null);
  assert.deepEqual(empty.series.deposits.points, []);
});

// ---------------------------------------------------------------------------
// Whether an extreme may be named as one
// ---------------------------------------------------------------------------

/** A series in the shape `plotLevels` returns, from three readings. */
const arc = (first, peakOrTrough, latest) => ({
  first: { value: first },
  peak: { value: Math.max(first, peakOrTrough, latest) },
  trough: { value: Math.min(first, peakOrTrough, latest) },
  latest: { value: latest },
});

test("peakWorthNaming allows «с връх» only where the rate came back down", () => {
  // «с връх 9,00% през ноември 2008 г.» tells a reader the rate climbed and
  // returned. True while the maximum is inside the record; false the month it
  // IS the latest reading, where the sentence reports a level the series is
  // still standing at as one it has left.
  assert.equal(peakWorthNaming(arc(8.38, 9.0, 2.66)), true, "an interior peak is a peak");
  assert.equal(
    peakWorthNaming(arc(2.66, 5, 9.0)),
    false,
    "a peak at the latest reading is not one"
  );
  assert.equal(peakWorthNaming(arc(9.0, 5, 2.66)), false, "a peak at the first reading is not one");
});

test("troughWorthNaming gates the recovery, not the figure", () => {
  // «после делът се върна нагоре» is the half that goes false with every
  // printed digit still correct: a fresh low arriving as the latest reading
  // leaves the trough and its date right and the verb describing a return that
  // has not happened.
  assert.equal(troughWorthNaming(arc(87.21, 84.03, 99.59)), true);
  assert.equal(
    troughWorthNaming(arc(99.59, 90, 84.03)),
    false,
    "a fresh low as the latest reading has not been recovered from"
  );
  assert.equal(troughWorthNaming(arc(84.03, 90, 99.59)), false, "a low at the start is not a dip");
});

test("neither names an extreme on a flat or a one-sided series", () => {
  // A series that never moves has no peak and no dip worth a word, and one
  // where an endpoint ties the extreme is the same case: `>` rather than `>=`
  // is what keeps «връх» off a level the series is sitting on.
  assert.equal(peakWorthNaming(arc(5, 5, 5)), false, "a flat series has no peak");
  assert.equal(troughWorthNaming(arc(5, 5, 5)), false, "a flat series has no dip");
  assert.equal(peakWorthNaming(arc(5, 9, 9)), false, "a peak tied with the latest is not interior");
  assert.equal(
    troughWorthNaming(arc(5, 1, 1)),
    false,
    "a dip tied with the latest is not interior"
  );
});

test("neither speaks where a reading is missing", () => {
  // A series short of an end has no shape to describe. Returning false renders
  // the figures with no verdict, which is the neutral form the caption falls
  // back to rather than a sentence with a hole in it.
  for (const bad of [null, undefined, {}, { peak: { value: 9 } }, arc(1, 9, NaN)]) {
    assert.equal(peakWorthNaming(bad), false, `${JSON.stringify(bad)} produced a peak`);
    assert.equal(troughWorthNaming(bad), false, `${JSON.stringify(bad)} produced a trough`);
  }
});

test("the shipped credit series get the verdict their own readings support", () => {
  // Against the payload, so the gate and the caption cannot disagree on today's
  // data. Nothing is pinned: which quarter holds the extreme is upstream's.
  const mortgage = PUBLISHED;
  for (const history of [creditStockHistory(mortgage), creditFixationHistory(mortgage)]) {
    if (!history) continue;
    const s = history.series;
    if (peakWorthNaming(s)) {
      assert.ok(s.peak.value > s.latest.value && s.peak.value > s.first.value);
    }
    if (troughWorthNaming(s)) {
      assert.ok(s.trough.value < s.latest.value && s.trough.value < s.first.value);
    }
  }
});
