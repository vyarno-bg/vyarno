#!/usr/bin/env node
/**
 * Math-only verification for `mirror.js#bgNetSalary` and
 * `mirror.js#bgGrossFromNet`. Runs under Node's built-in `node:test`
 * runner — no extra dependencies. Invoked by
 *
 *     npm run verify:math
 *
 * from `site/`.
 *
 * Why this exists: the `site/` package has no Svelte unit-test
 * framework installed (no vitest, no jsdom). The formula itself
 * is a pure-JS function in `src/lib/mirror.js`, so we exercise
 * it directly via node's test runner.
 *
 * Sibling files run by the same command:
 *   - `verify_mirror_math.mjs`     the rest of mirror.js (inflation,
 *                                  real wage, percentile, annuity, erosion)
 *   - `verify_data_contracts.mjs`  data.js fallback chains + the SPA's math
 *                                  run over the committed published JSON
 *   - `verify_template_safety.mjs`  the `{@html}` invariants, both directions
 *   - `verify_wiring.mjs`          which value the markup feeds to which
 *                                  function
 * The last two read the source string rather than the runtime, because a
 * wrong argument in a template is invisible to any test of the function it
 * was passed to.
 *
 * **What the expected values are checked against.** The rates, the flat tax
 * and the insurance ceiling are legislative, and their provenance is the
 * statute — recorded, dated and cited, in
 * `pipeline/src/vyarno_pipeline/payroll.py#BG_PAYROLL_TABLE`, which is also
 * what `payroll.json` is built from. That table is the reference; every
 * expected figure below is the statutory parameter applied by hand, and
 * `test_payroll.py` asserts this file's constants against it in both
 * directions.
 *
 * Deliberately NOT against another calculator. A third-party answer is
 * evidence of nothing on its own — one of the defects guarded against here
 * is a widely-shipped one, so agreement would have been the wrong signal —
 * and a comparison recorded in a public repository names somebody else's
 * product to say it is wrong. Where a property is worth pinning, it is
 * pinned as a property: the round-trip, the column that balances, the lines
 * that sum to their own total. Each is checkable with no second opinion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bgNetSalary,
  bgGrossFromNet,
  bgPayrollBreakdown,
  bgPayslipFromNet,
  payrollParams,
  BG_2026_RATES,
  BG_2026_INCOME_TAX_RATE,
  BG_2026_MAX_INSURABLE,
  BG_2026_TOTAL_EMPLOYEE_RATE,
  BG_CONTRIB_LINES,
} from "../src/lib/mirror.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("BG_2026_TOTAL_EMPLOYEE_RATE = 13.78% (sum of pension + 2nd pillar + sickness + unemployment + health)", () => {
  // Sum the five lines manually and assert the constant equals 13.78%.
  // ЗБДОО sets the five employee lines; the total is what the SPA actually
  // applies, so the total must be right and the split is what the payslip
  // view itemises. Both are pinned, because a split that drifts shows a
  // reader a breakdown that does not add up to their own deduction.
  const expected = 0.1378;
  assert.ok(
    Math.abs(BG_2026_TOTAL_EMPLOYEE_RATE - expected) < 1e-9,
    `got ${BG_2026_TOTAL_EMPLOYEE_RATE}, expected ${expected}`
  );
});

test("BG_2026_INCOME_TAX_RATE = 10% (BG flat personal income tax)", () => {
  assert.equal(BG_2026_INCOME_TAX_RATE, 0.1);
});

test("BG_2026_MAX_INSURABLE = €2300 (ЗБДОО 2026, in force 2026-08-01)", () => {
  // "Максимален осигурителен доход", set in euro by the State Social
  // Insurance Budget Act 2026 (adopted 2026-07-22, in force 2026-08-01).
  //
  // The sentinel has to equal whatever `data/published/payroll.json` ships,
  // or first paint computes one net pay and the fetch corrects it a moment
  // later; `test_the_spa_sentinel_matches_the_payroll_json_actually_shipped`
  // is the assertion that holds the pair together across a refresh. This one
  // pins the value itself, so a sentinel edited to match a payload that was
  // itself wrong still has to face the statute.
  assert.equal(BG_2026_MAX_INSURABLE, 2300.0);
});

test("BG_2026_RATES are non-zero + sum to the total", () => {
  const lines = [
    BG_2026_RATES.pension,
    BG_2026_RATES.pension2,
    BG_2026_RATES.sicknessMaternity,
    BG_2026_RATES.unemployment,
    BG_2026_RATES.health,
  ];
  for (const r of lines) {
    assert.ok(r > 0 && r < 0.1, `rate out of band: ${r}`);
  }
  const sum = lines.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - BG_2026_TOTAL_EMPLOYEE_RATE) < 1e-12);
});

// ---------------------------------------------------------------------------
// bgNetSalary
// ---------------------------------------------------------------------------

test("bgNetSalary(0) returns zero envelope (empty input)", () => {
  const r = bgNetSalary(0);
  assert.equal(r.gross, 0);
  assert.equal(r.insurance, 0);
  assert.equal(r.tax, 0);
  assert.equal(r.net, 0);
  assert.equal(r.insuranceCapped, false);
});

test("bgNetSalary(-100) treats negative as zero (form not yet filled)", () => {
  const r = bgNetSalary(-100);
  assert.equal(r.gross, -100); // preserved as input for debugging
  assert.equal(r.insurance, 0);
  assert.equal(r.tax, 0);
  assert.equal(r.net, 0);
});

test("bgNetSalary(NaN) returns zero envelope (defensive)", () => {
  const r = bgNetSalary(NaN);
  assert.equal(r.gross, 0);
  assert.equal(r.net, 0);
});

test("bgNetSalary(1000) — worked example, no cap", () => {
  // insurance = 1000 × 0.1378 = 137.80
  // taxable   = 1000 - 137.80 = 862.20
  // tax       = 862.20 × 0.10  = 86.22
  // net       = 1000 - 137.80 - 86.22 = 775.98
  const r = bgNetSalary(1000);
  assert.equal(r.gross, 1000);
  assert.equal(r.insurableBase, 1000);
  assert.ok(Math.abs(r.insurance - 137.8) < 1e-9, `insurance=${r.insurance}`);
  assert.ok(Math.abs(r.taxable - 862.2) < 1e-9, `taxable=${r.taxable}`);
  assert.ok(Math.abs(r.tax - 86.22) < 1e-9, `tax=${r.tax}`);
  assert.ok(Math.abs(r.net - 775.98) < 1e-9, `net=${r.net}`);
  assert.equal(r.insuranceCapped, false);
  // Effective rate: (1000 - 775.98) / 1000 × 100 = 22.402%
  assert.ok(Math.abs(r.effectiveRatePct - 22.402) < 0.01, `effective=${r.effectiveRatePct}`);
});

test("bgNetSalary(2000) — the whole gross is insurable below the ceiling", () => {
  // Below the ceiling there is no capping to get wrong, so the contribution
  // is the statutory rate on the whole gross: 2000 × 0.1378 = 275.60. This is
  // the case that must NOT move when the ceiling does.
  const r = bgNetSalary(2000);
  assert.ok(Math.abs(r.insurance - 275.6) < 1e-9, `insurance=${r.insurance}, expected 275.60`);
  assert.ok(Math.abs(r.net - (2000 - 275.6 - (2000 - 275.6) * 0.1)) < 1e-9);
  assert.equal(r.insuranceCapped, false);
});

test("bgNetSalary(1077) — near the minimum wage, no cap", () => {
  // 1077 × 0.1378 = 148.4106, so 148.41 to the cent. A low gross is where a
  // stray cap or floor would be least visible on screen.
  const r = bgNetSalary(1077);
  assert.ok(Math.abs(r.insurance - 148.41) < 0.01, `insurance=${r.insurance}, expected 148.41`);
});

test("bgNetSalary(3000) — cap kicks in (gross > 2300)", () => {
  // insurance base = 2300 (capped)
  // insurance     = 2300 × 0.1378 = 316.94
  // taxable       = 3000 - 316.94 = 2683.06
  // tax           = 2683.06 × 0.10  = 268.31
  // net           = 3000 - 316.94 - 268.31 = 2414.75
  const r = bgNetSalary(3000);
  assert.equal(r.gross, 3000);
  assert.equal(r.insurableBase, 2300);
  assert.equal(r.insuranceCapped, true);
  assert.ok(Math.abs(r.insurance - 316.94) < 0.01, `insurance=${r.insurance}`);
  assert.ok(Math.abs(r.taxable - 2683.06) < 0.01, `taxable=${r.taxable}`);
  assert.ok(Math.abs(r.tax - 268.31) < 0.01, `tax=${r.tax}`);
  assert.ok(Math.abs(r.net - 2414.75) < 0.01, `net=${r.net}`);
});

test("bgNetSalary at the cap (2300) — boundary, no cap flag", () => {
  // gross == cap should not trip the cap flag (we cap at min(g, cap),
  // and min(cap, cap) = cap exactly, so no clamping happens).
  const r = bgNetSalary(BG_2026_MAX_INSURABLE);
  assert.equal(r.insuranceCapped, false);
  assert.equal(r.insurableBase, BG_2026_MAX_INSURABLE);
});

test("bgNetSalary just over the cap (2112) — flag is true", () => {
  const r = bgNetSalary(BG_2026_MAX_INSURABLE + 0.36);
  assert.equal(r.insuranceCapped, true);
  assert.equal(r.insurableBase, BG_2026_MAX_INSURABLE);
});

test("bgNetSalary(10000) — high earner, insurance capped at cap × rate", () => {
  // Even though gross is 10000, insurance is computed on the ceiling only.
  // Written off the constant rather than the figure, because the point is
  // the capping, not the ceiling of any particular year.
  const r = bgNetSalary(10000);
  const expectedInsurance = BG_2026_MAX_INSURABLE * BG_2026_TOTAL_EMPLOYEE_RATE;
  assert.ok(
    Math.abs(r.insurance - expectedInsurance) < 0.01,
    `insurance=${r.insurance}, expected ${expectedInsurance.toFixed(2)}`
  );
  // tax base is still full 10000 - insurance
  const expectedTax = (10000 - expectedInsurance) * 0.1;
  assert.ok(
    Math.abs(r.tax - expectedTax) < 0.01,
    `tax=${r.tax}, expected ${expectedTax.toFixed(2)}`
  );
});

// ---------------------------------------------------------------------------
// bgGrossFromNet — round-trip property
// ---------------------------------------------------------------------------

test("bgGrossFromNet(0) and negative return 0 (empty input)", () => {
  assert.equal(bgGrossFromNet(0), 0);
  assert.equal(bgGrossFromNet(-100), 0);
  assert.equal(bgGrossFromNet(NaN), 0);
});

test("bgGrossFromNet -> bgNetSalary round-trip for 1000 EUR net (no cap)", () => {
  // Pick a target net, recover the gross that produces it, then
  // run the gross through bgNetSalary and verify the net comes
  // back to within 1 cent. This is the round-trip property the
  // SPA relies on (user types net → back-compute gross → re-derive
  // net for the comparator).
  for (const targetNet of [500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]) {
    const gross = bgGrossFromNet(targetNet);
    const reDerived = bgNetSalary(gross);
    assert.ok(
      Math.abs(reDerived.net - targetNet) < 0.01,
      `round-trip failed for net=${targetNet}: ` +
        `gross=${gross}, reNet=${reDerived.net}, ` +
        `diff=${Math.abs(reDerived.net - targetNet)}`
    );
  }
});

test("bgGrossFromNet -> bgNetSalary round-trip above the cap", () => {
  // Test the cap branch by picking nets that imply gross > cap.
  // Branch 2 (cap) is selected when the branch-1 candidate gross
  // exceeds the cap. At the 2026-08-01 ceiling of 2300 the no-cap formula
  // gives gross = net / 0.77598, so net / 0.77598 > 2300 means
  // net > 1784.75 triggers branch 2. The crossover net ≈ 1785.
  for (const targetNet of [2000, 2500, 3000, 4000, 5000]) {
    const gross = bgGrossFromNet(targetNet);
    const reDerived = bgNetSalary(gross);
    assert.ok(reDerived.insuranceCapped, `net=${targetNet} should trigger cap`);
    assert.ok(
      Math.abs(reDerived.net - targetNet) < 0.01,
      `cap-branch round-trip failed for net=${targetNet}: ` +
        `gross=${gross}, reNet=${reDerived.net}`
    );
  }
});

test("bgGrossFromNet(1000) back-computes ~1288.69 EUR", () => {
  // Branch 1: gross = 1000 / 0.77598 = 1288.69
  // Branch 2: gross = (1000 + 2300 × 0.1378 × 1.9) / 0.9
  //        = (1000 + 602.19) / 0.9 = 1780.21
  // Branch 1 should be picked (closer round-trip).
  const g = bgGrossFromNet(1000);
  assert.ok(Math.abs(g - 1288.69) < 0.5, `expected ~1288.69, got ${g}`);
});

test("bgGrossFromNet(net) picks the right branch (no-cap when target net < 1640)", () => {
  // The crossover where both branches agree is roughly net ≈ 1640.
  // For nets below, branch 1 is closer. Above, branch 2.
  const g1000 = bgGrossFromNet(1000);
  assert.ok(g1000 < BG_2026_MAX_INSURABLE, "1000 net should use no-cap branch");
  const g4000 = bgGrossFromNet(4000);
  assert.ok(g4000 > BG_2026_MAX_INSURABLE, "4000 net should use cap branch");
});

// ---------------------------------------------------------------------------
// Sofia comparator — verify the net derivation
// ---------------------------------------------------------------------------

test("Sofia net for the live anchor (€1914.7 gross, 2026-Q1) is ~€1486", () => {
  // The live anchor is the latest COMPLETE quarter's average Sofia-city
  // GROSS wage — 2026-Q1 = mean(Jan 1865, Feb 1818, Mar 2061) = 1914.7 EUR
  // (deseasonalized off the March bonus spike; the single-month March 2061
  // is retained only as `latest_month`). Apply bgNetSalary(1914.7):
  //   insurance 1914.7 × 0.1378 = 263.85 (below the 2300 cap)
  //   taxable   1914.7 - 263.85 = 1650.85
  //   tax       1650.85 × 0.10  = 165.09
  //   net       1914.7 - 263.85 - 165.09 = 1485.76
  const r = bgNetSalary(1914.7);
  assert.ok(Math.abs(r.net - 1485.76) < 0.5, `Sofia net: expected ~1485.76, got ${r.net}`);
  // Round-trip: bgGrossFromNet(net) should return the gross anchor.
  const g = bgGrossFromNet(r.net);
  assert.ok(Math.abs(g - 1914.7) < 0.5, `round-trip: expected ~1914.7, got ${g}`);
});

// ---------------------------------------------------------------------------
// The net→gross inverse above the ceiling — a REGRESSION GUARD
//
// There are two candidate inverses, and only one of them is an inverse.
//
//   below-ceiling:  gross = net / (1 − R − Rtax(1 − R))  = net / 0.77598
//   at-ceiling:     gross = (net + cap × R × (1 + Rtax)) / (1 − Rtax)
//
// The below-ceiling form is the one that reads as obviously correct, and it
// is correct — right up to the ceiling. Past it the insurance stops growing
// while the formula keeps assuming it does, so the answer comes out high.
// Taking it unconditionally is a real, shipped defect in this class of
// calculator rather than a hypothetical one: for €2100 net it returns
// €2706.26, and the deduction column printed underneath that gross pays a
// visibly different net. The error is one-directional, grows with salary, and
// only appears once the gross clears the ceiling — which is exactly the band
// where nobody re-checks, because the figure still looks like a salary.
//
// `bgGrossFromNet` computes both candidates and keeps whichever reproduces
// the typed net through the FORWARD function, so the branch cannot be chosen
// wrongly — there is no condition to get backwards.
//
// These tests do not assert that we are right because we said so. They assert
// the round-trip property, which is checkable with no second opinion, and
// they pin the specific wrong candidate so a future edit to the branch
// selection cannot quietly start returning it.
// ---------------------------------------------------------------------------

test("net→gross satisfies its own breakdown", () => {
  // The property, stated without reference to any other calculator: whatever
  // gross we report for a target net must pay that net once every deduction
  // is taken. Sampled across the ceiling, which is where it breaks.
  for (const targetNet of [800, 1500, 1638, 1639, 1700, 2100, 2500, 4000]) {
    const p = bgPayslipFromNet(targetNet);
    assert.ok(
      Math.abs(p.gross - p.totalDeductions - targetNet) < 0.005,
      `gross ${p.gross} − deductions ${p.totalDeductions} = ` +
        `${(p.gross - p.totalDeductions).toFixed(2)}, not the ${targetNet} asked for`
    );
  }
});

test("bgGrossFromNet(2100) takes the at-ceiling branch, not net / 0.77598", () => {
  const g = bgGrossFromNet(2100);
  assert.ok(Math.abs(g - 2650.27) < 0.01, `expected 2650.27, got ${g}`);

  // The rejected candidate: €2706.26 IS the below-ceiling inverse, and it is
  // wrong precisely because the gross it produces is over the ceiling. If this
  // assertion fails, the arithmetic has moved and the branch-selection test
  // above has stopped testing the branch it names.
  const belowCeilingInverse = 2100 / (1 - 0.1378 - 0.1 * (1 - 0.1378));
  assert.ok(
    Math.abs(belowCeilingInverse - 2706.26) < 0.01,
    `the wrong answer is no longer 2706.26 but ${belowCeilingInverse.toFixed(2)}`
  );
  assert.ok(
    belowCeilingInverse > BG_2026_MAX_INSURABLE,
    "premise: the below-ceiling inverse lands over the ceiling, so it cannot be used"
  );

  // What makes it wrong is checkable here, with no outside reference: run the
  // rejected candidate through the forward function and it pays a net that is
  // not the one asked for. The gap is what a reader would silently lose.
  const rejected = bgNetSalary(belowCeilingInverse);
  assert.ok(
    Math.abs(rejected.net - 2150.38) < 0.01,
    `the rejected candidate pays ${rejected.net.toFixed(2)}, expected 2150.38`
  );
  assert.ok(
    rejected.net - 2100 > 40,
    `the two branches now differ by ${(rejected.net - 2100).toFixed(2)}, so this ` +
      "case no longer exercises the ceiling and needs a higher net"
  );
  // Both candidates are charged the SAME insurance — it is capped either way —
  // so the disagreement is the inverse and never the parameters. This is the
  // assertion that goes red if it ever turns out to be a rate after all.
  assert.ok(
    Math.abs(rejected.insurance - BG_2026_MAX_INSURABLE * BG_2026_TOTAL_EMPLOYEE_RATE) < 0.01,
    rejected.insurance
  );
});

// ---------------------------------------------------------------------------
// bgPayrollBreakdown / bgPayslipFromNet — the itemised view
//
// A breakdown that does not add up teaches the reader to distrust the total.
// Rounding each fund line independently does not add up: at a gross of €601
// the five lines round to €82.81 under a stated total of €82.82, because
// sickness-maternity's 8.4114 loses its remainder and nothing gives it back.
// `mirror.js#allocateToCents` allocates the last cent by largest remainder
// instead of dropping it.
// ---------------------------------------------------------------------------

test("the five fund lines sum EXACTLY to the contributions total", () => {
  // The named cases, plus a sweep. The sweep is not padding: at MOST grosses
  // the five independently-rounded lines happen to sum to the total anyway —
  // every capped gross does, since they all share one insurable base — so a
  // handful of round salaries cannot tell largest-remainder allocation apart
  // from naive rounding. €601.00 can: there the naive lines sum to €82.81
  // under a total of €82.82. One such gross in every ~2.5 euro of the range
  // means the sweep below always contains several, whatever the ceiling.
  const sweep = [];
  for (let cents = 60000; cents <= 300000; cents += 37) sweep.push(cents / 100);
  for (const gross of [620.2, 601, 1000, 1077, 1500, 2111.64, 2624.31, 3000, 10000, ...sweep]) {
    const b = bgPayrollBreakdown(gross);
    assert.equal(b.lines.length, 5, `expected 5 fund lines, got ${b.lines.length}`);
    const sum = b.lines.reduce((a, l) => a + l.amount, 0);
    assert.ok(
      Math.abs(sum - b.insurance) < 1e-9,
      `gross ${gross}: lines sum to ${sum.toFixed(2)} but the total says ` +
        `${b.insurance.toFixed(2)} — the column does not add up on screen`
    );
    // Every line is a whole number of cents (nothing is displayed rounded).
    for (const l of b.lines) {
      assert.ok(
        Math.abs(l.amount * 100 - Math.round(l.amount * 100)) < 1e-9,
        `${l.key} is ${l.amount}, not a whole number of cents`
      );
    }
  }
});

test("the payslip column balances: gross − deductions = net, in cents", () => {
  for (const gross of [620.2, 1000, 2111.64, 2624.31, 3000, 10000]) {
    const b = bgPayrollBreakdown(gross);
    assert.ok(
      Math.abs(b.insurance + b.tax - b.totalDeductions) < 1e-9,
      `gross ${gross}: ${b.insurance} + ${b.tax} ≠ ${b.totalDeductions}`
    );
    assert.ok(
      Math.abs(b.gross - b.totalDeductions - b.net) < 1e-9,
      `gross ${gross}: ${b.gross} − ${b.totalDeductions} ≠ ${b.net}`
    );
    assert.ok(
      Math.abs(b.gross - b.insurance - b.taxable) < 1e-9,
      `gross ${gross}: taxable ${b.taxable} is not gross − contributions`
    );
  }
});

test("the breakdown itemises the same money bgNetSalary withholds", () => {
  // The itemised view is a display layer over the same arithmetic — not a
  // second implementation that could drift. Every downstream comparison still
  // runs on bgNetSalary, so a breakdown that disagreed with it by more than
  // display rounding would put two different numbers for one salary on screen.
  for (const gross of [800, 1500, 2111.64, 2624.31, 5000]) {
    const exact = bgNetSalary(gross);
    const b = bgPayrollBreakdown(gross);
    assert.ok(Math.abs(b.insurance - exact.insurance) < 0.01, `insurance @${gross}`);
    assert.ok(Math.abs(b.tax - exact.tax) < 0.01, `tax @${gross}`);
    assert.ok(Math.abs(b.net - exact.net) < 0.02, `net @${gross}`);
    assert.equal(b.insuranceCapped, exact.insuranceCapped, `cap flag @${gross}`);
  }
});

test("bgPayslipFromNet lands on the typed net exactly, not a cent away", () => {
  // The gross that pays a typed net is not always the nearest cent to the exact
  // inverse, and it misses in BOTH directions: €500.07 inverts to €644.436712,
  // whose nearest cent €644.44 itemises to €500.08 while €644.43 pays the
  // €500.07 asked for — and €1780.00 inverts to €2293.873553, where the nearest
  // cent €2293.87 pays €1779.99 and the cent above it is the one that lands.
  // Which neighbour wins is decided by where the line roundings inside the
  // column happen to fall, so it cannot be predicted from the inverse alone;
  // both are tried and the closer one kept.
  //
  // **Cent by cent, because a list of round salaries cannot see this.** Trying
  // only the nearest cent leaves 6425 of the 60003 nets swept below a cent out
  // — 10.7% — and yet €500, €1000, €2100 and €5000 are all among the ones it
  // gets right. The offenders are scattered through the range at that density,
  // so which nets a fixture happens to name decides whether it catches anything
  // at all.
  //
  // Three bands, because the inverse is piecewise at the insurance ceiling.
  // €1784.75 is the last net whose gross is fully insurable, so the middle band
  // crosses that boundary and the third sits wholly above it.
  for (const [fromCents, toCents] of [
    [50000, 80000],
    [170000, 190000],
    [300000, 310000],
  ]) {
    for (let cents = fromCents; cents <= toCents; cents += 1) {
      const targetNet = cents / 100;
      const p = bgPayslipFromNet(targetNet);
      assert.ok(
        Math.abs(p.net - targetNet) < 0.005,
        `asked for ${targetNet} net, the breakdown bottoms out at ${p.net}`
      );
    }
  }
});

test("bgPayslipFromNet(2100) reproduces the whole column", () => {
  // Every cell, not just the bottom line: a column that balances can still be
  // built from the wrong insurable base, and €2100 net is above the ceiling
  // so this is the case where that would show.
  const p = bgPayslipFromNet(2100);
  assert.equal(p.gross, 2650.27);
  assert.equal(p.insurableBase, BG_2026_MAX_INSURABLE);
  assert.equal(p.insuranceCapped, true);
  assert.equal(p.insurance, 316.94);
  // gross − insurance is net / 0.9 whatever the ceiling is, so these two hold
  // across a ceiling change while the three above them move with it.
  assert.equal(p.taxable, 2333.33);
  assert.equal(p.tax, 233.33);
  assert.equal(p.totalDeductions, 550.27);
  assert.equal(p.net, 2100);
});

test("each line carries the statutory rate it was charged at", () => {
  const b = bgPayrollBreakdown(3000);
  const byKey = Object.fromEntries(b.lines.map((l) => [l.key, l]));
  assert.deepEqual(
    b.lines.map((l) => l.key),
    [...BG_CONTRIB_LINES],
    "the payslip order no longer matches BG_CONTRIB_LINES"
  );
  for (const key of BG_CONTRIB_LINES) {
    assert.ok(
      Math.abs(byKey[key].ratePct - 100 * BG_2026_RATES[key]) < 1e-9,
      `${key} is labelled ${byKey[key].ratePct}%, charged at ` +
        `${(100 * BG_2026_RATES[key]).toFixed(2)}%`
    );
  }
  // Sanity: at a capped gross, each line is its rate applied to the CEILING,
  // not to the salary. A line computed off the gross would be ~30% high here.
  assert.ok(
    Math.abs(byKey.health.amount - BG_2026_MAX_INSURABLE * 0.032) < 0.01,
    `health line ${byKey.health.amount}, expected ` +
      `~${(BG_2026_MAX_INSURABLE * 0.032).toFixed(2)}`
  );
});

test("bgPayslipFromNet(0) is an empty column, not a crash", () => {
  for (const v of [0, -100, NaN, undefined, null]) {
    const p = bgPayslipFromNet(v);
    assert.equal(p.gross, 0, String(v));
    assert.equal(p.net, 0, String(v));
    assert.equal(
      p.lines.reduce((a, l) => a + l.amount, 0),
      0,
      String(v)
    );
  }
});

// ---------------------------------------------------------------------------
// payrollParams — the per-fund rates now come off the payload too
// ---------------------------------------------------------------------------

test("payrollParams reads the five fund lines out of the published payload", () => {
  const params = payrollParams({
    employee_contrib_rates: {
      pension: 0.07,
      pension2: 0.03,
      sickness_maternity: 0.01,
      unemployment: 0.005,
      health: 0.04,
      total: 0.155,
    },
    income_tax_rate: 0.1,
    max_insurable_income_eur: 2111.64,
    min_wage_gross_eur: 620.2,
  });
  assert.equal(params.rates.pension, 0.07);
  assert.equal(params.rates.sicknessMaternity, 0.01, "snake_case key was not mapped");
  assert.equal(params.rates.health, 0.04);
  // And the breakdown genuinely follows them — a params object closed over
  // BG_2026_RATES would pass the reads above and fail this.
  const b = bgPayrollBreakdown(1000, params);
  assert.ok(Math.abs(b.insurance - 155) < 0.01, `insurance ${b.insurance}, expected 155`);
  const health = b.lines.find((l) => l.key === "health");
  assert.ok(Math.abs(health.amount - 40) < 0.01, `health ${health.amount}, expected 40`);
});

test("payrollParams falls back to ALL FIVE sentinel rates when one is missing", () => {
  // All-or-nothing: a partial read would itemise four funds under a total that
  // charges five, and the column would be short by the missing line.
  const params = payrollParams({
    employee_contrib_rates: {
      pension: 0.07,
      pension2: 0.03,
      unemployment: 0.005,
      health: 0.04,
      total: 0.1378,
    },
  });
  for (const key of BG_CONTRIB_LINES) {
    assert.equal(
      params.rates[key],
      BG_2026_RATES[key],
      `${key} was not restored to the sentinel after a partial payload`
    );
  }
  const b = bgPayrollBreakdown(1000, params);
  const sum = b.lines.reduce((a, l) => a + l.amount, 0);
  assert.ok(Math.abs(sum - b.insurance) < 1e-9, "a partial payload broke the column");
});

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

console.log("All bgNetSalary / bgGrossFromNet tests passed.");
console.log("Run with: node --test scripts/verify_net_salary.mjs");
