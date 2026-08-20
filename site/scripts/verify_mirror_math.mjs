#!/usr/bin/env node
/**
 * Math verification for `src/lib/mirror.js` — everything except the
 * gross↔net payroll pair, which has its own file
 * (`verify_net_salary.mjs`). Runs under Node's built-in `node:test`
 * runner, no dependencies. Invoked by
 *
 *     npm run verify:math
 *
 * from `site/`.
 *
 * Why this exists: `mirror.js` is the ONLY file in the SPA with domain math,
 * so every exported function here carries a case. Making `pocketReal` subtract
 * instead of divide, inverting `percentile`, or making `rateFor` ignore the
 * anchor year are each a wrong number on the user's screen, and none of them
 * is visible to a test of anything else.
 *
 * Each block states the invariant it protects. When you change a formula
 * in mirror.js, change the test in the same commit
 * (docs/testing-strategy.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rateFor,
  latestIndexYear,
  personalInflation,
  officialInflation,
  officialCumulativeSince2020,
  pocketReal,
  pocketPerMonth,
  standStillNet,
  extraPerMonth,
  percentile,
  divisionRate,
  officialSplit,
  contributions,
  personalInflationDetailed,
  buildLadder,
  composeLadder,
  flooredCuts,
  meanRungPosition,
  wageGap,
  rentBurden,
  rentDays,
  annuityPayment,
  annuityReverse,
  homeYears,
  cashErosion,
  payrollParams,
  bgNetSalary,
  bgMarginalRatePct,
  bgTaxWedge,
  bgGrossFromNet,
  bgPayslipFromNet,
  householdNet,
  bgHouseholdPayroll,
  householdNetRaisePct,
  BG_PAYROLL_DEFAULT,
  changePct,
  quarterYearAgo,
  dealsAtQuarter,
  yearOnYearChanges,
  unoccupiedSharePct,
  dealInYearsOfPay,
  indexTimesBase,
  rangePosition,
  shortfallPct,
  eurosFromMixedCurrency,
  completeYearTotals,
  yearEndGrowth,
  sharePctByKey,
  lessSharePct,
} from "../src/lib/mirror.js";
import { near } from "./near.mjs";

/**
 * A category shaped like the published `hicp_categories.json` entries.
 *
 * No anchor reads 100 in any fixture below, and that is the point: the payload
 * carries Eurostat's own index values, where an anchor year reading exactly
 * 100 would be a coincidence. Code that divides by a literal 100 instead of
 * looking the anchor up returns a plausible-looking percentage, so the fixture
 * has to be the thing that refuses to cooperate with it.
 */
function cat({ rate, idx, latest, weight = 10 }) {
  return {
    weight_pct: weight,
    annual_rate_pct: rate,
    index_by_year: idx,
    latest_index: { time: "2026-06", value: latest },
  };
}

// Food-like: 115 at end-2020 → 183.885 at 2026-06 (+59.9% since 2020).
const FOOD = cat({
  rate: 5.2,
  idx: { 2020: 115, 2021: 120.175, 2024: 171.235, 2025: 178.48 },
  latest: 183.885,
  weight: 22,
});
// Transport-like: cheaper cumulative, higher weight, and a different base
// again — divisions do not share one, so nothing may assume they do.
const TRANSPORT = cat({
  rate: 1.4,
  idx: { 2020: 108, 2021: 111.348, 2024: 138.672, 2025: 140.4 },
  latest: 142.02,
  weight: 14,
});

// ---------------------------------------------------------------------------
// rateFor — the anchor contract (docs/math.md §"Invariants" #1)
// ---------------------------------------------------------------------------

test("rateFor(c,'y1') returns Eurostat's published rate VERBATIM, never derived", () => {
  // The y1 anchor must be the official RCH_A figure, not something we
  // recompute from the index — that is the whole provenance promise.
  assert.equal(rateFor(FOOD, "y1"), 5.2);
  assert.equal(rateFor(TRANSPORT, "y1"), 1.4);
});

test("rateFor(c, year) = latest_index / index_by_year[year] − 1, on ONE base", () => {
  // Since 2020: 183.885 / 115 − 1 = +59.9%.
  assert.ok(near(rateFor(FOOD, 2020), 59.9, 1e-9), rateFor(FOOD, 2020));
  // Since 2025: 183.885 / 178.48 − 1 = +3.0283%. A regression that dropped the
  // anchor lookup and divided by a literal 100 reports +83.9% here, and +83.9%
  // for every other anchor too.
  assert.ok(near(rateFor(FOOD, 2025), 100 * (183.885 / 178.48 - 1), 1e-9));
  assert.ok(
    Math.abs(rateFor(FOOD, 2025) - rateFor(FOOD, 2020)) > 50,
    "since-2025 and since-2020 must not collapse to the same number"
  );
});

test("rateFor accepts the anchor year as a number or a string key", () => {
  // index_by_year arrives from JSON with string keys; the UI passes numbers.
  assert.equal(rateFor(FOOD, 2021), rateFor(FOOD, "2021"));
});

test("a base mismatch between latest_index and index_by_year is detectable", () => {
  // Regression guard for the base-mismatch bug (docs/math.md #1). The way it
  // gets in is somebody scaling ONE of the two fields — most plausibly by
  // dividing index_by_year through so an anchor year reads a round 100, and
  // leaving latest_index as Eurostat published it. Here that turns FOOD's true
  // +59.9% into +83.9%, and nothing else on the page changes. The test pins
  // the size of the error so the invariant has teeth on the SPA side too, not
  // only in the pipeline.
  const broken = cat({ rate: 5.2, idx: { 2020: 100 }, latest: 183.885 });
  const wrong = rateFor(broken, 2020);
  assert.ok(wrong > 80, `expected an obviously wrong number, got ${wrong}`);
  assert.ok(
    Math.abs(wrong - 59.9) > 20,
    "a raw-base latest_index must NOT look like a plausible answer"
  );
});

test("latestIndexYear picks the highest year key, not the last inserted", () => {
  assert.equal(latestIndexYear({ 2024: 1, 2020: 2, 2025: 3 }), "2025");
});

// ---------------------------------------------------------------------------
// personalInflation / officialInflation
// ---------------------------------------------------------------------------

test("personalInflation is Σ(w·r)/Σw — normalised, so sliders need not sum to 100", () => {
  const cats = [FOOD, TRANSPORT];
  const got = personalInflation([50, 50], cats, "y1");
  assert.ok(near(got, (5.2 + 1.4) / 2), got);
  // Same shape, doubled weights → same answer (normalisation).
  assert.ok(near(personalInflation([100, 100], cats, "y1"), got));
});

test("personalInflation weights the categories the user actually spends on", () => {
  // All weight on transport → the transport rate, nothing from food.
  assert.ok(near(personalInflation([0, 100], [FOOD, TRANSPORT], "y1"), 1.4));
});

test("personalInflation returns the official fallback when Σw = 0", () => {
  // Every slider at zero must not divide by zero or render NaN.
  assert.equal(personalInflation([0, 0], [FOOD, TRANSPORT], "y1", 3.7), 3.7);
});

test("personalInflation honours the year anchor, not just y1", () => {
  const got = personalInflation([50, 50], [FOOD, TRANSPORT], 2020);
  assert.ok(near(got, (59.9 + 31.5) / 2, 1e-9), got);
});

test("officialInflation uses the published basket weights", () => {
  const cats = [FOOD, TRANSPORT];
  const expected = (22 * 5.2 + 14 * 1.4) / 36;
  assert.ok(near(officialInflation(cats, "y1"), expected), officialInflation(cats, "y1"));
});

test("officialCumulativeSince2020 is weight-averaged and base-consistent", () => {
  const expected = (22 * 59.9 + 14 * 31.5) / 36;
  const got = officialCumulativeSince2020([FOOD, TRANSPORT]);
  assert.ok(near(got, expected, 1e-9), `${got} vs ${expected}`);
});

test("officialCumulativeSince2020 returns 0 for an empty basket", () => {
  assert.equal(officialCumulativeSince2020([]), 0);
});

// ---------------------------------------------------------------------------
// Real wage — division, never subtraction
// ---------------------------------------------------------------------------

test("pocketReal divides: +12.7% raise at +5.2% inflation is +7.13% real, NOT +7.5%", () => {
  // The single most tempting wrong formula in the whole app. Subtraction
  // overstates every raise; at high inflation it overstates it a lot.
  const got = pocketReal(12.7, 5.2);
  assert.ok(near(got, 100 * (1.127 / 1.052 - 1), 1e-9), got);
  assert.ok(Math.abs(got - 7.5) > 0.3, `subtraction result leaked through: ${got}`);
});

test("pocketReal at high inflation diverges sharply from subtraction", () => {
  // 20% raise at 15% inflation: real = +4.35%, subtraction would say +5%.
  const got = pocketReal(20, 15);
  assert.ok(near(got, 100 * (1.2 / 1.15 - 1), 1e-9));
  assert.ok(got < 4.4 && got > 4.3, got);
});

test("pocketReal(π, π) is exactly zero — a raise that only stands still", () => {
  assert.ok(near(pocketReal(5.2, 5.2), 0, 1e-12));
});

test("pocketPerMonth inverts from today's pay, so it is never salary × p/100", () => {
  // The salary on screen is the ALREADY-RAISED one. €1,500 that is 7.13%
  // ahead bought €1,400.08 worth before, so the gain is €99.92 — the naive
  // €106.95 (1500 × 0.0713) overstates it by seven euro.
  const got = pocketPerMonth(1500, pocketReal(12.7, 5.2));
  assert.ok(near(got, 1500 - 1500 / (1 + pocketReal(12.7, 5.2) / 100), 1e-9), got);
  assert.ok(got > 99 && got < 100, got);
});

test("pocketPerMonth is signed, and zero when there is nothing to show", () => {
  // A loss has to come back negative: the row prints "buys less" off this
  // sign, and an absolute value here would label every loss a gain.
  assert.ok(pocketPerMonth(1500, -2) < 0);
  assert.equal(pocketPerMonth(1500, 0), 0);
  // No salary, no claim — not a division by zero and not NaN on screen.
  assert.equal(pocketPerMonth(0, 5), 0);
  assert.equal(pocketPerMonth(NaN, 5), 0);
  assert.equal(pocketPerMonth(1500, NaN), 0);
});

test("standStillNet undoes exactly what pocketPerMonth measured", () => {
  // The row states both: «€56 по-малко всеки месец» and then what it takes to
  // get those €56 back. Derived apart they disagree at the cent, and no screen
  // carrying the pair says which of the two is the other's error.
  for (const [pay, raise, pi] of [
    [1500, 3, 5.2],
    [2150, 9, 4.4],
    [800, 0, 12.0],
    [3000, 6, -1.5],
  ]) {
    const pocket = pocketReal(raise, pi);
    assert.ok(
      near(standStillNet(pay, pocket), pay / (1 + pocket / 100), 1e-9),
      `pay=${pay} raise=${raise} π=${pi}`
    );
    // And it lands back where the reader started: deflated by their own
    // prices, the stand-still pay buys what the pre-raise pay bought.
    assert.ok(near(standStillNet(pay, pocket) * (1 + pocket / 100), pay, 1e-9));
  }
});

test("standStillNet asks for more when the raise lost, and less when it won", () => {
  assert.ok(standStillNet(1500, -2) > 1500);
  assert.ok(standStillNet(1500, 2) < 1500);
  assert.equal(standStillNet(1500, 0), 1500);
  // Nothing usable in, nothing invented out: the pay is returned untouched
  // rather than scaled by a NaN, which would empty the sentence rendering it.
  assert.equal(standStillNet(1500, NaN), 1500);
  assert.equal(standStillNet(0, -5), 0);
});

// ---------------------------------------------------------------------------
// Money + bite
// ---------------------------------------------------------------------------

test("extraPerMonth converts inflation into euros at today's spend", () => {
  // What the same life costs extra: salary × π/(100+π), i.e. the increase
  // priced off the CURRENT (already inflated) spend, not the old one.
  assert.ok(near(extraPerMonth(2000, 5.2), 2000 * (5.2 / 105.2), 1e-9));
  assert.equal(extraPerMonth(0, 5.2), 0);
  assert.equal(extraPerMonth(2000, 0), 0);
});

// ---------------------------------------------------------------------------
// Percentile — position FROM THE BOTTOM
// ---------------------------------------------------------------------------

const NET_LADDER = [520, 700, 810, 900, 990, 1080, 1180, 1310, 1500, 1850, 3200];

test("percentile reads from the bottom: a low income is 1, not 99", () => {
  // The inverted framing once rendered a €300/mo income as "top 1%".
  assert.equal(percentile(300, NET_LADDER), 1);
  assert.equal(percentile(520, NET_LADDER), 1);
});

test("percentile clamps at the top rung and nowhere below it", () => {
  assert.equal(percentile(3200, NET_LADDER), 99);
  assert.equal(percentile(99999, NET_LADDER), 99);
  // The rung BELOW the top is where the clamp costs something. P90 to P99 is
  // nine points of the ladder spread over €1350 of net — the widest gap on the
  // whole thing — and a clamp reading from the P90 rung answers 99 across all
  // of it. «изпреварваш 99%» to a €1900 net is the answer this ladder exists to
  // stop giving, and one index is the whole distance between the two.
  assert.equal(percentile(1850, NET_LADDER), 90);
  assert.equal(percentile(2000, NET_LADDER), 91);
  assert.equal(percentile(2500, NET_LADDER), 94);
});

test("percentile is monotonic — more money never moves you down", () => {
  let prev = -1;
  for (let s = 300; s <= 4000; s += 25) {
    const p = percentile(s, NET_LADDER);
    assert.ok(p >= prev, `rank fell from ${prev} to ${p} at ${s}`);
    prev = p;
  }
});

test("percentile interpolates between cuts, and rounds to the nearest", () => {
  // Exactly the P50 rung → 50; midway between P50 and P60 → ~55.
  assert.equal(percentile(1080, NET_LADDER), 50);
  assert.equal(percentile(1130, NET_LADDER), 55);
  // Both of those land on whole numbers, where truncating and rounding agree.
  // €1128 interpolates to 54.8 and €1123 to 54.3, so the pair pins the nearest
  // from both sides. A point of the ladder is about €10 of net here and the
  // reader is shown the figure to the point, so an end taken instead of the
  // nearest is a rank that is off by one for half of them.
  assert.equal(percentile(1128, NET_LADDER), 55);
  assert.equal(percentile(1123, NET_LADDER), 54);
});

test("percentile returns 0 (renders as unknown) when the ladder is missing", () => {
  assert.equal(percentile(1000, []), 0);
  assert.equal(percentile(1000, undefined), 0);
});

// ---------------------------------------------------------------------------
// buildLadder — gross rungs converted to NET before comparing
// ---------------------------------------------------------------------------

/**
 * A salary_dist.json stand-in: rungs at "SES's own level", plus the mean the
 * browser divides by. Pass an anchor equal to `sesMean` and `composeLadder`
 * reproduces the rungs unchanged, which keeps these cases readable.
 */
function distOf(rungs, sesMean = 1000) {
  return { shape: { ses_mean: sesMean, ladder_ses: { ...rungs } } };
}

test("buildLadder converts every published GROSS rung to NET", () => {
  // The salary input is take-home; comparing it against gross rungs is the
  // unit mismatch that once pushed every Sofia salary into the top 1%.
  const dist = distOf({
    P1: 620.2,
    P10: 816.5,
    P20: 1000,
    P30: 1150,
    P40: 1300,
    P50: 1531,
    P60: 1700,
    P70: 1950,
    P80: 2300,
    P90: 3691.6,
    P99: 6000,
  });
  const ladder = buildLadder(dist, 1000);
  assert.equal(ladder.length, 11);
  assert.ok(near(ladder[0], bgNetSalary(620.2).net, 1e-9));
  assert.ok(ladder[10] < 6000, "top rung must be net, i.e. below its gross");
  assert.ok(
    ladder.every((v, i, a) => i === 0 || v > a[i - 1]),
    "net ladder must stay strictly increasing"
  );
});

test("no composed rung is below the statutory minimum wage", () => {
  // **A scalar re-level cannot follow a minimum wage that outran the mean.**
  // SES's 2022 vintage sits against a €363 minimum; the anchor is НСИ's newest
  // quarter and the minimum is €620 today — +71% against the mean's +48% — so
  // the bottom of the scaled shape lands under a wage it is not lawful to pay
  // a full-time employee. A rung there is an artefact of the model, and it is
  // the one part of the ladder a reader on the minimum wage would check first.
  //
  // Every rung, not just P1: which cuts fall under the floor depends on the
  // anchor and on how far the minimum has moved since the survey, and a floor
  // written for the cut that happened to need it last is one that stops
  // working the next time either moves.
  const under = { P1: 200, P10: 400, P20: 600 };
  const over = {
    P30: 700,
    P40: 900,
    P50: 1100,
    P60: 1300,
    P70: 1600,
    P80: 2000,
    P90: 2600,
    P99: 5000,
  };
  const dist = distOf({ ...under, ...over });
  // An anchor equal to `ses_mean` reproduces the rungs unscaled, so the three
  // in `under` sit below the €620.20 floor and the eight in `over` clear it.
  const gross = composeLadder(dist, 1000);
  for (const p of Object.keys(under)) {
    assert.equal(gross[p], BG_PAYROLL_DEFAULT.minWageGross, `${p} was published below it`);
  }
  for (const [p, v] of Object.entries(over)) {
    assert.equal(gross[p], v, `${p} was floored when it did not need to be`);
  }
  // **And the floor says which rungs it decided.** A floored rung is not the
  // survey's answer any more — the number is the minimum wage — so `/how/`'s
  // "surveyed or modelled" column has to be able to say neither of those about
  // it. Read off the SCALED rung rather than off the published one: a decile
  // that genuinely lands on the minimum wage WAS measured there, and the two
  // are the same figure on screen.
  assert.deepEqual(
    [...flooredCuts(dist, 1000)].sort((a, b) => a - b),
    [1, 10, 20],
    "the floor does not name the cuts it replaced"
  );
  assert.deepEqual([...flooredCuts(dist, 1000, { ...BG_PAYROLL_DEFAULT, minWageGross: 0 })], []);
  assert.deepEqual([...flooredCuts(null, 1000)], [], "an absent shape names floored cuts");
  // Weakly rising, and `percentile` has to stay safe on the flat run the floor
  // makes: an interpolation across two equal rungs divides by zero.
  const ladder = buildLadder(dist, 1000);
  assert.ok(
    ladder.every((v, i, a) => i === 0 || v >= a[i - 1]),
    "the floored ladder is not rising"
  );
  for (const salary of [0, 100, ladder[0] - 1, ladder[0], ladder[0] + 1, ladder[5]]) {
    const p = percentile(salary, ladder);
    assert.ok(Number.isFinite(p), `percentile(${salary}) is not a number on a floored ladder`);
    assert.ok(p >= 1 && p <= 99, `percentile(${salary}) left the 1..99 range`);
  }
});

test("buildLadder uses the payroll params it is given, not a frozen copy", () => {
  const dist = distOf(
    Object.fromEntries([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99].map((p) => [`P${p}`, 1000]))
  );
  const doubledTax = { ...BG_PAYROLL_DEFAULT, incomeTaxRate: 0.2 };
  assert.ok(buildLadder(dist, 1000, doubledTax)[0] < buildLadder(dist, 1000)[0]);
  // The tax rate reaches the ladder through `bgNetSalary` alone. The minimum
  // wage reaches it through `composeLadder`, which is a second hand-off and the
  // one that can be dropped on its own — and the published
  // `min_wage_gross_eur` is €620.20 today, the same figure as the offline
  // sentinel, so a ladder built off the sentinel is indistinguishable from a
  // correct one until the ЗБДОО moves it.
  const raisedFloor = { ...BG_PAYROLL_DEFAULT, minWageGross: 1500 };
  assert.equal(buildLadder(dist, 1000, raisedFloor)[0], bgNetSalary(1500, raisedFloor).net);
  assert.equal(buildLadder(dist, 1000)[0], bgNetSalary(1000).net);
});

test("the shape is re-levelled ONTO the anchor, not away from it", () => {
  // Two publishers meet in one number here: `ladder_ses` is Eurostat's shape at
  // Eurostat's own level, and the anchor is НСИ's newest national mean. The
  // whole join is one scalar, and the direction of its divide is the join.
  //
  // Inverted, an anchor ABOVE the survey's mean shrinks every rung instead of
  // lifting it — and nothing about the result looks wrong. The ladder still
  // rises, still floors at the minimum wage, still reads as eleven percentiles;
  // every salary measured against it simply lands too high. The fixtures
  // elsewhere in this file pass an anchor equal to `ses_mean` to keep their
  // rungs readable, which is precisely the one anchor at which the divide has
  // no direction to get wrong.
  const gross = composeLadder(distOf({ P1: 800, P50: 1000, P99: 4000 }, 1000), 1400);
  assert.equal(gross.P50, 1400, "the median rung is not at the anchor's own level");
  assert.equal(gross.P1, 1120);
  assert.equal(gross.P99, 5600);
});

test("buildLadder returns [] when either half of the ladder is missing", () => {
  // Two files have to load now, not one, so there are two ways to get nothing
  // and both have to be silent rather than NaN-shaped.
  assert.deepEqual(buildLadder(null, 1900), []);
  assert.deepEqual(buildLadder({}, 1900), []);
  assert.deepEqual(buildLadder(distOf({ P1: 100 }), 0), [], "no anchor yet");
  assert.deepEqual(buildLadder({ shape: { ladder_ses: { P1: 100 } } }, 1900), [], "no ses_mean");
});

// ---------------------------------------------------------------------------
// Rent
// ---------------------------------------------------------------------------

test("rentBurden is rent as a percentage of take-home", () => {
  assert.ok(near(rentBurden(600, 1500), 40));
  assert.equal(rentBurden(600, 0), 0);
});

test("rentDays maps the burden onto a 30-day month, clamped to [1,30]", () => {
  assert.equal(rentDays(600, 1500), 12);
  assert.equal(rentDays(3000, 1500), 30, "over-100% burden clamps at a full month");
  assert.equal(rentDays(1, 100000), 1, "a tiny rent still costs at least a day");
  assert.equal(rentDays(600, 0), 0);
});

// ---------------------------------------------------------------------------
// Mortgage math
// ---------------------------------------------------------------------------

test("annuityPayment matches the closed-form annuity for a real BG loan", () => {
  // €150k over 25y at 2.43% (the published ECB MIR new-business AAR).
  const m = 0.0243 / 12;
  const n = 300;
  const expected = (150000 * m) / (1 - Math.pow(1 + m, -n));
  assert.ok(near(annuityPayment(150000, 2.43, 25), expected, 1e-9));
  // Sanity band so a units slip (rate as a fraction, term in months) shows.
  assert.ok(expected > 600 && expected < 750, expected);
});

test("annuityPayment at 0% is simple division", () => {
  assert.ok(near(annuityPayment(120000, 0, 10), 1000));
});

test("annuityReverse is the exact inverse of annuityPayment", () => {
  for (const [loan, rate, term] of [
    [150000, 2.43, 25],
    [80000, 5.5, 15],
    [250000, 3.1, 30],
  ]) {
    const pay = annuityPayment(loan, rate, term);
    assert.ok(
      near(annuityReverse(pay, rate, term), loan, 1e-6),
      `reverse failed for ${loan}@${rate}%/${term}y`
    );
  }
});

test("annuityReverse degrades safely on empty input", () => {
  assert.equal(annuityReverse(0, 2.43, 25), 0);
  assert.equal(annuityReverse(-5, 2.43, 25), 0);
  assert.ok(near(annuityReverse(1000, 0, 10), 120000));
});

test("homeYears counts years of FULL pay, and is Infinity without a salary", () => {
  assert.ok(near(homeYears(240000, 2000), 10));
  assert.equal(homeYears(240000, 0), Infinity);
});

// ---------------------------------------------------------------------------
// Savings erosion
// ---------------------------------------------------------------------------

test("cashErosion deflates by the cumulative rate — division, not a percentage cut", () => {
  // €10k after +41.64% cumulative inflation is worth €7059 today, and the
  // "eaten" figure is the remainder. Subtracting 41.64% (€5836) would be
  // the wrong, scarier number.
  const r = cashErosion(10000, 41.64);
  assert.ok(near(r.valueToday, 10000 / 1.4164, 1e-9), r.valueToday);
  assert.ok(near(r.eaten, 10000 - 10000 / 1.4164, 1e-9));
  assert.ok(r.eaten < 3000, "must not be the naive 41.64% cut");
});

test("cashErosion at 0% inflation eats nothing", () => {
  const r = cashErosion(10000, 0);
  assert.equal(r.valueToday, 10000);
  assert.equal(r.eaten, 0);
});

// ---------------------------------------------------------------------------
// payrollParams — payroll.json is the source of truth, mirror.js the sentinel
// ---------------------------------------------------------------------------

test("payrollParams maps the published payroll.json into the math params", () => {
  const params = payrollParams({
    employee_contrib_rates: { total: 0.1378 },
    income_tax_rate: 0.1,
    max_insurable_income_eur: 2111.64,
    min_wage_gross_eur: 620.2,
  });
  // `rates` — the five per-fund lines the itemised payslip is built from —
  // joined this shape when the breakdown shipped. This payload carries only
  // the `total`, so the five lines fall back to the sentinel TOGETHER: a
  // per-field fallback would itemise some funds at the published rate and
  // others at last year's, and the rows would still sum to the total.
  //
  // The employer's five lines and the ТЗПБ span fall back the same way and for
  // the same reason, and this payload carries neither. A partial employer read
  // would render a labour-cost breakdown whose rows sum to less than the total
  // printed under them; a ТЗПБ `min` without its `max` would report a sector as
  // charged exactly its floor, which is a claim the act makes for no sector
  // spanning more than one rate.
  assert.deepEqual(params, {
    rates: BG_PAYROLL_DEFAULT.rates,
    totalEmployeeRate: 0.1378,
    employerRates: BG_PAYROLL_DEFAULT.employerRates,
    totalEmployerRate: BG_PAYROLL_DEFAULT.totalEmployerRate,
    workAccident: BG_PAYROLL_DEFAULT.workAccident,
    incomeTaxRate: 0.1,
    maxInsurable: 2111.64,
    minWageGross: 620.2,
  });
});

test("the employer's lines and the ТЗПБ span are read from the payload when it has them", () => {
  // The other direction of the same guard: the sentinel exists for first paint,
  // and a `payrollParams` that ignored the payload would keep computing last
  // year's employer cost for as long as nobody noticed.
  const params = payrollParams({
    employee_contrib_rates: { total: 0.1378 },
    employer_contrib_rates: {
      pension: 0.09,
      pension2: 0.03,
      sickness_maternity: 0.02,
      unemployment: 0.007,
      health: 0.05,
      total: 0.197,
    },
    work_accident: { min: 0.005, max: 0.009 },
    income_tax_rate: 0.1,
    max_insurable_income_eur: 2300,
    min_wage_gross_eur: 620.2,
  });
  assert.equal(params.totalEmployerRate, 0.197);
  assert.equal(params.employerRates.pension, 0.09);
  assert.deepEqual(params.workAccident, { min: 0.005, max: 0.009 });
});

test("half a ТЗПБ span falls back to the sentinel rather than to its own floor", () => {
  // A `min` that resolved beside a `max` that did not would render as a sector
  // charged exactly its lowest rate — the cheapest of the readings available,
  // presented as the only one.
  for (const wa of [{ min: 0.005 }, { max: 0.009 }, { min: 0.009, max: 0.005 }, {}]) {
    const params = payrollParams({ employee_contrib_rates: { total: 0.1378 }, work_accident: wa });
    assert.deepEqual(params.workAccident, BG_PAYROLL_DEFAULT.workAccident, JSON.stringify(wa));
  }
});

test("payrollParams uses the LIVE values, not the frozen sentinel", () => {
  // A BG law change must reach the SPA through payroll.json with no code
  // change. If this ever returned the sentinel, the app would silently
  // keep computing last year's net pay.
  const params = payrollParams({
    employee_contrib_rates: { total: 0.15 },
    income_tax_rate: 0.12,
    max_insurable_income_eur: 2300,
    min_wage_gross_eur: 700,
  });
  assert.equal(params.totalEmployeeRate, 0.15);
  assert.equal(params.maxInsurable, 2300);
  assert.ok(bgNetSalary(3000, params).net < bgNetSalary(3000).net);
});

test("payrollParams falls back per-field on a partial or absent payload", () => {
  assert.deepEqual(payrollParams(null), BG_PAYROLL_DEFAULT);
  assert.deepEqual(payrollParams(undefined), BG_PAYROLL_DEFAULT);
  const partial = payrollParams({ income_tax_rate: 0.12 });
  assert.equal(partial.incomeTaxRate, 0.12);
  assert.equal(partial.totalEmployeeRate, BG_PAYROLL_DEFAULT.totalEmployeeRate);
  assert.equal(partial.maxInsurable, BG_PAYROLL_DEFAULT.maxInsurable);
});

// ---------------------------------------------------------------------------
// Drill-down: divisionRate / officialSplit / contributions
// ---------------------------------------------------------------------------
//
// Shaped like the published `hicp_categories.json` entries: a division with
// `groups[]`, each group carrying its own rate, index and `weight_pct`.
//
// A group's `weight_pct` is its share of the WHOLE basket, so the three below
// sum to the division's 14.277 rather than to 100. `officialSplit` normalises
// against that sum, which is why it lands on the within-division shares
// (14.4 / 59.0 / 26.6 percent) without the payload having to carry them.

const CAR = {
  weight_pct: 14.277,
  annual_rate_pct: 11.0,
  index_by_year: { 2020: 112, 2024: 123.872, 2025: 126.56 },
  latest_index: { time: "2026-06", value: 137.536 },
  groups: [
    {
      // buying a vehicle — got cheaper
      weight_pct: 2.055888,
      annual_rate_pct: -0.4,
      index_by_year: { 2020: 112, 2024: 120.96, 2025: 121.408 },
      latest_index: { time: "2026-06", value: 120.96 },
    },
    {
      // running your car — the fuel line
      weight_pct: 8.42343,
      annual_rate_pct: 17.3,
      index_by_year: { 2020: 112, 2024: 125.44, 2025: 128.8 },
      latest_index: { time: "2026-06", value: 151.088 },
    },
    {
      // tickets & passenger transport
      weight_pct: 3.797682,
      annual_rate_pct: 0.3,
      index_by_year: { 2020: 112, 2024: 118.72, 2025: 118.944 },
      latest_index: { time: "2026-06", value: 119.28 },
    },
  ],
};

test("divisionRate uses the division's OWN rate until the user splits it", () => {
  // Load-bearing: expanding a division to look inside must not move the
  // user's number. Only editing a group does. Recombining the groups at the
  // official split gives a slightly different answer (HICP chain-links), so
  // "untouched" has to mean the published division rate, not a recombination.
  assert.equal(divisionRate(CAR, null, "y1"), 11.0);
  assert.equal(divisionRate(CAR, undefined, "y1"), 11.0);
  const official = officialSplit(CAR, 100);
  assert.ok(
    Math.abs(divisionRate(CAR, official, "y1") - 11.0) > 0.05,
    "recombining groups is NOT the same number — which is why untouched uses the division rate"
  );
});

test("divisionRate follows a hand-made split", () => {
  // A non-driver: all of their transport money goes on tickets (+0.3%), so
  // their transport inflation is 0.3%, not the 11.0% national average.
  assert.ok(near(divisionRate(CAR, [0, 0, 5], "y1"), 0.3, 1e-9));
  // Someone who only fuels a car sits at the +17.3% end.
  assert.ok(near(divisionRate(CAR, [0, 10, 0], "y1"), 17.3, 1e-9));
  // A 50/50 between the two is the plain average of the two rates.
  assert.ok(near(divisionRate(CAR, [0, 5, 5], "y1"), (17.3 + 0.3) / 2, 1e-9));
});

test("divisionRate honours the year anchor for groups, not just for divisions", () => {
  // Since 2024, fuel is 134.9/112 − 1 = +20.4% while tickets are +0.47%.
  const fuelOnly = divisionRate(CAR, [0, 1, 0], 2024);
  assert.ok(near(fuelOnly, 100 * (134.9 / 112.0 - 1), 1e-9));
});

test("divisionRate falls back to the division when a split is all zeros", () => {
  // An all-zero split has no information in it; using it would divide by zero.
  assert.equal(divisionRate(CAR, [0, 0, 0], "y1"), 11.0);
  assert.equal(divisionRate({ ...CAR, groups: [] }, [1, 2], "y1"), 11.0);
});

test("officialSplit distributes a division's amount by Eurostat's own shares", () => {
  const s = officialSplit(CAR, 100);
  assert.equal(s.length, 3);
  // The published invariant the normalisation leans on: a division's groups
  // carry whole-basket weights that sum to the division's own.
  assert.ok(
    near(
      CAR.groups.reduce((a, g) => a + g.weight_pct, 0),
      CAR.weight_pct,
      1e-9
    ),
    "the groups' basket shares must sum to the division's"
  );
  assert.ok(
    near(
      s.reduce((a, b) => a + b, 0),
      100,
      1e-9
    ),
    "the split must conserve the total"
  );
  assert.ok(near(s[1], 59.0, 1e-9), "running your car is 59% of BG's transport basket");
  // Scaling the total scales every share proportionally.
  assert.ok(near(officialSplit(CAR, 200)[1], 118.0, 1e-9));
});

test("contributions decompose personal inflation EXACTLY", () => {
  // The claim the UI makes in words — "they add up to exactly your number" —
  // must be true to floating-point precision, or the ranked view is a lie.
  const divisions = [FOOD, TRANSPORT, CAR];
  const amounts = [40, 25, 35];
  const splits = [null, null, [0, 0, 35]]; // a non-driver's transport
  const pi = personalInflationDetailed(amounts, divisions, splits, "y1", 0);
  const rows = contributions({ divisions, amounts, splits, anchor: "y1", spendable: 1500 });
  const summed = rows.reduce((s, r) => s + r.contributionPp, 0);
  assert.ok(near(summed, pi, 1e-9), `Σ contributions ${summed} !== π ${pi}`);
});

test("contributions rank by euro-weighted impact, not by headline rate", () => {
  // CAR has the highest rate but a small share here; FOOD's share carries it.
  //
  // Handed in an order the answer disagrees with: CAR contributes 0.55 points
  // here, TRANSPORT 0.28 and FOOD 3.90, so the ranking is neither the order
  // they arrived in nor its reverse. `view/results.js#rankedSplit` takes the
  // first eight rows of this list and sums the remainder into one line, so a
  // list that came back in the order it went in draws the wrong groups and
  // sweeps the biggest one into «останалите» — with every number in it right.
  const rows = contributions({
    divisions: [CAR, TRANSPORT, FOOD],
    amounts: [5, 20, 75],
    anchor: "y1",
    spendable: 2000,
  });
  assert.deepEqual(
    rows.map((r) => r.division),
    [FOOD, CAR, TRANSPORT],
    "the big share outranks the big rate"
  );
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(
      rows[i - 1].contributionPp > rows[i].contributionPp,
      `row ${i} contributes ${rows[i].contributionPp} above ${rows[i - 1].contributionPp}`
    );
  }
});

test("contributions price each row off its own spend, not a share of a total", () => {
  // "you spend €X on this, it rose r%, that costs you €X·r/(100+r) more" —
  // the same goods cost X/(1+r) a year ago.
  const rows = contributions({
    divisions: [FOOD],
    amounts: [100],
    anchor: "y1",
    spendable: 1000,
  });
  assert.ok(near(rows[0].spendEur, 1000, 1e-9));
  assert.ok(near(rows[0].eurPerMonth, (1000 * 5.2) / 105.2, 1e-9));
});

test("contributions go NEGATIVE for a group whose prices fell", () => {
  // A deflating group must pull the user's number down, and the sign has to
  // survive into the row so the UI can say "pulling your number down".
  const cheaper = { ...FOOD, annual_rate_pct: -3.0 };
  const rows = contributions({
    divisions: [TRANSPORT, cheaper],
    amounts: [50, 50],
    anchor: "y1",
    spendable: 1000,
  });
  const falling = rows.find((r) => r.division === cheaper);
  assert.ok(falling.contributionPp < 0);
  assert.ok(falling.eurPerMonth < 0);
});

test("contributions and personalInflationDetailed degrade on an empty basket", () => {
  assert.deepEqual(contributions({ divisions: [FOOD], amounts: [0], anchor: "y1" }), []);
  assert.equal(personalInflationDetailed([0, 0], [FOOD, TRANSPORT], [null, null], "y1", 4.2), 4.2);
});

test("personalInflationDetailed equals personalInflation when nothing is split", () => {
  // The detailed mode is an extension of the simple one, not a second
  // calculator: a user who never opens a division must see the same number.
  const divisions = [FOOD, TRANSPORT, CAR];
  const amounts = [40, 25, 35];
  assert.ok(
    near(
      personalInflationDetailed(amounts, divisions, [null, null, null], "y1", 0),
      personalInflation(amounts, divisions, "y1", 0),
      1e-12
    )
  );
});

test("personalInflationDetailed ignores negative amounts rather than crediting them", () => {
  // A negative spend is meaningless; treating it as a negative weight would
  // let a stray minus sign invert someone's whole basket.
  const a = personalInflationDetailed([50, 50], [FOOD, TRANSPORT], [null, null], "y1", 0);
  const b = personalInflationDetailed(
    [50, 50, -20],
    [FOOD, TRANSPORT, CAR],
    [null, null, null],
    "y1",
    0
  );
  assert.ok(near(a, b, 1e-12));
});

// ---------------------------------------------------------------------------
// THE TAX WEDGE — the tax wedge
//
// The figure is only interesting if it is exactly right: the whole claim is
// that the marginal rate FALLS at the insurance ceiling. A sign slip, an
// off-by-one at the boundary, or an effective rate computed on a capped tax
// base would each produce a plausible curve saying the opposite.
// ---------------------------------------------------------------------------

test("the marginal rate is 22.40% below the cap and 10.00% above it", () => {
  const p = BG_PAYROLL_DEFAULT;
  // 13.78% insurance, then 10% tax on the remaining 86.22% → 22.402%, which
  // displays as 22.40% and must not be asserted as 22.40 (see §3.1: a rounded
  // constant in a test is a tolerance nobody chose).
  assert.ok(near(bgMarginalRatePct(1000, p), 22.402, 1e-9));
  assert.ok(near(bgMarginalRatePct(p.maxInsurable - 0.01, p), 22.402, 1e-9));
  // Above the ceiling the next euro carries income tax only.
  assert.ok(near(bgMarginalRatePct(p.maxInsurable + 0.01, p), 10, 1e-12));
  assert.ok(near(bgMarginalRatePct(9000, p), 10, 1e-12));
  // AT the cap the next euro is already outside the insurance base, so the
  // boundary belongs to the upper branch. If this flips, the curve claims one
  // extra euro of insurance that is not owed.
  assert.ok(near(bgMarginalRatePct(p.maxInsurable, p), 10, 1e-12));
});

test("the marginal rate FALLS at the ceiling — the whole point of the figure", () => {
  const p = BG_PAYROLL_DEFAULT;
  assert.ok(
    bgMarginalRatePct(p.maxInsurable - 1, p) > bgMarginalRatePct(p.maxInsurable + 1, p),
    "the marginal rate no longer drops at the insurance cap, so the panel's " +
      "central claim is false"
  );
});

test("the marginal rate follows the PUBLISHED cap, not a hardcoded one", () => {
  // The kink sits wherever payroll.json puts it, so the assertion probes ONE
  // gross against two ceilings either side of it rather than against whichever
  // ceiling is in force. Written the other way — one probe, the live default,
  // and a hypothetical — it stops testing anything the day the law catches up
  // with the hypothetical and the two coincide.
  const probe = 2200;
  const below = { ...BG_PAYROLL_DEFAULT, maxInsurable: probe + 300 };
  const above = { ...BG_PAYROLL_DEFAULT, maxInsurable: probe - 200 };
  assert.ok(near(bgMarginalRatePct(probe, below), 22.402, 1e-9));
  assert.ok(near(bgMarginalRatePct(probe, above), 10, 1e-12));
});

test("the effective rate peaks exactly at the cap and declines after it", () => {
  const w = bgTaxWedge();
  const cap = BG_PAYROLL_DEFAULT.maxInsurable;
  assert.ok(near(w.capGross, cap, 1e-12));
  assert.ok(near(w.peakEffectivePct, 22.402, 1e-9), `peak was ${w.peakEffectivePct}`);
  // The curve is a PLATEAU up to the cap and falls after it, so the cap is the
  // LAST point at the maximum, not the only one. (An earlier version of this
  // test asserted the first maximum and failed at €700 — the plateau is real
  // and the assertion was wrong, not the code.)
  const peak = Math.max(...w.points.map((pt) => pt.effectivePct));
  assert.ok(near(peak, w.peakEffectivePct, 1e-9), `sampled peak ${peak} != stated`);
  const lastAtPeak = w.points.filter((pt) => near(pt.effectivePct, peak, 1e-9)).at(-1);
  assert.ok(
    near(lastAtPeak.gross, cap, 1e-9),
    `the plateau ends at ${lastAtPeak.gross}, not at the cap ${cap}`
  );
  // And it is monotonically falling afterwards — if it rose, "the burden goes
  // DOWN as you earn more" would be backwards.
  const above = w.points.filter((pt) => pt.gross > cap);
  for (let i = 1; i < above.length; i += 1) {
    assert.ok(
      above[i].effectivePct < above[i - 1].effectivePct,
      `effective rate rose from ${above[i - 1].gross} to ${above[i].gross}`
    );
  }
});

test("the cap is always a sample point, whatever the step size", () => {
  // A sampler that steps over the only kink draws a straight line, which is a
  // wrong picture rather than a coarse one.
  for (const steps of [3, 7, 60, 61]) {
    const w = bgTaxWedge({ steps });
    assert.ok(
      w.points.some((pt) => near(pt.gross, w.capGross, 1e-9)),
      `steps=${steps} skipped the cap`
    );
  }
});

test("the stated figures are computed, not read off the sample", () => {
  // Coarsening the sample must not move a number the panel says in words.
  const fine = bgTaxWedge({ steps: 200 });
  const coarse = bgTaxWedge({ steps: 4 });
  for (const k of ["capGross", "peakEffectivePct", "marginalBelowPct", "marginalAbovePct"]) {
    assert.ok(near(fine[k], coarse[k], 1e-12), `${k} moved with the sampling`);
  }
});

test("a scheduled cap rise is priced from the two caps, or is null", () => {
  // `payroll.json` carries no scheduled change today — the ЗБДОО 2026 rise is
  // in force and the list is empty — so the rise here is a hypothetical, taken
  // relative to whatever ceiling is live. That is the point: the panel has to
  // price the NEXT one correctly without this test being edited for it.
  const cap = BG_PAYROLL_DEFAULT.maxInsurable;
  const nextCap = cap + 200;
  const w = bgTaxWedge({ nextCap });
  assert.ok(near(w.capRisePerMonth, (nextCap - cap) * 0.1378, 1e-9));
  assert.ok(near(w.capRisePerMonth, 27.56, 1e-3), w.capRisePerMonth);
  // No scheduled change, or one that is not a rise, prices nothing rather than
  // rendering a negative "coming cost".
  assert.equal(bgTaxWedge().capRisePerMonth, null);
  assert.equal(bgTaxWedge({ nextCap: cap - 100 }).capRisePerMonth, null);
  assert.equal(bgTaxWedge({ nextCap: null }).capRisePerMonth, null);
});

test("the effective rate agrees with bgNetSalary at every sampled point", () => {
  // The curve and the payslip must never disagree: they are the same money.
  for (const pt of bgTaxWedge().points) {
    const s = bgNetSalary(pt.gross);
    assert.ok(near(pt.effectivePct, (100 * (pt.gross - s.net)) / pt.gross, 1e-9));
  }
});

test("below the cap the effective and marginal rates are the SAME number", () => {
  // The copy states this identity in words ("and exactly the same share of
  // your next euro"), so it has to be an identity rather than a coincidence:
  // for gross <= cap, insurance scales with gross, so
  //   effective = (gR + (g − gR)·Rtax) / g = R + Rtax(1 − R) = marginal.
  // If it ever stopped holding, the sentence would be false while every
  // number on screen stayed plausible.
  // STRICTLY below: at the cap itself the next euro is already outside the
  // insurance base, which is the boundary convention asserted above — and it
  // matches `taxWedgePanel`'s `overCap: gross >= cap`, so the sentence and the
  // branch that shows it agree.
  for (const pt of bgTaxWedge().points) {
    if (pt.gross >= BG_PAYROLL_DEFAULT.maxInsurable) continue;
    assert.ok(
      near(pt.effectivePct, pt.marginalPct, 1e-9),
      `at ${pt.gross}: effective ${pt.effectivePct} != marginal ${pt.marginalPct}`
    );
  }
});

// ---------------------------------------------------------------------------
// THE HOUSEHOLD — the insurance ceiling is per contract, not per family
// ---------------------------------------------------------------------------

test("householdNet adds the earners and ignores the ones nobody described", () => {
  assert.equal(householdNet([900]), 900);
  assert.equal(householdNet([900, 750]), 1650);
  // A second field that has been added but not filled in arrives as one of
  // these. Counting it as anything at all — including NaN, which would blank
  // every figure on the page — is the failure this drops.
  for (const blank of [null, undefined, NaN, "", 0, -100]) {
    assert.equal(householdNet([900, blank]), 900, String(blank));
  }
  assert.equal(householdNet([]), 0);
  assert.equal(householdNet(undefined), 0);
});

test("a household's gross is the sum of its contracts, NOT one salary inverted", () => {
  // THE DEFECT THIS FILE EXISTS TO HOLD SHUT. Two people at €2000 gross are
  // both under the €2300 ceiling and pay 13.78% on every euro. Add their nets
  // first and invert once, and one ceiling is applied to two people.
  const params = BG_PAYROLL_DEFAULT;
  const each = bgNetSalary(2000, params).net;
  assert.ok(each * 2 > params.maxInsurable, "test premise: the pair clears the ceiling together");
  assert.ok(2000 < params.maxInsurable, "test premise: neither of them clears it alone");

  const household = bgHouseholdPayroll([each, each], params);
  assert.ok(
    near(household.gross, 4000, 0.02),
    `two €2000 contracts came to ${household.gross} gross, not 4000`
  );

  // And the wrong answer is a real, plausible number rather than a crash —
  // which is why the assertion above is not enough on its own. Anyone who
  // "simplifies" this to a single inversion gets this figure, and nothing else
  // on the page would look wrong.
  const asOneSalary = bgGrossFromNet(each * 2, params);
  assert.ok(
    asOneSalary < 3800,
    `inverting the combined net gave ${asOneSalary}, which is no longer the ` +
      "wrong answer this test is guarding against"
  );
  assert.ok(household.gross - asOneSalary > 200, "the gap the household treatment recovers");
});

test("the household column balances to the cent, like each column in it", () => {
  // A breakdown whose rows do not add up to its own total teaches the reader
  // to distrust the total. That holds for the household's column too, and it
  // holds only because the totals are sums of already-rounded cent figures
  // rather than a second rounding of full-precision ones.
  for (const nets of [[900], [900, 750], [2100, 640, 1500], [3000, 3000]]) {
    const h = bgHouseholdPayroll(nets, BG_PAYROLL_DEFAULT);
    assert.ok(
      near(h.gross - h.totalDeductions, h.net, 1e-9),
      `${nets}: ${h.gross} − ${h.totalDeductions} ≠ ${h.net}`
    );
    assert.ok(near(h.insurance + h.tax, h.totalDeductions, 1e-9), String(nets));
    assert.ok(near(h.net, householdNet(nets), 0.02), `${nets}: the net is not what was typed`);
    assert.equal(h.earners.length, nets.length);
  }
});

test("each earner in a household keeps their own ceiling", () => {
  const params = BG_PAYROLL_DEFAULT;
  const over = bgNetSalary(params.maxInsurable + 800, params).net;
  const under = bgNetSalary(1200, params).net;
  const h = bgHouseholdPayroll([over, under], params);
  assert.equal(h.earners[0].insuranceCapped, true, "the high earner was not capped");
  assert.equal(h.earners[1].insuranceCapped, false, "the low earner was capped by their partner");
  assert.equal(h.anyCapped, true);
  // Each earner's own breakdown is the one they would get on their own.
  assert.deepEqual(h.earners[1].lines, bgPayslipFromNet(under, params).lines);
});

test("the household's effective rate is weighted by pay, not one vote each", () => {
  const params = BG_PAYROLL_DEFAULT;
  const big = bgNetSalary(3000, params).net;
  const small = bgNetSalary(700, params).net;
  const h = bgHouseholdPayroll([big, small], params);

  const mean = (h.earners[0].effectiveRatePct + h.earners[1].effectiveRatePct) / 2;
  assert.ok(
    near(h.effectiveRatePct, (100 * h.totalDeductions) / h.gross, 1e-9),
    "the household rate is not its own deductions over its own gross"
  );
  assert.ok(
    Math.abs(h.effectiveRatePct - mean) > 0.1,
    `the pay-weighted rate (${h.effectiveRatePct.toFixed(3)}) and the plain ` +
      `average of the two (${mean.toFixed(3)}) are too close for this test to ` +
      "tell them apart — pick a more unequal pair"
  );
});

test("earners carry the index they were typed at, blanks and all", () => {
  // The card draws one row per income and has to say WHICH income a column
  // belongs to. Re-deriving that from the position in a filtered list
  // mislabels every earner after a blank one.
  const h = bgHouseholdPayroll([null, 1200, 0, 800], BG_PAYROLL_DEFAULT);
  assert.deepEqual(
    h.earners.map((e) => e.index),
    [1, 3]
  );
});

test("a household of nobody computes nothing rather than dividing by zero", () => {
  for (const nets of [[], [0], [null, NaN], undefined]) {
    const h = bgHouseholdPayroll(nets, BG_PAYROLL_DEFAULT);
    assert.deepEqual(h.earners, [], String(nets));
    assert.equal(h.gross, 0);
    assert.equal(h.effectiveRatePct, 0, "a rate was reported for a household with no pay");
    assert.equal(h.anyCapped, false);
  }
});

// ---------------------------------------------------------------------------
// THE HOUSEHOLD'S RAISE — weighted by what they were paid BEFORE
// ---------------------------------------------------------------------------

test("one earner's household raise is exactly the raise they typed", () => {
  // The single-earner case is what this page has always shown, and it must not
  // move by a rounding hair now that it goes through a weighted formula.
  for (const r of [0, 3.5, 12.7, -4]) {
    const got = householdNetRaisePct({ basis: "net", amounts: [1800], raises: [r] });
    assert.ok(near(got, r, 1e-9), `${r} came back as ${got}`);
  }
});

test("a household's raise is weighted by the earlier pay, not by today's", () => {
  // Two earners on €1,000 today, one of whom got +20% and one nothing: the
  // household went from €1,833.33 to €2,000, a rise of 9.09%. The straight
  // average of the two rates says 10%, and it is wrong in the flattering
  // direction — the earner who got the rise is the one whose CURRENT pay is
  // inflated by it, so weighting by today over-counts them.
  const got = householdNetRaisePct({ basis: "net", amounts: [1000, 1000], raises: [20, 0] });
  assert.ok(near(got, 100 * (2000 / (1000 / 1.2 + 1000) - 1), 1e-9), got);
  assert.ok(got < 10, `the household's raise came back as ${got.toFixed(4)}%, the plain average`);
  assert.ok(near(got, 9.0909, 1e-3), got);
});

test("a gross raise above the ceiling is worth more than it says in the pocket", () => {
  // Contributions stop at the ceiling but pay does not, so a 10% rise on a
  // contract that clears it lifts take-home by MORE than 10%. Converting the
  // before and after separately is the only way that stays true; applying the
  // gross percentage to the net would understate the gain.
  const params = BG_PAYROLL_DEFAULT;
  const grossNow = 3300;
  const r = 10;
  assert.ok(grossNow / 1.1 > params.maxInsurable, "test premise: both ends clear the ceiling");
  const got = householdNetRaisePct({ basis: "gross", amounts: [grossNow], raises: [r] }, params);
  const expected =
    100 * (bgNetSalary(grossNow, params).net / bgNetSalary(grossNow / 1.1, params).net - 1);
  assert.ok(near(got, expected, 1e-9), `${got} vs ${expected}`);
  assert.ok(got > r + 1, `a gross rise of ${r}% came back as ${got.toFixed(2)}% of take-home`);
});

test("a household with an unanswered raise says nothing at all", () => {
  // P7: a blank read as 0% is an invented number, and it drags the household's
  // figure down. The row that renders this names the missing income instead.
  for (const raises of [
    [10, NaN],
    [NaN, 10],
    [10, null],
    [10, undefined],
    [10, -100],
  ]) {
    assert.ok(
      Number.isNaN(householdNetRaisePct({ basis: "net", amounts: [1000, 1000], raises })),
      String(raises)
    );
  }
  // An earner with no PAY is not owed a raise — they are not in the household
  // yet, and an empty second field must not silence the first one's answer.
  assert.ok(
    near(householdNetRaisePct({ basis: "net", amounts: [1000, null], raises: [10, NaN] }), 10, 1e-9)
  );
  assert.ok(Number.isNaN(householdNetRaisePct({ basis: "net", amounts: [], raises: [] })));
});

test("a household payslip can be read from the gross side without a round trip", () => {
  // In gross mode the reader typed the contract amount, so it must appear in
  // the breakdown unchanged. Going gross → net → gross to reuse one code path
  // lands a cent away on the one line they can check against their contract.
  const h = bgHouseholdPayroll([2000, 1350], BG_PAYROLL_DEFAULT, "gross");
  assert.ok(near(h.gross, 3350, 1e-9), `the typed grosses came back as ${h.gross}`);
  assert.ok(near(h.gross - h.totalDeductions, h.net, 1e-9), "the column stopped balancing");
  // And each earner is still taxed on their own contract.
  assert.deepEqual(
    h.earners.map((e) => e.gross),
    [2000, 1350]
  );
});

// ---------------------------------------------------------------------------
// wageGap and meanRungPosition — the two the sector card is built on
// ---------------------------------------------------------------------------

test("wageGap reports an unsigned magnitude beside a direction", () => {
  // The direction word carries the sign. Emitting both produced «-39% под»,
  // which reads as 39% LESS FAR below — one implementation so the Sofia
  // comparator and the sector line cannot drift apart on this.
  assert.deepEqual(wageGap(1400, 1000), { diffPct: 40, magnitudePct: 40, direction: "above" });
  assert.deepEqual(wageGap(600, 1000), { diffPct: -40, magnitudePct: 40, direction: "below" });

  // The dead band is ±1 point, so a euro either way is "about the same".
  assert.equal(wageGap(1005, 1000).direction, "equal");
  assert.equal(wageGap(995, 1000).direction, "equal");
  assert.equal(wageGap(1020, 1000).direction, "above");

  for (const bad of [
    [0, 1000],
    [1000, 0],
    [NaN, 1000],
    [1000, NaN],
    [-5, 1000],
  ]) {
    assert.equal(wageGap(bad[0], bad[1]), null, `wageGap(${bad}) should be unusable`);
  }
});

test("meanRungPosition says where an average sits, and takes no anchor", () => {
  // **The number that stops the sector card reading as a rank.** НСИ publish an
  // average by activity and nobody publishes a distribution by one, so a reader
  // told "18% below your sector's average" needs to know an average is not a
  // middle. On a right-skewed wage distribution it is about two-thirds up.
  const dist = distOf(
    {
      P1: 225,
      P10: 376,
      P20: 466,
      P30: 545,
      P40: 622,
      P50: 705,
      P60: 839,
      P70: 1010,
      P80: 1256,
      P90: 1700,
      P99: 3484,
    },
    949
  );
  const at = meanRungPosition(dist);
  assert.equal(at.cut, 66, "the mean no longer lands where the published shape puts it");
  assert.equal(at.medianPct, 74);

  // **The two figures the ratio divides come back unchanged, and which is which
  // matters.** Eurostat print a mean and a median for BG; the division between
  // them is ours, so the card names both published inputs and attributes the
  // step. Transposed, it renders «Евростат публикуват средна 705 € и медиана
  // 949 €» — a mean below the median, asserted in Eurostat's name, while every
  // other assertion here stays green because `cut` and `medianPct` do not move.
  assert.equal(at.mean, 949, "the published mean is not the one the card credits to Eurostat");
  assert.equal(at.median, 705, "the published median is not the one the card credits to Eurostat");
  assert.ok(at.mean > at.median, "a mean below the median inverts the claim the card rests on");

  // **The skew, as a flag the card can gate on.** The caveat states it in words
  // and shows no level, so nothing on screen evidences it and this is the whole
  // of the evidence. It has to follow the published pair rather than a constant:
  // fed a shape whose median sits above its mean, the sentence «повече от
  // половината заети изкарват под средната» is false and must not render.
  assert.equal(at.meanAboveMedian, true);
  assert.equal(
    meanRungPosition(distOf({ ...dist.shape.ladder_ses, P50: 1200 }, 949)).meanAboveMedian,
    false,
    "a median above the mean still reports the skew the caveat asserts"
  );
  assert.equal(
    at.medianPct,
    Math.round((100 * at.median) / at.mean),
    "the ratio on screen is not the division of the two figures shown beside it"
  );

  // The survey vintage is echoed from the payload, never chosen here. A
  // percentile dated to a year Eurostat did not survey cannot be checked
  // against anything, and P3 makes the as_of part of the derived figure.
  assert.equal(meanRungPosition({ shape: { ...dist.shape, ref_year: "2022" } }).shapeYear, "2022");

  // **Exactly scale-invariant**, which is what makes it a statement about the
  // shape of Bulgarian earnings rather than about whichever average is on
  // screen. Re-levelling multiplies every rung and the mean by one factor.
  for (const f of [0.5, 1.7, 3.35]) {
    const scaled = distOf(
      Object.fromEntries(Object.entries(dist.shape.ladder_ses).map(([k, v]) => [k, v * f])),
      949 * f
    );
    assert.equal(
      meanRungPosition(scaled).cut,
      at.cut,
      `the position moved when re-levelled by ${f}`
    );
    assert.equal(meanRungPosition(scaled).medianPct, at.medianPct);
  }

  // **It accepts no anchor, and that is the guard.** Handed a sector average it
  // would return a sector percentile — the one figure this feature exists to
  // say nobody publishes for Bulgaria. There is no parameter to try it through.
  assert.equal(
    meanRungPosition.length,
    1,
    "meanRungPosition grew a second required parameter — if it is a level, this returns a sector percentile"
  );
  // Its optional argument is a caption and can move no figure, so handing it a
  // sector average — the obvious way to reach for a sector rank — changes
  // nothing. `cut` and `medianPct` come from the distribution or from nowhere.
  const withSectorAvg = meanRungPosition(dist, 3176);
  assert.equal(withSectorAvg.cut, at.cut, "a second argument moved the rung position");
  assert.equal(withSectorAvg.medianPct, at.medianPct);

  assert.equal(meanRungPosition(distOf({ P50: 1 }, 949)), null);
  assert.equal(meanRungPosition(null), null);
});

// ---------------------------------------------------------------------------
// The property market — the five formulas behind `/market/`
// ---------------------------------------------------------------------------
//
// None of these takes a reader's figure, so none of them is reachable from the
// calculator's suites, and the page that renders them draws every one inside an
// `{#if …}`: a formula that starts returning null takes its card off the page
// rather than showing a wrong number. That is the right failure and it is also
// an invisible one, which is what these cases are for.

test("changePct is null where a side is missing, and 0 only where nothing moved", () => {
  // The distinction the page depends on. `/market/` sits at the edge of two
  // series published over different windows — the value cube starts two years
  // before the count cube, НСИ's city sales table starts seven years after
  // their city price table — so "the year-ago quarter is not in this series"
  // is the ordinary case, not the exceptional one. Coalesced to 0 it renders
  // as «0,0%», a market that did not move.
  assert.equal(changePct(16227, 18000), (-1773 / 18000) * 100);
  assert.equal(changePct(18000, 18000), 0);
  for (const [now, before] of [
    [16227, null],
    [null, 18000],
    [16227, undefined],
    [16227, 0],
    [NaN, 18000],
  ]) {
    assert.equal(changePct(now, before), null, `changePct(${now}, ${before}) is not null`);
  }
  // A fall is negative and a rise is positive, in that order. An inverted
  // subtraction keeps every magnitude and reverses the page's whole reading of
  // the market.
  assert.ok(changePct(10, 20) < 0);
  assert.ok(changePct(20, 10) > 0);
});

test("quarterYearAgo names the same quarter one year back, or nothing", () => {
  // Label arithmetic rather than an index into the series, so a gap cannot
  // shift the comparison onto a neighbouring quarter — the year-ago period is
  // either in the data under this exact key or the caller renders no figure.
  assert.equal(quarterYearAgo("2026-Q1"), "2025-Q1");
  assert.equal(quarterYearAgo("2020-Q4"), "2019-Q4");
  // The quarter is carried across, never reset or decremented: "2026-Q1" →
  // "2025-Q4" would be the previous quarter wearing a year-on-year label, and
  // on a seasonal series that is the exact comparison this exists to refuse.
  for (const q of [1, 2, 3, 4]) assert.equal(quarterYearAgo(`2026-Q${q}`), `2025-Q${q}`);
  for (const bad of ["2026", "2026-Q5", "2026-M01", "26-Q1", "", null, undefined]) {
    assert.equal(quarterYearAgo(bad), null, `quarterYearAgo(${bad}) invented a period`);
  }
});

test("dealsAtQuarter compares a quarter with the SAME quarter a year earlier", () => {
  // Transactions have a strong seasonal shape, so quarter-on-quarter measures
  // the calendar. The fixture makes the two answers disagree in SIGN: against
  // 2025-Q1 the count is up, against the quarter before it the count is down,
  // so a regression to the neighbouring key cannot pass by arithmetic luck.
  const series = {
    "2025-Q1": { total: 15000 },
    "2025-Q4": { total: 20000 },
    "2026-Q1": { total: 16227 },
  };
  const at = dealsAtQuarter(series, "2026-Q1");
  assert.equal(at.count, 16227);
  assert.equal(at.yearAgo, 15000);
  assert.ok(at.changePct > 0, `year-on-year should be a rise here, got ${at.changePct}`);
  assert.equal(at.changePct, ((16227 - 15000) / 15000) * 100);

  // The first quarter of a series has no year-ago reading, and the count is
  // still published. A change of null takes one card off the page; a count of
  // null would take the section.
  const first = dealsAtQuarter(series, "2025-Q1");
  assert.equal(first.count, 15000);
  assert.equal(first.changePct, null);
  assert.deepEqual(dealsAtQuarter(series, "2019-Q1"), {
    count: null,
    yearAgo: null,
    changePct: null,
  });
  assert.deepEqual(dealsAtQuarter(null, "2026-Q1"), {
    count: null,
    yearAgo: null,
    changePct: null,
  });
});

test("yearOnYearChanges reads the label back a year, never four places back", () => {
  // The same comparison `dealsAtQuarter` makes, over a whole record — which is
  // what lets a page say whether one quarter's fall is an ordinary one. The
  // failure it has to be safe against is a series with a gap: counted by
  // position, four keys back is the same quarter a year earlier only while
  // nothing is missing, and a series that skips one quarter silently starts
  // comparing a winter against an autumn and printing the answer.
  const full = {
    "2024-Q3": 100,
    "2024-Q4": 200,
    "2025-Q3": 110,
    "2025-Q4": 180,
  };
  assert.deepEqual(yearOnYearChanges(full), {
    "2025-Q3": ((110 - 100) / 100) * 100,
    "2025-Q4": ((180 - 200) / 200) * 100,
  });

  // A gap: 2025-Q1 is missing, so 2025-Q2 is the fourth key back from 2026-Q2
  // and 2025-Q2 is what a positional read would compare it with. The values are
  // chosen so the two answers differ in SIGN — 2026-Q2 is above its own quarter
  // a year earlier and below the key four places back.
  const gapped = {
    "2025-Q2": 300,
    "2025-Q3": 100,
    "2025-Q4": 100,
    "2026-Q1": 100,
    "2026-Q2": 150,
  };
  const gappedOut = yearOnYearChanges(gapped);
  assert.deepEqual(Object.keys(gappedOut), ["2026-Q2"]);
  assert.ok(
    gappedOut["2026-Q2"] < 0,
    "the change was read against a key four places back rather than against the same quarter"
  );

  // Sparse out. A quarter with no year behind it is ABSENT rather than zero: a
  // plotted zero there is a measurement nobody made, and on a chart of changes
  // it draws a year of "no movement" at the start of every series.
  assert.deepEqual(yearOnYearChanges({ "2020-Q1": 5, "2020-Q2": 6 }), {});
  assert.deepEqual(yearOnYearChanges({}), {});
  assert.deepEqual(yearOnYearChanges(null), {});
  assert.deepEqual(yearOnYearChanges(undefined), {});

  // Nothing to divide by, and nothing that is not a quarter.
  assert.deepEqual(yearOnYearChanges({ "2024-Q1": 0, "2025-Q1": 10 }), {});
  assert.deepEqual(yearOnYearChanges({ 2024: 100, 2025: 110 }), {});
});

test("indexTimesBase divides by the base it is given, never by a literal 100", () => {
  // The whole point of the parameter. `I15_Q` writes 2015 as 100 and today as
  // 272.63; `I25_Q` is the SAME measurement on a later base, putting today at
  // about 109. A `/100` written into the function would turn that second series
  // into «×1,1 spрямо 2015» — arithmetically clean, internally consistent, and
  // off by a factor of two and a half, with nothing about the output to say so.
  assert.ok(near(indexTimesBase(272.63, 100), 2.7263, 1e-12));
  assert.ok(near(indexTimesBase(272.63, 250), 1.09052, 1e-12));
  // The base year's own reading is ×1 by construction, whatever the base is.
  for (const base of [100, 250, 1000]) assert.equal(indexTimesBase(base, base), 1);

  for (const [level, base] of [
    [null, 100],
    [272.63, null],
    [272.63, 0],
    [272.63, -100],
    [NaN, 100],
    [undefined, undefined],
  ]) {
    assert.equal(indexTimesBase(level, base), null, `indexTimesBase(${level}, ${base})`);
  }
});

test("rangePosition places a reading against the extremes it is given, and refuses the rest", () => {
  // The whole arithmetic behind the strip at the top of `/market/`, and it is
  // this small on purpose: it places ONE reading inside ONE series' own range
  // and has no second series to weigh it against, so there is nothing here for
  // a later edit to turn into a score.
  assert.equal(rangePosition(15, 10, 20), 0.5);
  // Both ends, exactly. A reading AT its series' record is the commonest case
  // on this page — a nominal price index is at its own maximum every quarter it
  // rises — and 1 is what the strip draws at the right end of the track.
  assert.equal(rangePosition(20, 10, 20), 1);
  assert.equal(rangePosition(10, 10, 20), 0);
  // A signed series is placed the same way. Eurostat's annual rate ran to
  // −26.8%, so the low end of that track is a fall and the arithmetic may not
  // assume the range starts at zero.
  assert.ok(near(rangePosition(14.8, -26.8, 34.6), (14.8 + 26.8) / (34.6 + 26.8), 1e-12));

  // **Zero is not a floor here, and the difference is the whole strip.**
  // `plotSeries` clamps a chart's minimum at or below zero so no axis can be
  // cropped; measured that way every one of these series sits in the top fifth
  // of its track and six rows say the same thing. What is asked for is the
  // position inside the PUBLISHED range.
  assert.ok(rangePosition(15, 10, 20) < rangePosition(15, 0, 20));

  // Nothing to place a reading in: a flat series, an inverted pair, a payload
  // that did not arrive. Null rather than a number, because the strip renders
  // no row at all for one and would draw a marker for the other.
  for (const [value, low, high] of [
    [15, 20, 20],
    [15, 20, 10],
    [null, 10, 20],
    [15, null, 20],
    [15, 10, null],
    [NaN, 10, 20],
  ]) {
    assert.equal(rangePosition(value, low, high), null, `rangePosition(${value}, ${low}, ${high})`);
  }
  // Out of the range rather than clamped to it. The only legitimate caller
  // passes a series' own latest against that same series' own extremes, so a
  // value outside them means two series were crossed — and a clamp would draw
  // that at one end of the track looking exactly like a record.
  assert.equal(rangePosition(25, 10, 20), null);
  assert.equal(rangePosition(5, 10, 20), null);
});

test("shortfallPct says nothing at all about a reading that is not below", () => {
  // It feeds one sentence: «нивото днес е с N% под най-високото». The reference
  // it is measured against is a series MAXIMUM, so the case that matters is the
  // quarter the latest reading becomes that maximum — and there the honest
  // output is no sentence, not «0,0% под него» printed beside two identical
  // numbers on the one comparison this page makes that nobody else makes.
  assert.ok(near(shortfallPct(162.9, 170.17), ((170.17 - 162.9) / 170.17) * 100, 1e-12));
  assert.ok(shortfallPct(162.9, 170.17) > 4 && shortfallPct(162.9, 170.17) < 5);
  assert.equal(shortfallPct(170.17, 170.17), null, "a reading at its own peak reports a shortfall");
  assert.equal(
    shortfallPct(180, 170.17),
    null,
    "a reading above the reference reports a shortfall"
  );

  for (const [value, reference] of [
    [null, 170],
    [162.9, null],
    [162.9, 0],
    [162.9, -170],
    [NaN, 170],
  ]) {
    assert.equal(shortfallPct(value, reference), null, `shortfallPct(${value}, ${reference})`);
  }
});

test("unoccupiedSharePct divides the census counts by each other and nothing else", () => {
  // Both counts come off the same census and the page prints them beside the
  // share, so this is the one derivation on `/market/` a reader can check
  // without leaving the page. 1,657,674 over 4,258,585 is 38.93%.
  const census = { total: 4258585, occupied: 2600911, unoccupied: 1657674 };
  assert.ok(near(unoccupiedSharePct(census), (1657674 / 4258585) * 100, 1e-9));
  assert.ok(unoccupiedSharePct(census) > 38 && unoccupiedSharePct(census) < 39);
  // The denominator is the WHOLE stock, never the occupied part. Dividing by
  // `occupied` returns 63.7% — a plausible-looking share of a population that
  // is not the one the label names.
  assert.ok(
    Math.abs(unoccupiedSharePct(census) - (1657674 / 2600911) * 100) > 20,
    "the fixture no longer tells the two denominators apart"
  );
  for (const bad of [null, {}, { total: 0, unoccupied: 10 }, { total: 100 }, { unoccupied: 10 }]) {
    assert.equal(unoccupiedSharePct(bad), null, `unoccupiedSharePct(${JSON.stringify(bad)})`);
  }
});

test("dealInYearsOfPay divides by a YEAR of the monthly wage, not by the month", () => {
  // The factor of twelve is the whole figure: 82,786 over a 1,407 monthly wage
  // is 4.9 years, and over the same figure taken as annual it is 58.8 — a
  // number that would still look like a plausible property statistic.
  assert.ok(near(dealInYearsOfPay(82786.01, 1407), 82786.01 / (1407 * 12), 1e-12));
  assert.ok(dealInYearsOfPay(82786.01, 1407) > 4.8 && dealInYearsOfPay(82786.01, 1407) < 5);
  // Linear in both arguments, so nothing in it can be a level in disguise.
  assert.ok(near(dealInYearsOfPay(160000, 2000), dealInYearsOfPay(80000, 1000), 1e-12));
  for (const [deal, wage] of [
    [null, 1407],
    [82786, null],
    [82786, 0],
    [82786, -1407],
    [NaN, 1407],
  ]) {
    assert.equal(dealInYearsOfPay(deal, wage), null, `dealInYearsOfPay(${deal}, ${wage})`);
  }
});

test("the leva leg is converted before it can meet a euro denominator", () => {
  // ЕЦБ publish lending volumes «in the currency of the period» and Bulgaria
  // adopted the euro on 2026-01-01, so December's 1 389 and January's 447 are
  // the same market. Unconverted, every year before the changeover is 1.96×
  // too large against a euro denominator — a mortgage-funded share of 153% of
  // what was paid for the homes, on a chart that draws perfectly well.
  const rate = 1.95583;
  const converted = eurosFromMixedCurrency(
    { "2025-11": 1111, "2025-12": 1389, "2026-01": 447.35 },
    { bgnPerEur: rate, euroFrom: "2026-01" }
  );
  assert.ok(near(converted["2025-12"], 1389 / rate, 1e-9));
  assert.ok(near(converted["2025-11"], 1111 / rate, 1e-9));
  // The euro leg is untouched, which is what makes the two halves comparable.
  assert.equal(converted["2026-01"], 447.35);
  // …and the December reading is genuinely NOT the published figure, so a
  // conversion quietly removed cannot leave this test green.
  assert.ok(converted["2025-12"] < 1389 * 0.75, "the pre-euro leg came back unconverted");

  // Null rather than the entries back: a caller that lost the rate renders no
  // chart instead of the unconverted series.
  for (const opts of [
    {},
    { euroFrom: "2026-01" },
    { bgnPerEur: rate },
    { bgnPerEur: 0, euroFrom: "2026-01" },
  ]) {
    assert.equal(eurosFromMixedCurrency({ "2025-12": 1389 }, opts), null);
  }
});

test("completeYearTotals refuses a year the publisher has not finished", () => {
  // Three quarters of spending under twelve months of lending is a share wrong
  // by exactly the missing quarter, and every digit in it is published.
  const quarters = {
    "2024-Q1": 1,
    "2024-Q2": 2,
    "2024-Q3": 3,
    "2024-Q4": 4,
    "2025-Q1": 10,
    "2025-Q2": 20,
  };
  assert.deepEqual(completeYearTotals(quarters, 4), { 2024: 10 });
  const months = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`2024-${String(i + 1).padStart(2, "0")}`, i + 1])
  );
  assert.deepEqual(completeYearTotals({ ...months, "2025-01": 99 }, 12), { 2024: 78 });
  assert.deepEqual(completeYearTotals(null, 4), {});
});

test("yearEndGrowth pairs Decembers by label, and reports a year of repayment", () => {
  // A stock's year is one December against the one before it, found by name.
  // Four steps back in a workbook with a month missing reaches a different
  // month and answers with a plausible figure nobody asked for.
  const stock = { "2014-12": 3497.679, "2015-12": 3155.165, "2016-12": 3323.161, "2016-06": 3200 };
  const growth = yearEndGrowth(stock);
  assert.deepEqual(Object.keys(growth).sort(), ["2015", "2016"]);
  assert.ok(near(growth["2015"], -342.514, 1e-9));
  assert.ok(growth["2015"] < 0, "a year the book shrank came back positive");
  // The first December has no year behind it, so it gets no entry rather than
  // its own level presented as a year's growth.
  assert.equal(growth["2014"], undefined);
});

test("sharePctByKey answers only where both publishers reached the same year", () => {
  const share = sharePctByKey({ 2024: 25, 2025: 60 }, { 2024: 100, 2025: 120, 2026: 50 });
  assert.deepEqual(share, { 2024: 25, 2025: 50 });
  // Sparse out: a year one side is missing, or a denominator of zero, is absent
  // rather than drawn at zero, which on a share is a measurement nobody made.
  assert.deepEqual(sharePctByKey({ 2024: 25, 2027: 1 }, { 2024: 0, 2027: undefined }), {});
});

test("lessSharePct takes the renegotiations out in the volume's own currency", () => {
  // ЕЦБ publish new mortgage business as one figure with repricings inside it,
  // and a household repricing a loan it already has is not somebody buying.
  //
  // The figures are one published month, and the check is against ЕЦБ's own
  // `pure_new_eur_m` for it: 768.56 less 19.94% of itself has to land on the
  // 615.33 they publish separately. The band is 0.05 because the share is
  // published to two decimals, and half of its last digit is 0.038 of that
  // volume — so the tolerance IS the rounding of the input rather than room
  // for the arithmetic to be wrong in.
  const left = lessSharePct({ "2026-06": 768.56 }, { "2026-06": 19.94 });
  assert.ok(near(left["2026-06"], 615.33, 0.05), `${left["2026-06"]}`);
  // A month only one of the two cubes carries drops out: a volume with no split
  // beside it would otherwise be counted whole, as if none of it were a repricing.
  assert.deepEqual(lessSharePct({ "2026-07": 500 }, { "2026-06": 19.94 }), {});
});
