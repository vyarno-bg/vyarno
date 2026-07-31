#!/usr/bin/env node
/**
 * Behaviour verification for `src/lib/view.js` — the wiring between the
 * formulas and what the user reads. Runs under Node's built-in `node:test`
 * runner, no dependencies. Invoked by `npm run verify:math` from `site/`.
 *
 * Why this file exists. `mirror.js` (formulas) and `data.js` (fallback
 * chains) can both be fully covered while the wiring between them is not:
 * feeding the APRC into the annuity, forcing 0% down, moving the
 * affordability line to the regulator's 50%, disabling the stale banner,
 * pointing every verify link at CP01, inverting the fastest-rising card, or
 * leaking a € figure into the share text are all wrong numbers produced by
 * correct formulas. Nothing else checks what they are being fed.
 *
 * Each block below names the wrong number it exists to prevent. When you
 * change a derived value in `App.svelte`, change its test here in the SAME
 * commit (docs/testing-strategy.md) — and break the production code once to
 * watch it go
 * red, because that is the only thing that proves a test is a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  officialBasketWeights,
  dataAge,
  payloadStatus,
  STALE_AFTER_DAYS,
  headlineRate,
  pctAhead,
  savingsSince2020,
  housingCarveOut,
  basketBudget,
  exposedSpend,
  leftoverIfHeldAsCash,
  homePriceFor,
  clampTerm,
  mortgagePanel,
  verifyUrl,
  fastestRisingDivision,
  taxWedgePanel,
  payslipPanel,
  scheduledMaxInsurable,
  scheduledMaxInsurableFrom,
  rankedSplit,
  sofiaQuarter,
  RANK_ROWS_SHOWN,
} from "../src/lib/view.js";
import {
  officialInflation,
  annuityPayment,
  composeLadder,
  percentile,
  bgNetSalary,
  payrollParams,
  contributions,
  personalInflationDetailed,
  BG_CONTRIB_LINES,
} from "../src/lib/mirror.js";
import { PAYLOADS } from "../src/lib/payloads.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLISHED = join(HERE, "..", "..", "data", "published");
const read = (name) => {
  const p = join(PUBLISHED, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** The BNB limits as published — the shape `mortgagePanel` consumes. */
const LIMITS = {
  minDownPaymentPct: 15,
  dstiMaxPct: 50,
  maturityMaxYears: 30,
  prudentDstiPct: 30,
};

// ---------------------------------------------------------------------------
// The basket the sliders start from
// ---------------------------------------------------------------------------

test("officialBasketWeights seeds the sliders with the EXACT published weights", () => {
  // Rounding each division to a whole percent made the default basket sum to
  // 97, so the first number a visitor read (5.30%) matched neither Eurostat's
  // all-items rate (5.20%) nor the official-weight basket (5.36%) — a third
  // figure from nowhere. The seed must be exact.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const w = officialBasketWeights(cats);
  assert.deepEqual(
    w,
    cats.map((c) => c.weight_pct)
  );
  assert.ok(
    Math.abs(w.reduce((s, x) => s + x, 0) - 100) < 0.05,
    `default basket sums to ${w.reduce((s, x) => s + x, 0)}, not ~100`
  );
  // Seeded this way, the default view IS the average basket: the big number
  // and the comparison bar must agree to the last decimal on first paint.
  const seeded =
    cats.reduce((s, c, i) => s + w[i] * c.annual_rate_pct, 0) / w.reduce((s, x) => s + x, 0);
  assert.ok(
    near(seeded, officialInflation(cats, "y1"), 1e-9),
    `default π ${seeded} !== official basket ${officialInflation(cats, "y1")}`
  );
});

test("officialBasketWeights degrades to an empty basket, not a crash", () => {
  assert.deepEqual(officialBasketWeights(null), []);
  assert.deepEqual(officialBasketWeights([]), []);
});

// ---------------------------------------------------------------------------
// Freshness — measured from the OLDEST payload
// ---------------------------------------------------------------------------

const DAY = 86400000;
const NOW = Date.parse("2026-07-25");

/** A manifest row, defaulted, so each test states only what it is about. */
const entry = (key, cadenceDays = 31, extra = {}) => ({
  key,
  file: key,
  cadenceDays,
  name: { bg: key, en: key },
  feeds: { bg: key, en: key },
  refPeriod: (p) => p?.ref_period ?? null,
  ...extra,
});

test("payloadStatus judges a payload against its OWN cadence, not one threshold", () => {
  // 60 days is late for a monthly release and exactly normal for a quarterly
  // one. A single site-wide threshold has to call both the same, and whichever
  // it picks is wrong for one of them.
  const sixtyDaysOld = { as_of: "2026-05-28" };
  assert.equal(payloadStatus(sixtyDaysOld, 31, NOW).status, "overdue", "monthly, 60d → overdue");
  assert.equal(payloadStatus(sixtyDaysOld, 92, NOW).status, "fresh", "quarterly, 60d → fresh");
  assert.equal(payloadStatus(sixtyDaysOld, 366, NOW).status, "fresh", "annual, 60d → fresh");
});

test("payloadStatus reports due before overdue, and absent for a payload that did not load", () => {
  const at = (days, cadence) =>
    payloadStatus({ as_of: "2026-01-01" }, cadence, Date.parse("2026-01-01") + days * DAY).status;
  // Inside the cadence: fresh. Past it the upstream has probably published and
  // we have not fetched — worth a dot, not a banner. Past 1.5× it is a skipped
  // refresh and the banner fires.
  assert.equal(at(31, 31), "fresh");
  assert.equal(at(32, 31), "due");
  assert.equal(at(46, 31), "due");
  assert.equal(at(47, 31), "overdue", "1.5 × 31 = 46.5, so 47 days is over it");
  // A missing payload is not fresh: reporting it so is how a page renders
  // offline sentinels while claiming today's date.
  assert.equal(payloadStatus(null, 31, NOW).status, "absent");
  assert.equal(payloadStatus({}, 31, NOW).status, "absent");
  // No declared cadence falls back to the old flat rule rather than passing.
  assert.equal(
    payloadStatus({ as_of: "2026-01-01" }, undefined, NOW).cadenceDays,
    STALE_AFTER_DAYS
  );
});

test("dataAge measures the aggregate from the OLDEST payload, never the newest", () => {
  // The maximum would let one freshly-republished file stand in for the site's
  // freshness while seven payloads stayed where they were. `payroll.json` is
  // hand-maintained and the one most likely to be refreshed alone, so this is
  // the realistic failure rather than a corner case.
  const age = dataAge(
    { hicpHeadline: { as_of: "2026-02-20" }, payroll: { as_of: "2026-07-25" } },
    [entry("hicpHeadline", 31), entry("payroll", 366)],
    NOW
  );
  assert.equal(age.oldestAsOf, "2026-02-20");
  assert.equal(age.daysOld, 155);
  assert.equal(age.newestAsOf, "2026-07-25");
  // …and the verdict names WHICH payload is late: the 5-month-old HICP is
  // overdue on a monthly cadence, the payroll table is not on an annual one.
  assert.equal(age.stale, true, "a 5-month-stale HICP must raise the banner");
  assert.deepEqual(
    age.overdue.map((r) => r.key),
    ["hicpHeadline"]
  );
});

test("dataAge reports a payload that failed to load instead of skipping it", () => {
  const age = dataAge({ a: { as_of: "2026-07-20" }, b: null }, [entry("a"), entry("b")], NOW);
  assert.equal(age.oldestAsOf, "2026-07-20");
  assert.equal(age.stale, false, "a missing payload is not an overdue refresh");
  assert.deepEqual(
    age.missing.map((r) => r.key),
    ["b"],
    "…but it must be visible in the panel rather than silently absent"
  );
});

test("dataAge falls back to today when nothing loaded", () => {
  const age = dataAge({}, [], NOW);
  assert.match(age.oldestAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(age.daysOld, 0);
  assert.equal(age.stale, false);
  assert.deepEqual(age.rows, []);
});

test("dataAge rows carry what the panel renders, including the period", () => {
  // The period a figure DESCRIBES and the day we FETCHED it are different facts,
  // a month apart on the HICP payloads. The row carries both, separately.
  const [row] = dataAge(
    { hicpHeadline: { as_of: "2026-07-27", ref_period: "2026-06", source: "eurostat" } },
    [entry("hicpHeadline", 31)],
    NOW
  ).rows;
  assert.equal(row.asOf, "2026-07-27");
  assert.equal(row.refPeriod, "2026-06");
  assert.equal(row.source, "eurostat");
  assert.equal(row.status, "fresh");
});

test("every manifest payload resolves a reference period from what it publishes", () => {
  // The panel's period column is only honest if every row can find its own
  // period, and they keep it in different places: `mortgage` per rate tier,
  // `payroll` as an effective year, `sofia_price` as a scraped page date,
  // `salary_dist` as the SES wave. An accessor that silently returns null
  // renders "—" for ever and nobody notices.
  const missing = [];
  for (const p of PAYLOADS) {
    const payload = read(p.file);
    if (!payload) continue;
    if (p.refPeriod(payload) === null) missing.push(p.file);
  }
  assert.deepEqual(
    missing,
    [],
    `manifest rows that cannot date their own figures: ${missing.join(", ")}`
  );
});

test("a second reference period is shown only where there is a second vintage", () => {
  // The label exists so one vintage cannot date another — `salary_dist` is the
  // case it was written for. When the ladder was re-levelled to an НСИ quarter
  // the file held two vintages and the panel owed both; the НСИ split left one,
  // and the row printed "2022" followed by "shape: Eurostat SES 2022". A
  // duplicate reads as a defect on the one panel the whole freshness argument
  // points at.
  for (const p of PAYLOADS) {
    if (!p.refPeriodSecondary) continue;
    const payload = read(p.file);
    if (!payload) continue;
    const secondary = p.refPeriodSecondary(payload);
    if (secondary === null) continue;
    assert.notEqual(
      String(secondary.period),
      String(p.refPeriod(payload)),
      `${p.file} offers a second period equal to its first — the panel would ` +
        "print the same vintage twice, once bare and once labelled."
    );
  }

  // And the accessor still fires when the vintages genuinely differ, so this is
  // not satisfied by an accessor that has quietly stopped returning anything.
  const dist = PAYLOADS.find((p) => p.key === "salaryDist");
  assert.deepEqual(
    dist.refPeriodSecondary({ ref_period: "2026-Q1", shape: { ref_year: 2022 } }),
    {
      period: "2022",
      label: { bg: "форма: Евростат SES", en: "shape: Eurostat SES" },
    },
    "a re-levelled ladder must name the SES wave its dispersion came from"
  );
});

test("salary_dist runs on the SES cycle, not on a quarterly clock", () => {
  // It carried 92 days from when the ladder was re-levelled to the latest НСИ
  // quarter. After the split there is nothing quarterly in the file — Eurostat
  // publishes SES every four years — so the row would have gone overdue, and
  // raised the site-wide staleness banner, over a figure that could not be
  // refreshed until the 2026 wave lands in 2028.
  const dist = PAYLOADS.find((p) => p.key === "salaryDist");
  assert.ok(
    dist.cadenceDays > 1400,
    `salary_dist is on a ${dist.cadenceDays}-day cadence. SES is quadrennial; ` +
      "anything shorter reports a payload nobody can refresh as overdue."
  );

  // The property that matters is the banner, so assert on the banner: three
  // years after the committed refresh, with everything else current, the site
  // must still be calling itself fresh.
  const parts = Object.fromEntries(PAYLOADS.map((p) => [p.key, read(p.file)]));
  if (!parts.salaryDist) return;
  const threeYearsOn = Date.parse(parts.salaryDist.as_of) + 1095 * 86_400_000;
  const { status } = payloadStatus(parts.salaryDist, dist.cadenceDays, threeYearsOn);
  assert.equal(status, "fresh", "salary_dist goes stale before the next SES wave exists");
});

test("the shipped payloads are all fresh against their own cadences as committed", () => {
  const parts = Object.fromEntries(PAYLOADS.map((p) => [p.key, read(p.file)]));
  if (!parts.hicpHeadline) return;
  // Measured against the newest as_of in the repo rather than wall-clock: a
  // checkout is reviewed at an unknown time, so this asserts the payloads were
  // refreshed TOGETHER, not that they are current today. Judging each row on its
  // own cadence is what makes a committed partial refresh visible here.
  const newest = Date.parse(dataAge(parts, PAYLOADS).newestAsOf);
  const { overdue, rows } = dataAge(parts, PAYLOADS, newest);
  assert.deepEqual(
    overdue.map((r) => `${r.file} (${r.daysOld}d, cadence ${r.cadenceDays}d)`),
    [],
    "a partial refresh is committed — these payloads lag the newest one by more " +
      "than their own cadence allows"
  );
  assert.equal(rows.length, PAYLOADS.length, "every manifest payload must have a row");
});

// ---------------------------------------------------------------------------
// The headline — verbatim, never derived
// ---------------------------------------------------------------------------

test("headlineRate returns Eurostat's all-items figure verbatim", () => {
  assert.equal(headlineRate({ headline_rate_pct: 5.2 }), 5.2);
  assert.equal(headlineRate(null), 0);
  assert.equal(headlineRate({}), 0);
  assert.equal(headlineRate({ headline_rate_pct: null }), 0);
});

test("the strip headline is NOT the sum of the divisions — they differ by the chain link", () => {
  // Σ(w·r) over the published divisions is 5.356% against a 5.2% headline: a
  // real 0.16 pp methodological gap (HICP re-weights at December), not an
  // error. Rendering Σ(w·r) in the national strip would quietly replace
  // Eurostat's official figure with our reconstruction of it.
  const cats = read("hicp_categories")?.categories;
  const head = read("hicp_headline");
  if (!cats || !head) return;
  const official = headlineRate(head);
  const basketSum = officialInflation(cats, "y1");
  assert.notEqual(official, basketSum);
  assert.ok(
    Math.abs(basketSum - official) > 0.05,
    "the gap these two carry is load-bearing copy — if it vanished, check why"
  );
  assert.ok(Math.abs(basketSum - official) <= 0.5, "…but it must stay inside the sanity band");
});

// ---------------------------------------------------------------------------
// Percentile — position from the bottom
// ---------------------------------------------------------------------------

test("pctAhead reads from the bottom and is monotonic", () => {
  // "top 63%" for a below-median income reads as an achievement and is false.
  let prev = -1;
  for (let r = 1; r <= 99; r++) {
    const p = pctAhead(r);
    assert.ok(p >= prev, `rank fell from ${prev} to ${p} at ${r}`);
    prev = p;
  }
  assert.equal(pctAhead(1), 1);
  assert.equal(pctAhead(99), 99);
  assert.ok(pctAhead(80) > pctAhead(20), "more money must render a bigger number");
});

test("pctAhead clamps to [1,99] and returns 0 when unknown", () => {
  assert.equal(pctAhead(0), 0);
  assert.equal(pctAhead(-5), 0);
  assert.equal(pctAhead(NaN), 0);
  assert.equal(pctAhead(0.4), 1);
  assert.equal(pctAhead(140), 99);
});

test("a low income renders low and a high income renders high, end to end", () => {
  // The whole chain: two published files → composeLadder() → percentile() →
  // pctAhead(). An inverted percentile renders a €300/mo income as "top 1%".
  const dist = read("salary_dist");
  const sofia = read("sofia_salary");
  if (!dist || !sofia) return;
  const gross = composeLadder(dist, sofiaQuarter(sofia).value);
  const ladder = Object.values(gross);
  assert.equal(ladder.length, 11, "the two payloads no longer compose into a ladder");
  assert.ok(pctAhead(percentile(ladder[0] - 100, ladder)) <= 5);
  assert.ok(pctAhead(percentile(ladder[ladder.length - 1] + 1000, ladder)) >= 95);
});

test("sofiaQuarter reads НСИ's published quarter and computes nothing", () => {
  // The property docs/legal.md §НСИ turns on, asserted on what actually ships.
  // An averaging step reintroduced in this function would move no number a
  // reader could check against anything, so nothing but this would catch it.
  const sofia = read("sofia_salary");
  if (!sofia) return;
  const q = sofiaQuarter(sofia);
  assert.match(q.refPeriod, /^\d{4}-Q[1-4]$/);
  // The headline is a cell in the series beside it, not a function of several.
  assert.equal(q.value, sofia.series_by_period[q.refPeriod]);
  assert.equal(q.value, sofia.value);
  // And it is the NEWEST such cell — an off-by-one here would quote last
  // quarter's level indefinitely, which no gate downstream would notice.
  const newest = Object.keys(sofia.series_by_period)
    .filter((k) => /^\d{4}-Q[1-4]$/.test(k))
    .sort()
    .at(-1);
  assert.equal(q.refPeriod, newest);
});

test("sofiaQuarter prefers the payload headline, and falls back to the newest key", () => {
  // Two shapes reach this function: the live payload, which carries `value`
  // and `ref_period`, and the offline sentinel in content.js. Both must land on
  // the same quarter, because the sentinel is what a reader sees for the first
  // few hundred milliseconds and a mismatch would flash a different number.
  const withHeadline = {
    value: 1915,
    ref_period: "2026-Q1",
    series_by_period: { "2025-Q4": 1859, "2026-Q1": 1915 },
  };
  assert.deepEqual(sofiaQuarter(withHeadline), { value: 1915, refPeriod: "2026-Q1" });

  const seriesOnly = { series_by_period: { "2025-Q4": 1859, "2026-Q1": 1915 } };
  assert.deepEqual(sofiaQuarter(seriesOnly), { value: 1915, refPeriod: "2026-Q1" });
});

test("sofiaQuarter ignores a monthly key rather than treating it as a quarter", () => {
  // A payload written by an older envelope carries "YYYY-MM" keys. Selecting
  // one would quote a single month as the quarterly level — and March runs
  // ~7.6% above its own quarter on the published series, which propagates to
  // every rung of the ladder.
  const monthly = { series_by_period: { "2026-01": 1865, "2026-02": 1818, "2026-03": 2061 } };
  assert.deepEqual(sofiaQuarter(monthly), { value: 0, refPeriod: "" });
});

test("sofiaQuarter returns zeros rather than NaN when the payload is missing", () => {
  for (const input of [null, undefined, {}, { series_by_period: {} }]) {
    const q = sofiaQuarter(input);
    assert.equal(q.value, 0);
    assert.equal(q.refPeriod, "");
  }
});

// ---------------------------------------------------------------------------
// Savings — always the official since-2020 cumulative
// ---------------------------------------------------------------------------

test("savingsSince2020 deflates by EUROSTAT'S OWN all-items index", () => {
  // The card's copy says "от 2020 г." / "since 2020" in fixed words. Passing
  // the user's own basket rate would answer a different question in the same
  // sentence — so there is no argument to pass it through.
  //
  // And the cumulative is Eurostat's published all-items index, never our
  // reconstruction of one from the divisions. The two sit ~1.9 pp apart over
  // this span, so showing the reconstruction under the word "official" is a
  // false label on a number that is nearly two points out.
  const head = read("hicp_headline");
  const cats = read("hicp_categories")?.categories;
  if (!head || !cats) return;
  const r = savingsSince2020(10000, head, cats);
  assert.equal(r.basis, "all_items", "did not use the published all-items index");

  const expected = 100 * (head.latest_index.value / head.index_by_year["2020"] - 1);
  assert.ok(near(r.cumulativePct, expected, 1e-9), `${r.cumulativePct} vs ${expected}`);
  assert.ok(near(r.valueToday, 10000 / (1 + r.cumulativePct / 100), 1e-9));
  assert.ok(near(r.eaten, 10000 - r.valueToday, 1e-9));

  // A user's own basket rate is single-digit; the since-2020 cumulative is
  // ~40%. If the two were ever swapped, `eaten` would be off by ~7x.
  assert.ok(r.eaten > 2500, `eaten ${r.eaten} looks like a 12-month rate, not since-2020`);

  // And it must be MEASURABLY the official figure, not the reconstruction.
  // Both are in the 30-60% band, so a band check cannot tell them apart —
  // this is the assertion that can.
  const reconstruction = savingsSince2020(10000, null, cats).cumulativePct;
  assert.ok(
    Math.abs(reconstruction - r.cumulativePct) > 1,
    `the all-items index (${r.cumulativePct}) and the divisions reconstruction ` +
      `(${reconstruction}) are within 1 pp — this test can no longer tell which ` +
      `one the card is showing`
  );
});

test("savingsSince2020 falls back to the divisions, and SAYS it did", () => {
  // The fallback is a legitimate number but a different one. If it inherited
  // the "Eurostat's own index" sentence, a degraded payload would reintroduce
  // exactly the mislabelling this function was changed to remove — so `basis`
  // has to change with it, and the drawer copy keys off `basis`.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  for (const head of [
    null,
    undefined,
    {},
    { index_by_year: {} },
    { latest_index: {} },
    { index_by_year: { 2020: 0 }, latest_index: { value: 140 } },
  ]) {
    const r = savingsSince2020(10000, head, cats);
    assert.equal(r.basis, "average_basket", `bad basis for ${JSON.stringify(head)}`);
    assert.ok(r.cumulativePct > 30 && r.cumulativePct < 60, r.cumulativePct);
  }
});

test("savingsSince2020 eats nothing with no payloads or no cash", () => {
  assert.equal(savingsSince2020(10000, null, []).eaten, 0);
  assert.equal(savingsSince2020(10000, null, []).basis, "none");
  assert.equal(savingsSince2020(10000, null, null).valueToday, 10000);
  assert.equal(savingsSince2020(0, null, []).eaten, 0);
});

// ---------------------------------------------------------------------------
// Housing carve-out
// ---------------------------------------------------------------------------

test("housingCarveOut subtracts rent AND the mortgage — a person can carry both", () => {
  const r = housingCarveOut({ salary: 2000, homeOn: true, monthlyMortgage: 600, rent: 300 });
  assert.equal(r.housingCost, 900);
  assert.equal(r.spendable, 1100);
});

test("housingCarveOut ignores the mortgage when the home block is off", () => {
  const r = housingCarveOut({ salary: 2000, homeOn: false, monthlyMortgage: 600, rent: 300 });
  assert.equal(r.housingCost, 300);
  assert.equal(r.spendable, 1700);
});

test("housingCarveOut never returns a negative spendable", () => {
  const r = housingCarveOut({ salary: 500, homeOn: true, monthlyMortgage: 900, rent: 200 });
  assert.equal(r.spendable, 0);
});

// ---------------------------------------------------------------------------
// The basket's budget — what was placed, and what was not
//
// The wrong number this section exists to prevent: the € column, and every
// figure carved out of it, being scaled to the whole spendable amount when
// the reader has deliberately entered less. Point `spendBase` back at
// `spendable` in euro mode and the first four cases go red.
// ---------------------------------------------------------------------------

test("in € mode the spend base is what was TYPED, not the whole budget", () => {
  // €1,000 of a €1,250 budget: the thirteen euro figures must be the reader's
  // own, not their basket inflated by 25% to swallow the rest.
  const b = basketBudget({ spendMode: "eur", amounts: [600, 300, 100], spendable: 1250 });
  assert.equal(b.entered, 1000);
  assert.equal(b.spendBase, 1000, "the € column was rescaled to the full budget");
  assert.equal(b.leftover, 250);
  assert.equal(b.leftoverPerYear, 3000);
  assert.equal(b.leftoverPct, 20);
  assert.equal(b.hasLeftover, true);
  assert.equal(b.over, 0);
});

test("the per-division € figures are exactly what was typed", () => {
  // The template computes `spendBase × amount / Σamount`. With spendBase === Σ
  // that is the identity, which is the whole point: what you typed is what you
  // are shown. The old wiring turned a typed €600 into €750.
  const amounts = [600, 300, 100];
  const b = basketBudget({ spendMode: "eur", amounts, spendable: 1250 });
  amounts.forEach((a, i) => {
    assert.ok(near((b.spendBase * amounts[i]) / b.entered, a), `row ${i} was rescaled`);
  });
});

test("in share mode there is no leftover — percentages allocate all of it", () => {
  // Shares describe how the spendable amount divides. A basket of 22/6/4 does
  // not mean "€32 of my €1,250"; inventing a leftover from it would put a
  // €1,218 figure on screen that means nothing at all.
  const b = basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable: 1250 });
  assert.equal(b.spendBase, 1250);
  assert.equal(b.leftover, 0);
  assert.equal(b.leftoverPerYear, 0);
  assert.equal(b.hasLeftover, false);
});

test("over-allocating is reported as over, and still measured on what was typed", () => {
  // Spending more than you take home is a real thing people do (savings,
  // credit). We say so — and we do not quietly clamp their basket down to
  // their pay, because their number is theirs.
  const b = basketBudget({ spendMode: "eur", amounts: [900, 500], spendable: 1250 });
  assert.equal(b.over, 150);
  assert.equal(b.leftover, 0);
  assert.equal(b.hasLeftover, false);
  assert.equal(b.spendBase, 1400);
});

test("a leftover under €1 is rounding, and says nothing", () => {
  // «€0 остават извън кошницата» on a basket that happens to balance is noise
  // on a card that is otherwise all signal.
  const b = basketBudget({ spendMode: "eur", amounts: [1249.4], spendable: 1250 });
  assert.equal(b.hasLeftover, false);
  assert.ok(b.leftover < 1);
});

test("basketBudget survives an empty basket and a salary nobody typed", () => {
  assert.equal(basketBudget({ spendMode: "eur", amounts: [], spendable: 0 }).hasLeftover, false);
  assert.equal(basketBudget({ spendMode: "eur", amounts: null, spendable: 900 }).entered, 0);
  assert.equal(basketBudget({ spendMode: "pct", amounts: [50], spendable: -5 }).spendBase, 0);
  // Negative slider values cannot happen through the UI, but Σ must not go
  // negative if one ever did — it is the denominator of every share.
  assert.equal(
    basketBudget({ spendMode: "eur", amounts: [100, -40], spendable: 900 }).entered,
    100
  );
});

// ---------------------------------------------------------------------------
// What the price rise is charged against
// ---------------------------------------------------------------------------

test("exposedSpend reduces to the whole take-home when nothing is left over", () => {
  // The load-bearing property: this must not move the headline € figure for
  // the readers who never asked for any of this. In share mode
  // spendBase === salary − housingCost, so the sum is the salary again.
  const { housingCost, spendable } = housingCarveOut({
    salary: 2000,
    homeOn: false,
    monthlyMortgage: 0,
    rent: 450,
  });
  const b = basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable });
  assert.equal(exposedSpend({ housingCost, spendBase: b.spendBase }), 2000);
});

test("exposedSpend charges the rise only on money that is actually spent", () => {
  // €2,000 pay, €450 rent, €900 of basket entered: prices apply to €1,350, not
  // to the €650 sitting in the account. Feeding `salary` here overstated what
  // the same life costs by exactly the amount the reader put aside.
  const { housingCost, spendable } = housingCarveOut({
    salary: 2000,
    homeOn: false,
    monthlyMortgage: 0,
    rent: 450,
  });
  const b = basketBudget({ spendMode: "eur", amounts: [500, 300, 100], spendable });
  assert.equal(exposedSpend({ housingCost, spendBase: b.spendBase }), 1350);
});

test("exposedSpend keeps housing in — rent and a mortgage payment are spending", () => {
  assert.equal(exposedSpend({ housingCost: 600, spendBase: 0 }), 600);
  assert.equal(exposedSpend({ housingCost: 0, spendBase: 0 }), 0);
  assert.equal(exposedSpend({ housingCost: undefined, spendBase: undefined }), 0);
});

// ---------------------------------------------------------------------------
// The unplaced money, held as cash
// ---------------------------------------------------------------------------

test("leftoverIfHeldAsCash measures against the HEADLINE, never the user's basket", () => {
  // The wrong wiring is π. Money that is not being spent on this reader's
  // basket is not measured by this reader's basket — and the function takes
  // the payload rather than a rate precisely so no caller can hand it one.
  const r = leftoverIfHeldAsCash({
    leftoverPerYear: 3000,
    headline: { headline_rate_pct: 5.2 },
  });
  assert.equal(r.ratePct, 5.2);
  assert.ok(near(r.valueToday, 3000 / 1.052));
  assert.ok(near(r.eaten, 3000 - 3000 / 1.052));
  // Sanity: ~€148 on €3,000 at 5.2%. A sign slip or a ×100 shows up here.
  assert.ok(r.eaten > 140 && r.eaten < 155, `implausible erosion: ${r.eaten}`);
});

test("leftoverIfHeldAsCash uses the SHIPPED headline rate when handed the payload", () => {
  const headline = read("hicp_headline");
  if (!headline) return;
  const r = leftoverIfHeldAsCash({ leftoverPerYear: 1200, headline });
  assert.equal(r.ratePct, headlineRate(headline));
  assert.ok(r.eaten > 0 && r.eaten < 1200);
});

test("leftoverIfHeldAsCash degrades to zero rather than NaN", () => {
  // No headline payload → rate 0 → the money keeps its value. A NaN here
  // would render "€NaN less in a year" on a card people are asked to trust.
  const r = leftoverIfHeldAsCash({ leftoverPerYear: 3000, headline: null });
  assert.equal(r.ratePct, 0);
  assert.equal(r.valueToday, 3000);
  assert.equal(r.eaten, 0);
  assert.equal(leftoverIfHeldAsCash({ leftoverPerYear: -5, headline: null }).valueToday, 0);
});

// ---------------------------------------------------------------------------
// The home block
// ---------------------------------------------------------------------------

test("homePriceFor uses the typed price only in manual mode", () => {
  assert.equal(
    homePriceFor({ priceMode: "auto", manualPrice: 99999, eurPerM2: 2500, m2: 70 }),
    175000
  );
  assert.equal(
    homePriceFor({ priceMode: "manual", manualPrice: 150000, eurPerM2: 2500, m2: 70 }),
    150000
  );
  // Manual mode with nothing typed yet falls back to the market price rather
  // than pricing a €0 home.
  assert.equal(
    homePriceFor({ priceMode: "manual", manualPrice: 0, eurPerM2: 2500, m2: 70 }),
    175000
  );
});

test("clampTerm holds the term at the BNB maturity ceiling", () => {
  // The input's `max` stops the spinner but not a typed or restored value.
  // A 40-year quote is a payment no BG bank can legally originate.
  assert.equal(clampTerm(40, LIMITS), 30);
  assert.equal(clampTerm(25, LIMITS), 25);
  assert.equal(clampTerm(40, {}), 30, "with no published limits, still cap at 30");
});

test("mortgagePanel amortises the AAR, never the fee-inclusive APRC", () => {
  // docs/data-sources.md §"A plausible number is not a verified number". The
  // APRC (2.77% at 2026-05) folds fees into an annualised
  // figure; compounding them monthly overstates the payment. At the published
  // Sofia median this is ~€24/month — plausible enough that no sanity band
  // would catch it, which is exactly why it needs a test.
  const args = {
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  };
  const aar = mortgagePanel(args);
  const aprc = mortgagePanel({ ...args, ratePct: 2.77 });
  assert.ok(near(aar.payment, annuityPayment(175070 * 0.85, 2.43, 25), 1e-9));
  assert.ok(
    aprc.payment - aar.payment > 15,
    `APRC vs AAR must be a visible €/month gap, got ${aprc.payment - aar.payment}`
  );
  // Pin the shipped figure so a silent rate swap moves it.
  assert.ok(aar.payment > 655 && aar.payment < 670, aar.payment);
});

test("mortgagePanel takes the down payment from the published BNB cap, not the caller", () => {
  // LTV-O is capped at 85%, so 15% down is the largest loan a BG bank may
  // legally write. A caller must not be able to quote a 0%-down payment.
  const p = mortgagePanel({
    price: 200000,
    ratePct: 2.5,
    termYears: 25,
    netSalary: 1500,
    eurPerM2: 2500,
    limits: LIMITS,
    // these are ignored on purpose — the function reads `limits`
    downPaymentPct: 0,
    minDownPaymentPct: 0,
  });
  assert.equal(p.downPaymentPct, 15);
  assert.equal(p.loan, 170000);
  assert.equal(p.downPayment, 30000);
});

test("mortgagePanel draws the affordability line at OUR 30%, not the regulator's 50%", () => {
  // docs/principles.md P7. A payment a bank will approve is not a payment that leaves
  // room to live; adopting the legal ceiling would make homes look reachable.
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.equal(p.capPct, 30);
  assert.ok(near(p.capEur, 1486 * 0.3, 1e-9));
  assert.ok(p.capPct < LIMITS.dstiMaxPct, "our line must stay stricter than the law");
  // At the published Sofia median this purchase IS a stretch, and the app has
  // to keep saying so.
  assert.ok(p.overCap, "the Sofia median at the average wage must read as over the line");
  assert.ok(p.sharePct > 40 && p.sharePct < 50, p.sharePct);
});

test("mortgagePanel's fallback affordability line is 30%, not the regulator's 50%", () => {
  // The `?? 30` default holds when a degraded mortgage.json carries no
  // `prudent_dsti_pct`. The test above always passes a complete `limits`, so
  // that branch was unexercised — `?? 30` could become `?? 50` (the ceiling the
  // 30% line exists to undercut, docs/principles.md P7) with every suite green.
  const partial = { minDownPaymentPct: 15, maturityMaxYears: 30 };
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: partial,
  });
  assert.equal(p.capPct, 30, "the fallback line must be our 30%, not the 50% BNB permits");
  assert.ok(near(p.capEur, 1486 * 0.3, 1e-9));
});

test("mortgagePanel's reverse calc round-trips against its own forward calc", () => {
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  // A home priced at exactly maxPrice must land exactly on the cap.
  const atCap = mortgagePanel({
    price: p.maxPrice,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.ok(near(atCap.payment, p.capEur, 1e-6), `${atCap.payment} vs ${p.capEur}`);
  assert.ok(near(atCap.capGap, 0, 1e-6));
  assert.ok(near(p.maxM2, p.maxPrice / 2501, 1e-9));
});

test("mortgagePanel clamps an over-long term before quoting anything", () => {
  const long = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 40,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  const capped = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 30,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.ok(near(long.payment, capped.payment, 1e-9), "a 40y term must quote as 30y");
});

test("mortgagePanel degrades without a salary instead of dividing by zero", () => {
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 0,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.equal(p.sharePct, 0);
  assert.equal(p.capEur, 0);
  assert.equal(p.maxLoan, 0);
});

test("the published limits keep our line stricter than the law and the market", () => {
  const m = read("mortgage");
  if (!m) return;
  const l = m.lending_limits;
  assert.ok(l.prudent_dsti_pct < l.observed_weighted_avg_dsti_pct);
  assert.ok(l.observed_weighted_avg_dsti_pct < l.dsti_max_pct);
});

// ---------------------------------------------------------------------------
// Provenance links
// ---------------------------------------------------------------------------

const ROW = {
  cp_code: "CP07",
  api_url: "https://ec.europa.eu/…/prc_hicp_minr?geo=BG&coicop18=CP07&unit=RCH_A&lastTimePeriod=12",
  api_url_index:
    "https://ec.europa.eu/…/prc_hicp_minr?geo=BG&coicop18=CP07&unit=I15&sinceTimePeriod=2020-01",
};

test("verifyUrl points at the extract that CONTAINS the number beside it", () => {
  // At "last 12 months" the figure on screen is the published RCH_A rate; at a
  // year anchor it is derived from the I15 index. Linking to the index cube
  // while showing a rate means the number cannot be found.
  assert.match(verifyUrl(ROW, "y1"), /unit=RCH_A/);
  assert.match(verifyUrl(ROW, 2020), /unit=I15/);
  assert.match(verifyUrl(ROW, "2024"), /unit=I15/);
});

test("verifyUrl describes the row it was handed, never a fixed category", () => {
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  for (const c of cats) {
    assert.ok(
      verifyUrl(c, "y1").includes(`coicop18=${c.cp_code}`),
      `${c.cp_code}: rate link points elsewhere`
    );
    assert.ok(
      verifyUrl(c, 2020).includes(`coicop18=${c.cp_code}`),
      `${c.cp_code}: index link points elsewhere`
    );
    for (const g of c.groups) {
      assert.ok(verifyUrl(g, "y1").includes(`coicop18=${g.cp_code}`));
      assert.ok(verifyUrl(g, 2020).includes(`coicop18=${g.cp_code}`));
    }
  }
  // 13 divisions + 46 groups, each with two anchors — all distinct.
  const all = new Set(
    cats.flatMap((c) => [c, ...c.groups]).flatMap((r) => [verifyUrl(r, "y1"), verifyUrl(r, 2020)])
  );
  assert.equal(all.size, 118, "every published row must have its own two links");
});

test("verifyUrl falls back to the dataset table rather than an empty href", () => {
  assert.match(verifyUrl({}, "y1"), /^https:\/\//);
  assert.match(verifyUrl(null, 2020), /^https:\/\//);
});

// ---------------------------------------------------------------------------
// Strip cards
// ---------------------------------------------------------------------------

test("fastestRisingDivision picks the HIGHEST rate", () => {
  // Sorting the wrong way advertises the slowest-rising division as the
  // fastest, which reads as entirely plausible and is exactly backwards.
  const cats = [
    { cp_code: "A", annual_rate_pct: 2.3 },
    { cp_code: "B", annual_rate_pct: 11.0 },
    { cp_code: "C", annual_rate_pct: 0.0 },
  ];
  assert.equal(fastestRisingDivision(cats).cp_code, "B");
  assert.equal(fastestRisingDivision([]), null);
  assert.equal(fastestRisingDivision(null), null);
});

test("fastestRisingDivision on the shipped basket is transport", () => {
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const f = fastestRisingDivision(cats);
  assert.equal(f.cp_code, "CP07");
  assert.ok(
    cats.every((c) => c.annual_rate_pct <= f.annual_rate_pct),
    "no division may out-rise the one we call fastest"
  );
});

test("fastestRisingDivision does not mutate the caller's array", () => {
  const cats = [{ annual_rate_pct: 1 }, { annual_rate_pct: 9 }, { annual_rate_pct: 5 }];
  const before = cats.map((c) => c.annual_rate_pct);
  fastestRisingDivision(cats);
  assert.deepEqual(
    cats.map((c) => c.annual_rate_pct),
    before
  );
});

// ---------------------------------------------------------------------------
// THE TAX WEDGE PANEL — the tax wedge
//
// The formula is covered in verify_mirror_math.mjs. What is covered HERE is
// what it gets fed: the published payroll payload rather than hand-written
// rates, the user's GROSS rather than the net they typed, and the scheduled
// cap out of the payload rather than a constant. Each of those is a wrong
// number that lands inside every plausible band (docs/site.md §"A correct
// formula fed the wrong number").
// ---------------------------------------------------------------------------

const PAYROLL = read("payroll");

test("taxWedgePanel reads the cap and the rates out of the PUBLISHED payload", () => {
  if (!PAYROLL) return;
  const panel = taxWedgePanel({ payroll: PAYROLL, netSalary: 0 });
  assert.ok(
    near(panel.capGross, PAYROLL.max_insurable_income_eur, 1e-9),
    `the panel's cap (${panel.capGross}) is not payroll.json's ` +
      `(${PAYROLL.max_insurable_income_eur}) — the kink is drawn in the wrong place`
  );
  // And it genuinely follows the payload: a hypothetical raised cap must move
  // it. A panel closed over BG_PAYROLL_DEFAULT would pass the line above and
  // fail this one.
  const raised = taxWedgePanel({
    payroll: { ...PAYROLL, max_insurable_income_eur: 3000 },
    netSalary: 0,
  });
  assert.ok(near(raised.capGross, 3000, 1e-9), "the cap is hardcoded, not read");
});

test("taxWedgePanel places the user by their GROSS, not the net they typed", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  // A net that converts to a gross ABOVE the cap. Placing the user by their
  // net would put them under it and show the wrong marginal rate — plausible,
  // and wrong by 12.4 pp.
  const grossOverCap = params.maxInsurable + 300;
  const net = bgNetSalary(grossOverCap, params).net;
  assert.ok(net < params.maxInsurable, "test premise: the net is below the cap");

  const panel = taxWedgePanel({ payroll: PAYROLL, netSalary: net });
  assert.ok(panel.you, "no user point was produced for a positive salary");
  assert.ok(
    near(panel.you.gross, grossOverCap, 0.01),
    `placed the user at ${panel.you.gross} instead of ${grossOverCap}`
  );
  assert.equal(panel.you.overCap, true, "the user was placed below a cap they are over");
  assert.ok(near(panel.you.marginalPct, 10, 1e-9), panel.you.marginalPct);
});

test("taxWedgePanel says nothing about a user who has typed nothing", () => {
  // P7: no unsourced default. An empty salary field must not silently render
  // someone at the median, or at zero.
  for (const v of [0, -100, NaN, undefined, null]) {
    assert.equal(taxWedgePanel({ payroll: PAYROLL, netSalary: v }).you, null, String(v));
  }
});

test("scheduledMaxInsurable reads the right row, or nothing", () => {
  assert.equal(scheduledMaxInsurable(null), null);
  assert.equal(scheduledMaxInsurable({}), null);
  assert.equal(scheduledMaxInsurable({ scheduled_changes: [] }), null);
  // A change to a DIFFERENT field must not be read as the cap.
  assert.equal(
    scheduledMaxInsurable({ scheduled_changes: [{ field: "min_wage", value_eur: 700 }] }),
    null,
    "a min-wage change was read as the insurance ceiling"
  );
  assert.equal(
    scheduledMaxInsurable({
      scheduled_changes: [{ field: "max_insurable_income", value_eur: 2300 }],
    }),
    2300
  );
});

test("the legislated cap rise comes from payroll.json and is priced, not guessed", () => {
  if (!PAYROLL) return;
  const scheduled = scheduledMaxInsurable(PAYROLL);
  const panel = taxWedgePanel({ payroll: PAYROLL, netSalary: 0 });
  if (scheduled == null) {
    assert.equal(panel.capRisePerMonth, null);
    return;
  }
  const expected =
    (scheduled - PAYROLL.max_insurable_income_eur) * PAYROLL.employee_contrib_rates.total;
  assert.ok(
    near(panel.capRisePerMonth, expected, 1e-9),
    `priced the cap rise at ${panel.capRisePerMonth}, not ${expected}`
  );
  // Sanity band, reached only while a change is actually pending: a ceiling
  // step is worth tens of euros a month at 13.78%. A figure in the hundreds
  // means the rates or the caps got crossed. `payroll.json` carries no pending
  // change today, so this branch is dormant — it fires again at the next ЗБДОО
  // and has to be right then without being edited for it.
  assert.ok(panel.capRisePerMonth > 1 && panel.capRisePerMonth < 100, panel.capRisePerMonth);
});

test("the panel degrades to the offline sentinel rather than crashing", () => {
  // First paint, before payroll.json resolves.
  const panel = taxWedgePanel({ payroll: null, netSalary: 0 });
  assert.ok(panel.points.length > 0 && panel.capGross > 0);
  assert.equal(panel.capRisePerMonth, null, "invented a scheduled change with no payload");
});

// ---------------------------------------------------------------------------
// THE ITEMISED PAYSLIP PANEL
//
// The arithmetic is covered in verify_net_salary.mjs. What is covered HERE is
// what it gets fed: the published payload rather than hand-written rates, and
// the typed NET inverted to a gross rather than itemised as though it were the
// contract amount. The second one is the wrong number that looks right —
// every line ~20% light, and no band would flag it (docs/site.md §"A correct
// formula fed the wrong number").
// ---------------------------------------------------------------------------

test("payslipPanel itemises the GROSS, not the net that was typed", () => {
  if (!PAYROLL) return;
  const net = 2100;
  const panel = payslipPanel({ payroll: PAYROLL, netSalary: net });
  assert.ok(panel, "no panel for a positive salary");
  assert.ok(
    panel.gross > net,
    `itemised ${panel.gross} for a net of ${net} — the typed net was treated ` +
      "as the contract amount"
  );
  // The property that makes the answer checkable: the column pays the net
  // that was asked for. It is the property a net→gross inverse taken without
  // the ceiling fails, while still printing a plausible gross.
  assert.ok(
    near(panel.gross - panel.totalDeductions, net, 0.005),
    `${panel.gross} − ${panel.totalDeductions} = ` +
      `${(panel.gross - panel.totalDeductions).toFixed(2)}, not ${net}`
  );
  assert.ok(near(panel.net, net, 0.005), panel.net);
  assert.equal(panel.netRequested, net);
});

test("payslipPanel reads the rates and the ceiling out of the PUBLISHED payload", () => {
  if (!PAYROLL) return;
  const panel = payslipPanel({ payroll: PAYROLL, netSalary: 2100 });
  assert.ok(
    near(panel.maxInsurable, PAYROLL.max_insurable_income_eur, 1e-9),
    `the panel's ceiling (${panel.maxInsurable}) is not payroll.json's`
  );
  assert.equal(
    panel.effectiveYear,
    PAYROLL.effective_year,
    "the provenance caption's year is not the payload's"
  );

  // And it genuinely follows the payload. A panel closed over the offline
  // sentinel would pass every assertion above and fail all of these.
  const raised = payslipPanel({
    payroll: { ...PAYROLL, max_insurable_income_eur: 4000 },
    netSalary: 2100,
  });
  assert.ok(near(raised.maxInsurable, 4000, 1e-9), "the ceiling is hardcoded, not read");
  assert.equal(
    raised.insuranceCapped,
    false,
    "a gross under a raised ceiling was still reported as capped"
  );
  assert.ok(
    raised.gross !== panel.gross,
    "raising the ceiling changed nothing — the panel is not reading the payload"
  );

  const doubled = payslipPanel({
    payroll: {
      ...PAYROLL,
      employee_contrib_rates: Object.fromEntries(
        Object.entries(PAYROLL.employee_contrib_rates).map(([k, v]) => [k, v * 2])
      ),
    },
    netSalary: 2100,
  });
  assert.ok(
    doubled.insurance > panel.insurance * 1.9,
    `doubling the published rates moved the contributions from ` +
      `${panel.insurance} to ${doubled.insurance} — the rates are hardcoded`
  );
});

test("payslipPanel's rows account for every cent it says was withheld", () => {
  if (!PAYROLL) return;
  for (const net of [700, 1200, 1638, 1700, 2100, 4000]) {
    const p = payslipPanel({ payroll: PAYROLL, netSalary: net });
    const sum = p.lines.reduce((a, l) => a + l.amount, 0);
    assert.ok(
      near(sum, p.insurance, 1e-9),
      `net ${net}: rows sum to ${sum.toFixed(2)}, total says ${p.insurance}`
    );
    assert.deepEqual(
      p.lines.map((l) => l.key),
      [...BG_CONTRIB_LINES],
      `net ${net}: a published contribution line is missing from the breakdown`
    );
  }
});

test("payslipPanel says nothing about a user who has typed nothing", () => {
  // P7 again: an empty field must not render a column of zeroes for the
  // reader to check. There is no payslip for a salary nobody typed.
  for (const v of [0, -100, NaN, undefined, null, ""]) {
    assert.equal(payslipPanel({ payroll: PAYROLL, netSalary: v }), null, String(v));
  }
});

test("payslipPanel degrades to the offline sentinel rather than crashing", () => {
  // First paint, before payroll.json resolves.
  const p = payslipPanel({ payroll: null, netSalary: 2100 });
  assert.ok(p && p.gross > 0 && p.lines.length === 5);
  assert.equal(p.effectiveYear, null, "invented an effective year with no payload");
});

// ---------------------------------------------------------------------------
// THE RANKED LIST — the column has to add up to what the sentence claims
// ---------------------------------------------------------------------------

test("rankedSplit keeps Σ(shown) + rest === π exactly", () => {
  // `contributions` is an exact decomposition of the user's inflation, and
  // COPY.rankLead tells the reader so. The list is capped at eight rows, so
  // without the remainder the visible column stops short — which is what it
  // did: 5.1 points on screen under a sentence promising 5.4.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const amounts = cats.map((c) => c.weight_pct);
  const ranked = contributions({
    divisions: cats,
    amounts,
    splits: [],
    anchor: "y1",
    spendable: 900,
  });
  const pi = personalInflationDetailed(amounts, cats, [], "y1", 0);
  const { shown, restN, restPp } = rankedSplit(ranked);

  const drawn = shown.reduce((s, r) => s + r.contributionPp, 0);
  assert.ok(
    near(drawn + restPp, pi, 1e-9),
    `shown ${drawn} + rest ${restPp} = ${drawn + restPp}, but the sentence says ${pi}`
  );
  // The bug this replaces: enough divisions score that rows really are folded.
  assert.ok(restN > 0, "the default BG basket must exercise the remainder path");
  assert.ok(shown.length <= RANK_ROWS_SHOWN);
});

test("rankedSplit folds sub-threshold rows into the remainder, never off the page", () => {
  // A row too small to draw still carries points. Computing the remainder
  // from the *drawable* rows instead of all of them re-opens the same hole
  // one decimal further down.
  const rows = [
    { contributionPp: 3 },
    { contributionPp: 2 },
    { contributionPp: 1 },
    { contributionPp: 0.001 },
    { contributionPp: 0.002 },
  ];
  const { shown, restN, restPp } = rankedSplit(rows, 3);
  assert.equal(shown.length, 3);
  assert.equal(restN, 2);
  assert.ok(near(restPp, 0.003, 1e-12), `sub-threshold points vanished: ${restPp}`);
});

test("rankedSplit is a no-op tail when everything fits", () => {
  const rows = [{ contributionPp: 2 }, { contributionPp: 1 }];
  const { shown, restN, restPp } = rankedSplit(rows, 8);
  assert.equal(shown.length, 2);
  assert.equal(restN, 0);
  assert.ok(near(restPp, 0, 1e-12));
});

test("rankedSplit survives an empty or missing list", () => {
  for (const input of [[], null, undefined]) {
    const { shown, restN, restPp } = rankedSplit(input);
    assert.deepEqual(shown, []);
    assert.equal(restN, 0);
    assert.equal(restPp, 0);
  }
});

test("scheduledMaxInsurableFrom returns a real date or nothing at all", () => {
  // `effective_from` was prose — "2026 (pending the regular state budget)" —
  // so the panel could only say "when it does". It is an ISO date now, but a
  // regression to prose must degrade to the dateless wording rather than
  // render the condition string as if it were a date.
  const live = read("payroll");
  if (live) {
    const from = scheduledMaxInsurableFrom(live);
    if (live.scheduled_changes?.length) {
      assert.match(from ?? "", /^\d{4}-\d{2}-\d{2}$/, `published effective_from is ${from}`);
    }
  }
  const mk = (effective_from) => ({
    scheduled_changes: [{ field: "max_insurable_income", value_eur: 2300, effective_from }],
  });
  assert.equal(scheduledMaxInsurableFrom(mk("2026-08-01")), "2026-08-01");
  for (const junk of [
    "2026 (pending the regular state budget)",
    "2026",
    "2026-08",
    "soon",
    "",
    null,
    undefined,
    20260801,
    "2026-13-01",
  ]) {
    assert.equal(scheduledMaxInsurableFrom(mk(junk)), null, `accepted ${JSON.stringify(junk)}`);
  }
  // And the usual defensive shapes.
  for (const p of [
    null,
    undefined,
    {},
    { scheduled_changes: [] },
    { scheduled_changes: "x" },
    { scheduled_changes: [{ field: "min_wage", effective_from: "2026-08-01" }] },
  ]) {
    assert.equal(scheduledMaxInsurableFrom(p), null);
  }
});
