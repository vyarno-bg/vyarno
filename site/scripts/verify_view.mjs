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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  officialBasketWeights,
  dataAge,
  payloadStatus,
  STALE_AFTER_DAYS,
  headlineRate,
  monthsSplit,
  pctAhead,
  savingsSince2020,
  housingCarveOut,
  basketBudget,
  clampSpendShare,
  exposedSpend,
  leftoverIfHeldAsCash,
  homePriceFor,
  clampTerm,
  mortgagePanel,
  verifyUrl,
  fastestRisingDivision,
  taxWedgePanel,
  systemWedgeLadder,
  payLadder,
  sofiaHomeAtAverageWage,
  seriesCells,
  quarterGrid,
  QUARTERS,
  payslipPanel,
  earnerRanks,
  sectorComparison,
  sectorOptions,
  SECTOR_TOTAL_KEY,
  sofiaGap,
  netsOf,
  convertPay,
  householdRaise,
  scheduledMaxInsurable,
  scheduledMaxInsurableFrom,
  rankedSplit,
  pocketVerdictState,
  answerLine,
  sofiaQuarter,
  RANK_ROWS_SHOWN,
  sharePayload,
  shareSentence,
  barCeiling,
  SHARE_FIELDS,
  SHARE_COPY_KEYS,
  SHARE_ORIGIN,
  SHARE_DOMAIN,
} from "../src/lib/view.js";
import { COPY } from "../src/lib/content.js";
import { ORIGIN as SITEMAP_ORIGIN } from "./gen-sitemap.mjs";
import {
  officialInflation,
  annuityPayment,
  composeLadder,
  buildLadder,
  percentile,
  bgNetSalary,
  payrollParams,
  contributions,
  personalInflationDetailed,
  BG_CONTRIB_LINES,
} from "../src/lib/mirror.js";
import { PAYLOADS } from "../src/lib/payloads.js";
import { published } from "./published-payload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = published;
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
  // The upper band compares two figures at one month, and Eurostat's flash
  // publishes the headline a month ahead of the divisions. While that is what
  // the payloads say — provably, via the index month and the payload's own
  // note — the gap is the release calendar and not a methodological one, and
  // there is no all-items rate at the divisions' month to band it against.
  // Everything above still holds: a flash widens this gap, it never closes it,
  // so the claim the copy rests on is the half that keeps its inputs.
  if (head.latest_index?.time !== head.ref_period) {
    assert.match(head.notes ?? "", /FLASH/, "the payloads are a month apart for no stated reason");
    return;
  }
  assert.ok(Math.abs(basketSum - official) <= 0.5, "…but it must stay inside the sanity band");
});

test("monthsSplit answers only when it has both months", () => {
  assert.equal(monthsSplit({ headlineMonth: "2026-07", basketMonth: "2026-06" }), true);
  assert.equal(monthsSplit({ headlineMonth: "2026-06", basketMonth: "2026-06" }), false);
  // A payload that did not load leaves one side empty, and "" !== "2026-06" is
  // true — which would put the split sentence, naming a month the page cannot
  // print, in front of a reader whose page is missing half its figures.
  assert.equal(monthsSplit({ headlineMonth: "", basketMonth: "2026-06" }), false);
  assert.equal(monthsSplit({ headlineMonth: "2026-07", basketMonth: "" }), false);
  assert.equal(monthsSplit({ headlineMonth: "", basketMonth: "" }), false);
});

test("the two surfaces that explain the gap agree about which months they have", () => {
  // The pages print the same pair of published months and draw the same
  // conclusion from them, so the comparison lives in one function. Two copies
  // of `a !== b` is how one of them ends up saying "both are for the same
  // latest month" during a flash while the other names two.
  const head = read("hicp_headline");
  const cats = read("hicp_categories");
  if (!head || !cats) return;
  const live = monthsSplit({
    headlineMonth: String(head.ref_period ?? ""),
    basketMonth: String(cats.categories?.[0]?.ref_period ?? ""),
  });
  assert.equal(
    live,
    head.ref_period !== cats.categories[0].ref_period,
    "monthsSplit disagrees with the published payloads about whether the " +
      "headline and the divisions describe one month"
  );
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
// figure carved out of it, being scaled to the whole spendable amount when the
// reader has said they spend less — whether they said it by typing thirteen
// euro amounts that fall short of their pay, or by stating one share of it.
// Point `spendBase` back at `spendable` in euro mode and the first four cases
// go red; drop the share out of the calculation and the four after them do.
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

test("in share mode a caller who states no share gets the whole spendable amount", () => {
  // Shares describe how a pot divides and carry no size, so the app has to
  // assume one — and every assumption below the whole spendable amount shrinks
  // the reader's headline € figure without their having claimed anything
  // (docs/principles.md P7). The parameter is optional for the same reason:
  // absent means unclaimed means all of it. A basket of 22/6/4 still does not
  // mean "€32 of my €1,250" — the leftover comes from the claim, never from
  // what the thirteen shares happen to add to.
  const b = basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable: 1250 });
  assert.equal(b.spendBase, 1250);
  assert.equal(b.leftover, 0);
  assert.equal(b.leftoverPerYear, 0);
  assert.equal(b.hasLeftover, false);
  // …and stating 100 explicitly is the same reader, not a different one.
  assert.deepEqual(
    basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable: 1250, spendSharePct: 100 }),
    b
  );
});

test("a stated spend share carves the € column out of that share and nothing else", () => {
  // €1,250 after housing, "I spend about 80% of it": the thirteen € figures and
  // everything downstream of them are drawn from €1,000, and the €250 becomes a
  // leftover the page can name. Point `spendBase` back at the full `spendable`
  // and the reader is charged for €250 they told us they do not spend.
  const b = basketBudget({
    spendMode: "pct",
    amounts: [22, 6, 4],
    spendable: 1250,
    spendSharePct: 80,
  });
  assert.equal(b.spendBase, 1000);
  assert.equal(b.leftover, 250);
  assert.equal(b.leftoverPct, 20);
  assert.equal(b.leftoverPerYear, 3000);
  assert.equal(b.hasLeftover, true);
  // A share cannot exceed the money it is a share of, so this branch can never
  // report over-allocation — that state needs thirteen typed euro amounts.
  assert.equal(b.over, 0);
});

test("the stated share moves the € column and leaves the shares alone", () => {
  // The division between the rows is the reader's; the size of what is being
  // divided is what the control sets. Halving the claim must halve every €
  // figure and change no row's share of the basket — that is the property that
  // keeps π off this control (mirror.js normalises by Σa).
  const amounts = [22, 6, 4];
  const full = basketBudget({ spendMode: "pct", amounts, spendable: 1250, spendSharePct: 100 });
  const half = basketBudget({ spendMode: "pct", amounts, spendable: 1250, spendSharePct: 50 });
  assert.equal(half.spendBase, full.spendBase / 2);
  amounts.forEach((a, i) => {
    const share = (x) => (x.spendBase * a) / amounts.reduce((s, y) => s + y, 0);
    assert.ok(near(share(half), share(full) / 2), `row ${i} did not follow the claim`);
  });
});

test("the spend share holds at both ends and refuses junk", () => {
  const at = (spendSharePct, spendable = 1250) =>
    basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable, spendSharePct });

  // 0% is a real answer — someone accounting for a month they spent nothing —
  // and it must not divide by anything or produce a negative leftover.
  assert.equal(at(0).spendBase, 0);
  assert.equal(at(0).leftover, 1250);
  assert.equal(at(0).leftoverPct, 100);
  assert.equal(at(100).leftover, 0);
  assert.equal(at(100).hasLeftover, false);

  // Out of range and unusable both land on 100. NaN is the app failing to read
  // an answer, and answering "you spend nothing" on the reader's behalf would
  // empty every € figure on the page (view.js#clampSpendShare).
  assert.equal(at(-30).spendBase, 0, "a negative claim was not clamped to nothing spent");
  assert.equal(at(130).spendBase, 1250, "a claim over 100% spent more than there is");
  assert.equal(at(NaN).spendBase, 1250);
  assert.equal(at(undefined).spendBase, 1250);

  // No salary yet: every figure is zero and none of them is NaN or negative.
  const broke = at(60, 0);
  assert.equal(broke.spendBase, 0);
  assert.equal(broke.leftover, 0);
  assert.equal(broke.leftoverPct, 0);
  assert.equal(broke.hasLeftover, false);
  assert.equal(at(60, -5).spendBase, 0);
});

test("the euro mode ignores the stated share — its remainder is measured", () => {
  // The design decision this pins: only one of the two remainders is ever live.
  // In € mode the leftover is derived from thirteen amounts the reader typed,
  // and honouring a stated claim on top of it would put two answers to "how
  // much do you not spend" on one page, free to disagree. The control is not
  // rendered in this mode; this is what makes that a guarantee rather than a
  // property of the markup.
  const measured = basketBudget({ spendMode: "eur", amounts: [600, 300, 100], spendable: 1250 });
  for (const spendSharePct of [0, 40, 100, NaN]) {
    assert.deepEqual(
      basketBudget({ spendMode: "eur", amounts: [600, 300, 100], spendable: 1250, spendSharePct }),
      measured,
      `a stated share of ${spendSharePct} reached the euro mode's measured remainder`
    );
  }
});

test("clampSpendShare answers with a share, or with the neutral claim", () => {
  assert.equal(clampSpendShare(72), 72);
  assert.equal(clampSpendShare(0), 0);
  assert.equal(clampSpendShare(100), 100);
  assert.equal(clampSpendShare(-1), 0);
  assert.equal(clampSpendShare(101), 100);
  // `+val` on an empty or non-numeric field, and the two infinities.
  assert.equal(clampSpendShare(NaN), 100);
  assert.equal(clampSpendShare(Infinity), 100);
  assert.equal(clampSpendShare(-Infinity), 100);
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

test("exposedSpend follows a stated share the same way it follows typed euros", () => {
  // The headline «≈ €X повече всеки месец» is the figure the whole control
  // exists to correct, and it is the one number a reader quotes. €2,000 pay,
  // €450 rent, "I spend about 70% of what's left": prices apply to the €450 of
  // housing plus €1,085 of basket, not to the whole €2,000. The two ways of
  // saying "I don't spend everything" have to reach it identically — a euro
  // basket of €1,085 against the same pay gives the same €1,535 below.
  const { housingCost, spendable } = housingCarveOut({
    salary: 2000,
    homeOn: false,
    monthlyMortgage: 0,
    rent: 450,
  });
  const stated = basketBudget({
    spendMode: "pct",
    amounts: [22, 6, 4],
    spendable,
    spendSharePct: 70,
  });
  assert.equal(exposedSpend({ housingCost, spendBase: stated.spendBase }), 1535);
  const typed = basketBudget({ spendMode: "eur", amounts: [700, 285, 100], spendable });
  assert.equal(
    exposedSpend({ housingCost, spendBase: typed.spendBase }),
    exposedSpend({ housingCost, spendBase: stated.spendBase }),
    "the stated and the measured routes to the same spending disagree"
  );
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
  const panel = taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [] } });
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
    pay: { basis: "net", amounts: [] },
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

  const panel = taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [net] } });
  assert.equal(panel.earners.length, 1, "no earner point was produced for a positive salary");
  const [you] = panel.earners;
  assert.ok(
    near(you.gross, grossOverCap, 0.01),
    `placed the earner at ${you.gross} instead of ${grossOverCap}`
  );
  assert.equal(you.overCap, true, "the earner was placed below a cap they are over");
  assert.ok(near(you.marginalPct, 10, 1e-9), you.marginalPct);
  // With one earner the corner figure is that earner's own rate, unchanged
  // from before households existed.
  assert.ok(near(panel.headlineEffectivePct, you.effectivePct, 1e-9));
});

test("taxWedgePanel says nothing about a user who has typed nothing", () => {
  // P7: no unsourced default. An empty salary field must not silently render
  // someone at the median, or at zero.
  for (const v of [0, -100, NaN, undefined, null]) {
    const panel = taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [v] } });
    assert.deepEqual(panel.earners, [], String(v));
    assert.equal(panel.headlineEffectivePct, null, String(v));
  }
  assert.deepEqual(
    taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [] } }).earners,
    []
  );
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
  const panel = payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [net] } });
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
  assert.equal(panel.earners.length, 1);
  assert.equal(panel.earners[0].index, 0);
});

test("payslipPanel reads the rates and the ceiling out of the PUBLISHED payload", () => {
  if (!PAYROLL) return;
  const panel = payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [2100] } });
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
    pay: { basis: "net", amounts: [2100] },
  });
  assert.ok(near(raised.maxInsurable, 4000, 1e-9), "the ceiling is hardcoded, not read");
  assert.equal(
    raised.anyCapped,
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
    pay: { basis: "net", amounts: [2100] },
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
    const p = payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [net] } });
    const sum = p.earners[0].lines.reduce((a, l) => a + l.amount, 0);
    assert.ok(
      near(sum, p.insurance, 1e-9),
      `net ${net}: rows sum to ${sum.toFixed(2)}, total says ${p.insurance}`
    );
    assert.deepEqual(
      p.earners[0].lines.map((l) => l.key),
      [...BG_CONTRIB_LINES],
      `net ${net}: a published contribution line is missing from the breakdown`
    );
  }
});

test("payslipPanel says nothing about a user who has typed nothing", () => {
  // P7 again: an empty field must not render a column of zeroes for the
  // reader to check. There is no payslip for a salary nobody typed.
  for (const v of [0, -100, NaN, undefined, null, ""]) {
    assert.equal(
      payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [v] } }),
      null,
      String(v)
    );
  }
  assert.equal(
    payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [] } }),
    null,
    "empty list"
  );
  assert.equal(
    payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: undefined } }),
    null,
    "no list at all"
  );
});

test("payslipPanel degrades to the offline sentinel rather than crashing", () => {
  // First paint, before payroll.json resolves.
  const p = payslipPanel({ payroll: null, pay: { basis: "net", amounts: [2100] } });
  assert.ok(p && p.gross > 0 && p.earners[0].lines.length === 5);
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

// --- the plain answer ------------------------------------------------------

test("pocketVerdictState keeps «точно» to the one case that cancels exactly", () => {
  // The ±1 pp dead zone has three insides, and one verdict over all three
  // prints «точно на нула» beside a figure reading «−0,3%». Two surfaces read
  // these states now — the pocket row and the answer block — so a threshold
  // that moves here moves in both, which is the whole reason it is one
  // function.
  assert.equal(pocketVerdictState(6, 2), "ahead");
  assert.equal(pocketVerdictState(2, -2), "behind");
  assert.equal(pocketVerdictState(5, 0), "level");
  assert.equal(pocketVerdictState(5, 0.4), "nearUp");
  assert.equal(pocketVerdictState(5, -0.4), "nearDn");
  // The boundaries belong to the decided verdicts, not to the dead zone.
  assert.equal(pocketVerdictState(6, 1), "ahead");
  assert.equal(pocketVerdictState(4, -1), "behind");
});

test("pocketVerdictState reads a pay cut and a frozen wage as their own states", () => {
  // «Увеличението е изядено» is the wrong sentence for someone who never got
  // one, and for someone whose pay fell there was no raise to eat. Both are
  // reachable: the field takes any number.
  assert.equal(pocketVerdictState(0, -5), "none");
  assert.equal(pocketVerdictState(-3, -8), "cut");
  // …and a cut is a cut even where prices fell faster than the pay did.
  assert.equal(pocketVerdictState(-3, 2), "cut");
  for (const [raise, pocket] of [
    [NaN, NaN],
    [NaN, 3],
    [3, NaN],
  ]) {
    assert.equal(pocketVerdictState(raise, pocket), "unsaid");
  }
});

test("the plain answer ranks nobody who has not typed a salary", () => {
  // The ladder is a claim about the READER, in the second person. A visitor on
  // €2,400 told on arrival that they out-earn a third of Sofia has been told
  // something false about themselves before typing a character, and no caveat
  // rescues it — the rule `PercentileRow` keeps in its corner. The answer block
  // sits a screen ABOVE that row, so it has to keep the same rule or the defect
  // simply moves up the page.
  const ranks = [{ ahead: 34 }];
  const untouched = answerLine({ salaryAnswered: false, ranks, ranked: [] });
  assert.equal(untouched.stand.state, "unsaid");
  assert.equal(untouched.stand.low, 0);

  const answered = answerLine({ salaryAnswered: true, ranks, ranked: [] });
  assert.equal(answered.stand.state, "one");
  assert.equal(answered.stand.low, 34);
});

test("the plain answer states a household's position as a range", () => {
  // The rungs are individual full-time earnings, so there is no single
  // position for a household to occupy and no non-arbitrary way to pick one
  // earner to speak for it. «Пред 34-62%» is true about where these people
  // sit; any single figure in that sentence is not.
  const many = answerLine({
    salaryAnswered: true,
    ranks: [{ ahead: 62 }, { ahead: 34 }, { ahead: 51 }],
    ranked: [],
  });
  assert.equal(many.stand.state, "many");
  assert.equal(many.stand.low, 34);
  assert.equal(many.stand.high, 62);
});

test("the plain answer names movers out of the reader's own basket", () => {
  // A division the reader spends nothing on contributes nothing to their
  // number, so naming it as what is rising fastest describes somebody else's
  // life — and the whole card is about theirs.
  const div = (name) => ({ bg_name: name, en_name: name });
  const ranked = [
    { division: div("not mine"), rate: 40, share: 0 },
    { division: div("transport"), rate: 11, share: 0.2 },
    { division: div("food"), rate: 4, share: 0.3 },
    { division: div("phones"), rate: -5, share: 0.1 },
  ];
  const answer = answerLine({ salaryAnswered: true, ranked });
  assert.equal(answer.mover.up.division.bg_name, "transport");
  assert.equal(answer.mover.up.ratePct, 11);
  assert.equal(answer.mover.down.division.bg_name, "phones");
});

test("the plain answer invents no mover where the basket has none", () => {
  // Both directions are sign-gated. A basket where nothing fell must not be
  // handed its least-bad row as a saving, and one where nothing rose must not
  // be told what rose fastest — «поевтинява: транспорт (+4,0%)» is a false
  // sentence built out of correct arithmetic.
  const div = (name) => ({ bg_name: name, en_name: name });
  const allUp = answerLine({
    ranked: [
      { division: div("food"), rate: 4, share: 0.5 },
      { division: div("rent"), rate: 2, share: 0.5 },
    ],
  });
  assert.ok(allUp.mover.up);
  assert.equal(allUp.mover.down, null);

  const allDown = answerLine({
    ranked: [
      { division: div("phones"), rate: -5, share: 0.5 },
      { division: div("tech"), rate: -7, share: 0.5 },
    ],
  });
  assert.equal(allDown.mover.up, null);
  assert.equal(allDown.mover.down.division.bg_name, "tech");

  const empty = answerLine({});
  assert.equal(empty.mover.up, null);
  assert.equal(empty.mover.down, null);
  assert.equal(empty.stand.state, "unsaid");
  assert.equal(empty.pay.state, "unsaid");
});

test("the plain answer takes its pay verdict from the same states as the row", () => {
  // Two ladders of thresholds a screen apart drift silently: the summary
  // calling a raise ahead while the row below calls it level, over a number
  // neither of them moved. This asserts they are one function rather than two
  // that happen to agree today.
  for (const [raise, pocket] of [
    [6, 2],
    [2, -2],
    [5, 0.4],
    [0, -5],
    [-3, 1],
    [NaN, NaN],
  ]) {
    assert.equal(
      answerLine({ raise, pocket }).pay.state,
      pocketVerdictState(raise, pocket),
      `the answer block decided ${raise}/${pocket} for itself`
    );
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

// ---------------------------------------------------------------------------
// THE HOUSEHOLD — which figures describe a person, and which describe money
//
// The rule the four blocks below hold: a figure about a PERSON is computed per
// earner and never from the total, and a figure about MONEY is computed from
// the total and never from one earner. Getting it backwards is wrong in a way
// that reads perfectly: nothing on the page looks broken when a couple's
// combined pay is ranked against individual earnings, it just says something
// false about them.
// ---------------------------------------------------------------------------

test("payslipPanel adds the households's columns AFTER taxing each contract", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const each = bgNetSalary(2000, params).net;
  const panel = payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [each, each] } });

  assert.equal(panel.earners.length, 2);
  assert.ok(
    near(panel.gross, 4000, 0.02),
    `the household's gross came to ${panel.gross}, not the 4000 they contracted for`
  );
  // The panel takes no scalar, so the only way to express the wrong answer is
  // to compute it elsewhere and pass it in as a household of one. That is what
  // this compares against, and it is the number a single-salary calculator
  // gives a couple who add their payslips up first.
  const asOne = payslipPanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [each * 2] } });
  assert.ok(
    panel.gross - asOne.gross > 200,
    `the household treatment recovered only ${(panel.gross - asOne.gross).toFixed(2)}`
  );

  // Each earner still carries the ceiling and the rate year, so the row that
  // draws one payslip needs no second prop to stay correct.
  for (const e of panel.earners) {
    assert.ok(near(e.maxInsurable, PAYROLL.max_insurable_income_eur, 1e-9));
    assert.equal(e.effectiveYear, PAYROLL.effective_year);
  }
});

test("taxWedgePanel marks every earner, and states the household's own rate", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const big = bgNetSalary(params.maxInsurable + 700, params).net;
  const small = bgNetSalary(800, params).net;
  const panel = taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [big, small] } });

  assert.equal(panel.earners.length, 2, "an earner was dropped off the curve");
  assert.equal(panel.earners[0].overCap, true);
  assert.equal(panel.earners[1].overCap, false);
  assert.deepEqual(
    panel.earners.map((e) => e.index),
    [0, 1]
  );

  // The corner figure is pay-weighted, not the average of the two lines under
  // it. A marker at their COMBINED gross would also stand where nobody in the
  // household does, which is why there is no such marker to test for.
  const mean = (panel.earners[0].effectivePct + panel.earners[1].effectivePct) / 2;
  assert.ok(
    Math.abs(panel.headlineEffectivePct - mean) > 0.1,
    `the household rate (${panel.headlineEffectivePct.toFixed(3)}) is the plain ` +
      `average of its earners (${mean.toFixed(3)})`
  );
  assert.ok(
    panel.householdGross > panel.earners[0].gross,
    "the stated household gross is not the whole household"
  );
});

test("earnerRanks ranks PEOPLE, never the household total", () => {
  const ladder = buildLadder(read("salary_dist"), 1915, payrollParams(PAYROLL));
  if (!ladder.length) return;

  const [one] = earnerRanks({ nets: [900], ladder });
  const both = earnerRanks({ nets: [900, 900], ladder });
  assert.equal(both.length, 2, "a household got one rank instead of one each");
  assert.equal(both[0].ahead, one.ahead, "adding a partner moved the first earner's rank");
  assert.equal(both[1].ahead, one.ahead, "two equal earners were ranked differently");

  // The failure this replaces: ranking €1,800 against a ladder of individual
  // earnings. It is a strictly higher position, and it is nobody's.
  const [asOne] = earnerRanks({ nets: [1800], ladder });
  assert.ok(
    asOne.ahead > one.ahead,
    "test premise: the combined figure would rank higher than either earner"
  );

  // Blanks keep their place in the numbering — the row says «доход 2».
  const skipped = earnerRanks({ nets: [null, 1200], ladder });
  assert.deepEqual(
    skipped.map((r) => r.index),
    [1]
  );
  assert.deepEqual(earnerRanks({ nets: [900], ladder: [] }), [], "ranked against no ladder");
});

test("sofiaGap compares each earner with the average WAGE, one at a time", () => {
  const sofiaNet = 1486;
  const both = sofiaGap({ nets: [900, 900], sofiaNet });
  assert.equal(both.length, 2);
  assert.equal(both[0].direction, "below");
  assert.equal(both[0].magnitudePct, 39);
  // The claim this prevents: two people on €900 each reported as above the
  // average worker, which is what measuring their €1,800 against a wage says.
  const asOne = sofiaGap({ nets: [1800], sofiaNet })[0];
  assert.equal(asOne.direction, "above");

  // The magnitude is rounded BEFORE the direction is chosen, so the word and
  // the figure cannot disagree. At +1.4% the rounded figure is 1%, which is
  // inside the dead zone the direction words exist to stay quiet about.
  const edge = sofiaGap({ nets: [sofiaNet * 1.014], sofiaNet })[0];
  assert.equal(edge.magnitudePct, 1);
  assert.equal(edge.direction, "equal", "«над» printed beside a figure inside the dead zone");

  assert.deepEqual(sofiaGap({ nets: [900], sofiaNet: 0 }), [], "compared against no average");
  assert.deepEqual(sofiaGap({ nets: [0, null], sofiaNet }), []);
});

// ---------------------------------------------------------------------------
// NET OR GROSS — one conversion point, and a toggle that moves no result
// ---------------------------------------------------------------------------

test("netsOf is the ONE place a gross becomes a net", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  assert.deepEqual(netsOf({ basis: "net", amounts: [900, 1200] }, PAYROLL), [900, 1200]);

  const gross = [2000, 1350];
  const asNet = netsOf({ basis: "gross", amounts: gross }, PAYROLL);
  assert.deepEqual(
    asNet,
    gross.map((g) => bgNetSalary(g, params).net)
  );
  // Everything downstream of this is a statement about take-home. Handing it a
  // gross would understate the rent burden, inflate the basket, and — the one
  // that AGENTS.md forbids in as many words — raise the 30%-of-net mortgage
  // line by about a third.
  assert.ok(asNet[0] < gross[0] * 0.82, `€${gross[0]} gross came back as €${asNet[0]} net`);

  // A blank stays blank in its own position, so the earner numbering downstream
  // still lines up with the fields on screen.
  assert.deepEqual(netsOf({ basis: "net", amounts: [900, null, 0, 1200] }, PAYROLL), [
    900,
    null,
    null,
    1200,
  ]);
  assert.deepEqual(netsOf(undefined, PAYROLL), []);
});

test("flipping the basis converts in place, so no result on the page moves", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const net = [900, 1350];
  const asGross = convertPay({ basis: "net", amounts: net }, PAYROLL);

  // The figure in the box changes...
  assert.ok(asGross[0] > net[0], "the net was not converted to a gross");
  // ...and what the page is computed from does not.
  const back = netsOf({ basis: "gross", amounts: asGross }, PAYROLL);
  for (let i = 0; i < net.length; i += 1) {
    assert.ok(
      near(back[i], net[i], 0.01),
      `€${net[i]} net → €${asGross[i]} gross → €${back[i]} net: the toggle moved the reader's pay`
    );
  }

  // Rounded to the cent, because it lands in a field the reader types over.
  for (const g of asGross) assert.equal(g, Math.round(g * 100) / 100);
  // And it is a real inversion, not a fixed multiplier: a gross over the
  // ceiling keeps more of the next euro, so the ratio is not the same at both
  // ends of the range.
  const low = convertPay({ basis: "net", amounts: [700] }, PAYROLL)[0] / 700;
  const high = convertPay({ basis: "net", amounts: [4000] }, PAYROLL)[0] / 4000;
  assert.ok(low > high, `the conversion is a flat ${low.toFixed(4)}× at every salary`);
  assert.ok(near(bgNetSalary(asGross[0], params).net, net[0], 0.01));
});

test("householdRaise answers only when every income has answered", () => {
  if (!PAYROLL) return;
  const pay = { basis: "net", amounts: [1000, 1000] };

  const full = householdRaise({ pay, raises: [20, 0], payroll: PAYROLL });
  assert.deepEqual(full.missing, []);
  assert.ok(near(full.pct, 9.0909, 1e-3), full.pct);

  // A blank is not a zero. The figure withholds itself AND the row is told
  // which income to name — the two have to agree, or the page prints a prompt
  // naming nobody beside a figure that never arrives.
  const partial = householdRaise({ pay, raises: [20, null], payroll: PAYROLL });
  assert.ok(Number.isNaN(partial.pct), partial.pct);
  assert.deepEqual(partial.missing, [{ index: 1, ordinal: 2 }]);

  // An earner with no PAY is not owed a raise: an empty second field must not
  // silence the first one's answer.
  const oneTyped = householdRaise({
    pay: { basis: "net", amounts: [1000, null] },
    raises: [10, NaN],
    payroll: PAYROLL,
  });
  assert.deepEqual(oneTyped.missing, []);
  assert.ok(near(oneTyped.pct, 10, 1e-9));
});

// ---------------------------------------------------------------------------
// SHARE — docs/principles.md P2
// ---------------------------------------------------------------------------

/** A basket whose leading division is transport, at a plausible pair of rates. */
const SHARE_RANKED = [
  { division: { bg_name: "Транспорт", en_name: "Transport" }, contributionPp: 1.62 },
  { division: { bg_name: "Храна", en_name: "Food" }, contributionPp: 1.1 },
];

const shareArgs = (over = {}) => ({
  pi: 7.24,
  official: 5.2,
  near: false,
  anchor: "y1",
  ranked: SHARE_RANKED,
  refPeriod: "2026-06",
  ...over,
});

test("sharePayload carries only the closed set of fields", () => {
  const share = sharePayload(shareArgs());

  // The list is the review surface: a field added to the payload without being
  // added to SHARE_FIELDS lands here, which is where P2 gets argued rather
  // than after a picture is in somebody's chat.
  assert.deepEqual(
    Object.keys(share).sort(),
    [...SHARE_FIELDS].sort(),
    "a share surface grew a field nobody signed off"
  );

  // Every value is a primitive. An object would carry whatever else is hanging
  // off it — `ranked[0]` alone brings `eurPerMonth` and `spendEur`, and
  // rendering one of those is a one-word mistake in a template.
  for (const [key, value] of Object.entries(share)) {
    assert.ok(
      value === null || typeof value !== "object",
      `share.${key} is an object, so it carries fields nothing here has checked`
    );
  }
});

test("sharePayload cannot be handed a salary", () => {
  // The guarantee is the signature, not an assertion downstream of it:
  // `mirror.js#extraPerMonth` is salary × r/(100+r) and inverts exactly, so a
  // function that never receives the salary cannot leak one however it is
  // called. Break it by adding a `salary` parameter and this goes red.
  const source = readFileSync(join(HERE, "..", "src", "lib", "view.js"), "utf8");
  const signature = /export function sharePayload\(\{([^}]*)\}/.exec(source);
  assert.ok(signature, "sharePayload no longer takes a destructured object");
  const params = signature[1]
    .split(",")
    .map((p) => p.split("=")[0].trim())
    .filter(Boolean);
  assert.deepEqual(params, ["pi", "official", "near", "anchor", "ranked", "refPeriod"]);

  // And the money words are absent from what it returns, whatever it was fed.
  const share = sharePayload(shareArgs());
  assert.ok(!/salary|net|eur|€/i.test(JSON.stringify(share)), JSON.stringify(share));
});

test("the share verdict is the results card's verdict, not a second opinion", () => {
  // `near` is the caller's, so the picture and the sentence above it cannot
  // reach opposite conclusions about one basket. Recompute it here and the two
  // drift the first time the band moves.
  assert.equal(sharePayload(shareArgs({ near: true })).verdict, "close");
  assert.equal(sharePayload(shareArgs({ near: false })).verdict, "dearer");
  assert.equal(sharePayload(shareArgs({ pi: 3.1, near: false })).verdict, "cheaper");
  // A basket weighted onto the groups that are falling is negative, and still
  // ranks against the average rather than against zero.
  assert.equal(sharePayload(shareArgs({ pi: -1.2, near: false })).verdict, "cheaper");
});

test("sharePayload withholds itself when nothing has been measured", () => {
  assert.equal(sharePayload(shareArgs({ pi: NaN })), null);
  assert.equal(sharePayload(shareArgs({ official: NaN })), null);
  // An empty basket has no leading division, and the card drops the line
  // rather than drawing «Най-тежко удря:» with nothing after it.
  const empty = sharePayload(shareArgs({ ranked: [] }));
  assert.equal(empty.topBgName, "");
  assert.ok(Number.isNaN(empty.topPp));
});

test("no share sentence carries a currency, in either language", () => {
  // The closed list names this case outright: «any € absolute on a shareable
  // image beside the percentage it inverts». Checked at every anchor and every
  // verdict, because one variant is all it takes.
  const anchors = ["y1", 2020, 2023];
  const verdicts = [
    { near: true },
    { near: false },
    { pi: 3.1, near: false },
    { pi: -1.2, near: false },
  ];
  for (const anchor of anchors) {
    for (const over of verdicts) {
      for (const lang of ["bg", "en"]) {
        const share = sharePayload(shareArgs({ anchor, ...over }));
        const sentence = shareSentence({ share, copy: COPY, lang });
        // Lookarounds, not `\b`: JavaScript's word boundary is defined over
        // ASCII, so it does nothing either side of Cyrillic, and a plain
        // substring test flags «Евростат» for containing «евро». The source
        // name has to stay sayable — P9 puts it on the surfaces that cannot
        // carry a link.
        assert.doesNotMatch(
          sentence,
          /€|(?<!\p{L})(EUR|евро|лв)(?!\p{L})/iu,
          `${lang} @ ${anchor}: ${sentence}`
        );
        assert.doesNotMatch(sentence, /[{}]/, `unsubstituted placeholder: ${sentence}`);
        assert.ok(sentence.includes(SHARE_ORIGIN), `no way back to the site: ${sentence}`);
      }
    }
  }
});

test("the share sentence speaks the reader's own numbers in their own locale", () => {
  const share = sharePayload(shareArgs());
  // A decimal comma in BG and a point in EN — the reader is sending this on,
  // so it has to read as their language writes numbers.
  assert.match(shareSentence({ share, copy: COPY, lang: "bg" }), /7,2%/);
  assert.match(shareSentence({ share, copy: COPY, lang: "en" }), /7\.2%/);
  // The national figure travels with it. A lone personal rate is the number
  // nobody can place, and placing it is the whole point of sending it.
  assert.match(shareSentence({ share, copy: COPY, lang: "bg" }), /5,2%/);
  assert.equal(shareSentence({ share: null, copy: COPY, lang: "bg" }), "");
});

test("every COPY key the share text needs exists", () => {
  const missing = SHARE_COPY_KEYS.filter((key) => !COPY[key]?.bg || !COPY[key]?.en);
  assert.deepEqual(missing, [], `share copy keys missing a language: ${missing.join(", ")}`);
});

test("the share link is the address the sitemap publishes", () => {
  // Two constants naming the same site is one constant and one guess. The
  // sitemap's is the canonical one; this is what a stranger reads off a
  // picture, and they have to be the same place.
  assert.equal(SHARE_ORIGIN, SITEMAP_ORIGIN);
  assert.equal(SHARE_ORIGIN, `https://${SHARE_DOMAIN}`);
});

test("the comparison bars are scaled against one ceiling, with a floor", () => {
  // Without the floor, a basket that rose 0.4% against an official 0.3% fills
  // the track edge to edge and reads as a catastrophe.
  assert.equal(barCeiling({ piPct: 0.4, officialPct: 0.3, anchor: "y1" }), 8);
  // Above the floor the taller of the pair sets the scale, so the two bars are
  // a comparison rather than two independent drawings.
  assert.equal(barCeiling({ piPct: 12, officialPct: 5.2, anchor: "y1" }), 12);
  // At a year anchor the cumulative figures are large enough that a fixed
  // floor of 8 would flatten them, so the floor is relative to the official
  // rise instead.
  assert.equal(barCeiling({ piPct: 30, officialPct: 41, anchor: 2020 }), 41 * 1.35);
  // Never zero: a ceiling of zero divides every bar width into infinity.
  assert.equal(barCeiling({ piPct: NaN, officialPct: NaN, anchor: "y1" }), 8);
  assert.equal(barCeiling({ piPct: 0, officialPct: 0, anchor: 2020 }), 1);
});

// ---------------------------------------------------------------------------
// THE COUNTRY, WITH NOBODY IN IT
//
// The four values `/how/` renders. What they have in common is the property
// that page is built on: each takes published payloads and no scalar a reader
// could have typed, so the wrong wiring — a personal figure on a page with no
// reader — is not expressible rather than merely untested.
// ---------------------------------------------------------------------------

test("systemWedgeLadder reads the ceiling and the rates out of the PUBLISHED payload", () => {
  if (!PAYROLL) return;
  const ladder = systemWedgeLadder({ payroll: PAYROLL });
  assert.ok(
    near(ladder.maxInsurable, PAYROLL.max_insurable_income_eur, 1e-9),
    "the ladder's ceiling is not payroll.json's"
  );
  assert.ok(
    near(ladder.incomeTaxRatePct, 100 * PAYROLL.income_tax_rate, 1e-9),
    "the flat tax rate is not payroll.json's"
  );
  assert.ok(
    near(ladder.contributionRatePct, 100 * PAYROLL.employee_contrib_rates.total, 1e-9),
    "the contribution rate is not payroll.json's"
  );
  // And it genuinely follows the payload rather than closing over the offline
  // default, which carries the same figures today.
  const raised = systemWedgeLadder({ payroll: { ...PAYROLL, max_insurable_income_eur: 3000 } });
  assert.ok(near(raised.maxInsurable, 3000, 1e-9), "the ceiling is hardcoded, not read");
  assert.ok(
    raised.rungs.some((r) => r.gross === 3000 && r.atCeiling),
    "a moved ceiling did not move the rung that marks it"
  );
});

test("the wedge ladder always has a rung ON the ceiling, and it is the peak", () => {
  // The curve's only kink is at the ceiling: below it the effective rate is
  // constant, above it every further euro is taxed at less than the average so
  // far. A table sampled at round numbers alone steps over that and describes a
  // straight line — the same reason `mirror.js#bgTaxWedge` forces the cap into
  // its own sample.
  if (!PAYROLL) return;
  const ladder = systemWedgeLadder({ payroll: PAYROLL, grossLevels: [1000, 5000] });
  const marked = ladder.rungs.filter((r) => r.atCeiling);
  assert.equal(marked.length, 1, "the ceiling is not a rung of its own");
  assert.equal(marked[0].gross, ladder.maxInsurable);
  const peak = Math.max(...ladder.rungs.map((r) => r.effectivePct));
  assert.ok(
    near(marked[0].effectivePct, peak, 1e-9),
    `the rung at the ceiling takes ${marked[0].effectivePct}% where the ` +
      `steepest rung takes ${peak}% — the peak of the curve is not at the kink`
  );
  // Sorted, so the table reads as a curve rather than as a set.
  const grosses = ladder.rungs.map((r) => r.gross);
  assert.deepEqual(
    grosses,
    [...grosses].sort((a, b) => a - b)
  );
});

test("the wedge ladder's share falls above the ceiling and its parts add up", () => {
  // The finding the section exists to show, and the one a reader checks by
  // adding two columns: net + taken = gross, on every rung.
  if (!PAYROLL) return;
  const ladder = systemWedgeLadder({ payroll: PAYROLL, grossLevels: [1000, 5000] });
  for (const rung of ladder.rungs) {
    assert.ok(
      near(rung.net + rung.deductions, rung.gross, 1e-6),
      `at €${rung.gross} the table's own columns do not add up`
    );
  }
  const low = ladder.rungs.find((r) => r.gross === 1000);
  const high = ladder.rungs.find((r) => r.gross === 5000);
  assert.ok(
    high.effectivePct < low.effectivePct,
    `the effective rate at €5,000 (${high.effectivePct}%) is not below the one ` +
      `at €1,000 (${low.effectivePct}%) — the ceiling has stopped biting`
  );
  assert.ok(
    high.marginalPct < low.marginalPct,
    "the marginal rate above the ceiling is not below the one under it"
  );
});

test("payLadder pairs each rung with its cut, and says which were surveyed", () => {
  const dist = read("salary_dist");
  const wage = read("sofia_salary");
  if (!dist || !wage || !PAYROLL) return;
  const ladder = payLadder({ salaryDist: dist, sofiaSalary: wage, payroll: PAYROLL });

  assert.equal(ladder.rungs.length, 11, "the ladder no longer has one row per published cut");
  assert.deepEqual(
    ladder.rungs.map((r) => r.cut),
    [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99],
    "the cuts are out of order or out of step with the published ladder"
  );
  // Monotonic in both columns: a table where a higher rung pays less is a
  // re-levelling that went wrong, and it looks entirely ordinary.
  for (let i = 1; i < ladder.rungs.length; i += 1) {
    assert.ok(ladder.rungs[i].gross > ladder.rungs[i - 1].gross, "the gross rungs are not rising");
    assert.ok(ladder.rungs[i].net > ladder.rungs[i - 1].net, "the net rungs are not rising");
    assert.ok(ladder.rungs[i].net < ladder.rungs[i].gross, "a net rung is not below its gross");
  }

  // SES publishes three points for BG. Everything else is interpolated, and
  // the page has to be able to say so per row — a table that called every rung
  // surveyed would present eight interpolations as measurements.
  assert.deepEqual(
    ladder.rungs.filter((r) => r.surveyed).map((r) => r.cut),
    [10, 50, 90],
    "the surveyed rungs are not D1, the median and D9"
  );
});

test("payLadder takes each provenance from the publisher that owns it", () => {
  // The level's URL and period come from the НСИ payload and the shape's from
  // the Eurostat one. Reading them crosswise would put НСИ's provenance on a
  // Eurostat figure, which is the page-side version of the defect
  // `no НСИ payload carries a second publisher's figures` prevents in the data.
  const dist = read("salary_dist");
  const wage = read("sofia_salary");
  if (!dist || !wage || !PAYROLL) return;
  const ladder = payLadder({ salaryDist: dist, sofiaSalary: wage, payroll: PAYROLL });
  assert.equal(ladder.anchorUrl, wage.source_url);
  assert.equal(ladder.anchorPeriod, wage.ref_period);
  assert.equal(ladder.anchorGross, wage.value);
  assert.equal(ladder.shapeUrl, dist.shape.source_url);
  assert.equal(ladder.shapeYear, String(dist.shape.ref_year));

  // Nothing at all rather than a ladder standing on a zero anchor: without the
  // НСИ level the rungs would be SES's 2022 euro amounts wearing this
  // quarter's date.
  const orphaned = payLadder({ salaryDist: dist, sofiaSalary: null, payroll: PAYROLL });
  assert.equal(orphaned.anchorGross, 0);
  assert.deepEqual(
    orphaned.rungs.map((r) => r.gross),
    new Array(11).fill(0),
    "the ladder was re-levelled onto nothing and printed numbers anyway"
  );
});

test("sofiaHomeAtAverageWage prices a home against a NET wage, not a gross", () => {
  // Fed the gross, the years-of-salary figure is about a fifth too flattering
  // — the direction AGENTS.md forbids by name, on the one figure the page
  // exists to state plainly.
  const price = read("sofia_price");
  const wage = read("sofia_salary");
  if (!price || !wage || !PAYROLL) return;
  const home = sofiaHomeAtAverageWage({
    sofiaPrice: price,
    sofiaSalary: wage,
    payroll: PAYROLL,
    m2: 70,
  });
  assert.equal(home.eurPerM2, price.eur_per_m2_median);
  assert.equal(home.grossMonthly, wage.value);
  assert.equal(home.wagePeriod, wage.ref_period);
  assert.ok(
    home.netMonthly < home.grossMonthly,
    "the wage the home is priced against was not converted to net"
  );
  assert.ok(near(home.price, price.eur_per_m2_median * 70, 1e-9));
  assert.ok(
    near(home.years, home.price / (12 * home.netMonthly), 1e-9),
    "the years figure is not the price over a year of that take-home"
  );

  // The size is the caller's, so the page has to state it — a function that
  // picked its own would let a price be printed without saying what it prices.
  const smaller = sofiaHomeAtAverageWage({
    sofiaPrice: price,
    sofiaSalary: wage,
    payroll: PAYROLL,
    m2: 50,
  });
  assert.ok(smaller.price < home.price && smaller.years < home.years);
});

test("sofiaHomeAtAverageWage prints nothing when either end is missing", () => {
  const wage = read("sofia_salary");
  if (!wage || !PAYROLL) return;
  const noPrice = sofiaHomeAtAverageWage({
    sofiaPrice: null,
    sofiaSalary: wage,
    payroll: PAYROLL,
    m2: 70,
  });
  assert.equal(noPrice.price, 0);
  assert.equal(noPrice.years, 0);
  const noWage = sofiaHomeAtAverageWage({
    sofiaPrice: read("sofia_price"),
    sofiaSalary: null,
    payroll: PAYROLL,
    m2: 70,
  });
  assert.equal(noWage.netMonthly, 0);
  assert.equal(noWage.years, 0, "a home was priced in years of a wage nobody published");
});

test("seriesCells selects published cells, in order, and computes nothing", () => {
  // НСИ's licence forbids distributing производни и сборни произведения, so
  // the quarterly wage series may be shown cell by cell and may not be
  // averaged, rebased or differenced on the way to the screen. There is no
  // argument here through which a caller could ask for any of that.
  const cells = seriesCells({
    series_by_period: { "2021-Q1": 2, "2020-Q3": 1, "2020-Q1": 0, bad: "x" },
  });
  assert.deepEqual(cells, [
    { period: "2020-Q1", value: 0 },
    { period: "2020-Q3", value: 1 },
    { period: "2021-Q1", value: 2 },
  ]);
  assert.deepEqual(seriesCells(null), []);
  assert.deepEqual(seriesCells({}), []);

  // Against the real payload: every cell on the page is one НСИ published,
  // unchanged.
  const wage = read("sofia_salary");
  if (!wage) return;
  const published = wage.series_by_period;
  const rendered = seriesCells(wage);
  assert.equal(rendered.length, Object.keys(published).length);
  for (const { period, value } of rendered) {
    assert.equal(value, published[period], `${period} was changed on the way to the page`);
  }
});

test("quarterGrid lays the same cells out a year to a row, and combines nothing", () => {
  // Layout, not arithmetic. The row is four published cells side by side; the
  // fifth column a reader would expect at the end of it — the year's average —
  // is exactly what НСИ's licence does not allow us to distribute, so there is
  // no argument here that would produce one and no field on the row to hold it.
  const grid = quarterGrid({
    series_by_period: { "2021-Q1": 3, "2020-Q1": 1, "2020-Q3": 2, "2026-M05": 9 },
  });
  assert.deepEqual(
    grid.map((r) => r.year),
    ["2020", "2021"],
    "the years are out of order, or a monthly period was let into a quarterly grid"
  );
  assert.deepEqual(
    grid[0].cells.map((c) => c?.value ?? null),
    [1, null, 2, null],
    "a cell landed in the wrong quarter's column"
  );
  for (const row of grid) {
    assert.equal(row.cells.length, QUARTERS.length, `${row.year} is not four columns wide`);
    // No aggregate on the row. A year total or average is a производно
    // произведение over НСИ's cells (docs/legal.md §НСИ, §2.1.1), and the row
    // shape is where one would be added without anyone calling it that.
    assert.deepEqual(Object.keys(row).sort(), ["cells", "year"]);
  }
  assert.deepEqual(quarterGrid(null), []);

  // Against the real payload: every cell reaches its column unchanged, and
  // none is dropped on the way.
  const wage = read("sofia_salary");
  if (!wage) return;
  const flat = quarterGrid(wage).flatMap((r) => r.cells.filter(Boolean));
  assert.equal(flat.length, seriesCells(wage).length, "the grid lost a published quarter");
  for (const cell of flat) {
    assert.equal(
      cell.value,
      wage.series_by_period[cell.period],
      `${cell.period} was changed on the way into the grid`
    );
  }
});

// ---------------------------------------------------------------------------
// The sector comparison — selection over НСИ's published cells
// ---------------------------------------------------------------------------

test("sectorComparison reads НСИ's published cell and computes no rank", () => {
  const payload = read("sector_salary");
  if (!payload) return;
  const payroll = read("payroll");

  const row = payload.sectors.find((s) => s.en_name === "Information and communication");
  const out = sectorComparison({
    sectorSalary: payload,
    key: "Information and communication",
    nets: [2100],
    payroll,
  });

  // The gross is НСИ's cell, selected — not an average of their months, not a
  // re-levelled figure. docs/legal.md §НСИ turns on this staying true.
  assert.equal(out.gross, row.value_eur, "the sector gross is no longer НСИ's published cell");
  assert.equal(out.gross, row.series_by_period[payload.ref_period]);
  assert.equal(out.refPeriod, payload.ref_period);
  // Both labels are НСИ's own, one per language, never one translated.
  assert.equal(out.bgName, row.bg_name);
  assert.equal(out.enName, row.en_name);
  // One verify URL per edition: the labels differ between the two files, so a
  // reader sent to the wrong one cannot find the row they just read.
  assert.equal(out.sourceUrl, payload.source_url);
  assert.equal(out.sourceUrlBg, payload.source_url_bg);
  assert.notEqual(out.sourceUrl, out.sourceUrlBg, "both languages verify against one edition");
  // НСИ mark a whole year preliminary until they finalise it; the card has to
  // be able to say so rather than presenting a figure they will revise.
  assert.equal(out.isPreliminary, payload.is_preliminary);

  // **There is no rank here and there must never be one.** Nobody publishes a
  // pay distribution by activity for Bulgaria, so a percentile against a sector
  // could only be invented. The shape is the guard: a field added to carry one
  // fails this line before it reaches a reader.
  assert.deepEqual(
    Object.keys(out).sort(),
    [
      "bgName",
      "enName",
      "gaps",
      "gross",
      "isPreliminary",
      "net",
      "refPeriod",
      "sourceUrl",
      "sourceUrlBg",
    ],
    "sectorComparison's shape changed — if a rank or percentile was added, there is no published distribution behind it"
  );
  for (const gap of out.gaps) {
    assert.deepEqual(Object.keys(gap).sort(), [
      "diffPct",
      "direction",
      "index",
      "magnitudePct",
      "net",
      "ordinal",
    ]);
  }
});

test("the sector gap is measured net against net, per earner", () => {
  const payload = read("sector_salary");
  if (!payload) return;
  const payroll = read("payroll");
  const out = sectorComparison({
    sectorSalary: payload,
    key: "Information and communication",
    nets: [2100, 900],
    payroll,
  });

  // A gross compared with a net would flatter the reference by about a fifth
  // and report the reader as further behind than they are.
  assert.ok(out.net < out.gross, "the sector reference is no longer converted to net");
  assert.equal(out.gaps.length, 2, "the gap is per earner — НСИ publish a wage, not a household");
  assert.equal(out.gaps[0].direction, "below");
  assert.equal(out.gaps[0].magnitudePct, 18);
  assert.equal(out.gaps[1].direction, "below");

  // An unpicked sector states nothing about anybody.
  assert.equal(sectorComparison({ sectorSalary: payload, key: "", nets: [2100], payroll }), null);
  assert.equal(sectorComparison({ sectorSalary: null, key: "X", nets: [2100], payroll }), null);
});

test("the picker offers every published activity, in НСИ's order", () => {
  const payload = read("sector_salary");
  if (!payload) return;
  const options = sectorOptions(payload);
  const sections = payload.sectors.filter((s) => s.en_name !== SECTOR_TOTAL_KEY);

  assert.equal(options.length, sections.length);
  // НСИ's classification order, not a league table: re-sorting by wage would
  // make the ordering itself a claim the data does not carry.
  assert.deepEqual(
    options.map((o) => o.key),
    sections.map((s) => s.en_name),
    "the picker re-orders НСИ's sections"
  );
  // Both languages on every row — a missing one renders as a blank option.
  for (const o of options) {
    assert.ok(o.bg && o.en, `${o.key} is missing a label in one language`);
  }
  assert.deepEqual(sectorOptions(null), []);
});

test("the all-activities row is not offered as somebody's sector", () => {
  // НСИ head the table with `Total` / «Общо», the figure the sections are read
  // against. Offered in a list labelled «Твоят сектор» it collects the reader
  // who cannot find their own line and answers «твоята нетна заплата е 83% над
  // средната за „Общо“» — a comparison against the whole economy, under a
  // caveat that calls the options broad КИД-2008 sections. It is not one.
  const payload = read("sector_salary");
  if (!payload) return;

  assert.ok(
    payload.sectors.some((s) => s.en_name === SECTOR_TOTAL_KEY),
    "the payload no longer carries the all-activities row this test is about"
  );
  assert.deepEqual(
    sectorOptions(payload).filter((o) => o.key === SECTOR_TOTAL_KEY),
    [],
    "the all-activities row is offered as an economic activity"
  );
  // And it resolves to nothing at the lookup too, so leaving it out of one
  // list is not the whole guarantee.
  assert.equal(
    sectorComparison({
      sectorSalary: payload,
      key: SECTOR_TOTAL_KEY,
      nets: [2000],
      payroll: read("payroll"),
    }),
    null,
    "the all-activities row still resolves to a sector comparison"
  );
});
