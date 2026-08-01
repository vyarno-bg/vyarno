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
  targetRaise,
  extraPerMonth,
  percentile,
  divisionRate,
  officialSplit,
  contributions,
  personalInflationDetailed,
  buildLadder,
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
  BG_PAYROLL_DEFAULT,
} from "../src/lib/mirror.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

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

test("targetRaise(π, 0) = π exactly (the stand-still raise)", () => {
  assert.ok(near(targetRaise(5.2, 0), 5.2, 1e-12));
});

test("targetRaise is the exact inverse of pocketReal", () => {
  for (const [pi, pocket] of [
    [3.5, 0],
    [5.2, 5],
    [12.0, -2],
    [0, 4],
  ]) {
    const r = targetRaise(pi, pocket);
    assert.ok(
      near(pocketReal(r, pi), pocket, 1e-9),
      `round-trip failed for π=${pi} pocket=${pocket}: raise=${r}`
    );
  }
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

test("percentile clamps the top rung to 99", () => {
  assert.equal(percentile(3200, NET_LADDER), 99);
  assert.equal(percentile(99999, NET_LADDER), 99);
});

test("percentile is monotonic — more money never moves you down", () => {
  let prev = -1;
  for (let s = 300; s <= 4000; s += 25) {
    const p = percentile(s, NET_LADDER);
    assert.ok(p >= prev, `rank fell from ${prev} to ${p} at ${s}`);
    prev = p;
  }
});

test("percentile interpolates between cuts", () => {
  // Exactly the P50 rung → 50; midway between P50 and P60 → ~55.
  assert.equal(percentile(1080, NET_LADDER), 50);
  assert.equal(percentile(1130, NET_LADDER), 55);
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

test("buildLadder uses the payroll params it is given, not a frozen copy", () => {
  const dist = distOf(
    Object.fromEntries([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99].map((p) => [`P${p}`, 1000]))
  );
  const doubledTax = { ...BG_PAYROLL_DEFAULT, incomeTaxRate: 0.2 };
  assert.ok(buildLadder(dist, 1000, doubledTax)[0] < buildLadder(dist, 1000)[0]);
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
  assert.deepEqual(params, {
    rates: BG_PAYROLL_DEFAULT.rates,
    totalEmployeeRate: 0.1378,
    incomeTaxRate: 0.1,
    maxInsurable: 2111.64,
    minWageGross: 620.2,
  });
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
  const rows = contributions({
    divisions: [FOOD, CAR],
    amounts: [95, 5],
    anchor: "y1",
    spendable: 2000,
  });
  assert.equal(rows[0].division, FOOD, "the big share outranks the big rate");
  assert.ok(rows[0].contributionPp > rows[1].contributionPp);
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
