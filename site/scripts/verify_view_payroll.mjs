#!/usr/bin/env node
/**
 * Where a household's pay stands once it has been taxed.
 *
 * The arithmetic is covered by `verify_mirror_math.mjs` and
 * `verify_net_salary.mjs`. What is covered here is what those formulas get
 * fed, and the wrong number that looks right: itemise the NET a reader typed
 * as though it were the contract gross and every line comes out about 20%
 * light, with no band anywhere that would flag it. The rates and the insurance
 * ceiling come out of the published payload rather than being written down
 * here, each contract is taxed against its own ceiling rather than the
 * household total against one, and a percentile is read from the bottom —
 * "top 63%" for a below-median income reads as an achievement and is false.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pctAhead,
  taxWedgePanel,
  payslipPanel,
  earnerRanks,
  sectorComparison,
  sectorOptions,
  SECTOR_TOTAL_KEY,
  regionGap,
  standStillPay,
  netsOf,
  convertPay,
  householdRaise,
  scheduledMaxInsurable,
  scheduledMaxInsurableFrom,
} from "../src/lib/view/payroll.js";
import { regionQuarter, SOFIA_CITY_CODE } from "../src/lib/view/region.js";
import { SECTOR_HINTS } from "../src/lib/content.js";
import {
  composeLadder,
  buildLadder,
  percentile,
  bgNetSalary,
  payrollParams,
  BG_CONTRIB_LINES,
} from "../src/lib/mirror.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

/** The published payroll payload, which every panel below is fed. */
const PAYROLL = read("payroll");

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
  const regions = read("region_salary");
  if (!dist || !regions) return;
  const gross = composeLadder(dist, regionQuarter(regions, SOFIA_CITY_CODE).value);
  const ladder = Object.values(gross);
  assert.equal(ladder.length, 11, "the two payloads no longer compose into a ladder");
  assert.ok(pctAhead(percentile(ladder[0] - 100, ladder)) <= 5);
  assert.ok(pctAhead(percentile(ladder[ladder.length - 1] + 1000, ladder)) >= 95);
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

  // **And the other basis, where there is nothing to recover.** The pay field
  // takes gross as readily as net and this is the only suite that reaches the
  // function at all — no browser test calls it with a basis either. Recovering
  // a gross from a figure that already IS one runs the conversion backwards:
  // €2,000 gross, comfortably under the €2,300 ceiling, is placed at €2,539,
  // flagged as over the cap and told its next euro costs 10% when it costs
  // 22.4%. Every number on the row stays a plausible Bulgarian salary.
  const typedGross = params.maxInsurable - 300;
  assert.ok(typedGross > 0, "test premise: the gross probe sits under the ceiling");
  const asGross = taxWedgePanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [typedGross] },
  });
  assert.equal(asGross.earners.length, 1);
  assert.equal(asGross.earners[0].gross, typedGross, "the typed gross was converted from itself");
  assert.equal(asGross.earners[0].overCap, false, "a salary under the ceiling was placed over it");
  assert.ok(near(asGross.earners[0].marginalPct, 22.402, 1e-3), asGross.earners[0].marginalPct);
  // The same figure typed on the two bases is two different people, which is
  // what the basis is for.
  const asNet = taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [typedGross] } });
  assert.ok(
    asNet.earners[0].gross > asGross.earners[0].gross,
    "the two bases place the same typed figure at the same gross"
  );
});

test("an earner exactly at the insurance ceiling is over it, not under", () => {
  // The boundary belongs to the upper branch, and `mirror.js#bgMarginalRatePct`
  // says why in as many words: at the cap the next euro is already outside the
  // insurance base, so the rate there is 10% and `bgTaxWedge`'s
  // `peakEffectivePct` is measured AT the cap and is the maximum of the curve.
  // The panel's own flag has to agree with the rate beside it — an earner shown
  // a 10% marginal rate and «under the ceiling» in the same row is being told
  // two things, and only one of them is true. A probe at cap + €300 cannot see
  // the disagreement, because the two branches only differ on the boundary.
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const panel = taxWedgePanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [params.maxInsurable] },
  });
  const [atCap] = panel.earners;
  assert.equal(atCap.gross, params.maxInsurable);
  assert.equal(atCap.overCap, true, "an earner standing on the ceiling was placed under it");
  assert.ok(
    near(atCap.marginalPct, 10, 1e-9),
    `the rate at the ceiling is ${atCap.marginalPct}%, so the flag and the rate disagree`
  );
  assert.ok(near(atCap.effectivePct, panel.peakEffectivePct, 1e-9), "the peak is not at the kink");
  // One euro below it, both halves flip together.
  const [under] = taxWedgePanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [params.maxInsurable - 1] },
  }).earners;
  assert.equal(under.overCap, false);
  assert.ok(under.marginalPct > 20);
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

test("the stand-still ask is priced on the contract, not on the take-home", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  // Below the ceiling both contributions and tax are levied on the raise; above
  // it only the tax is. The whole reason this row exists is that the two are
  // different numbers, so a gross grossed up by one rate is wrong for half the
  // readers and nothing on the page would say which half.
  const under = bgNetSalary(1500, params).net;
  const over = bgNetSalary(params.maxInsurable + 900, params).net;

  for (const [net, label] of [
    [under, "below the ceiling"],
    [over, "above the ceiling"],
  ]) {
    const ask = standStillPay({
      payroll: PAYROLL,
      pay: { basis: "net", amounts: [net] },
      pocketPct: -2.5,
    });
    assert.ok(ask.netGap > 0, `${label}: a reader who lost ground is asked for nothing`);
    assert.ok(
      ask.grossGap > ask.netGap,
      `${label}: €${ask.netGap.toFixed(2)} in hand is priced at €${ask.grossGap.toFixed(2)} gross, ` +
        "which is at most what it is worth — the deductions on a raise have gone missing"
    );
    assert.ok(near(ask.grossNeeded - ask.grossNow, ask.grossGap, 1e-9));
  }

  const cheap = standStillPay({
    payroll: PAYROLL,
    pay: { basis: "net", amounts: [over] },
    pocketPct: -2.5,
  });
  const dear = standStillPay({
    payroll: PAYROLL,
    pay: { basis: "net", amounts: [under] },
    pocketPct: -2.5,
  });
  assert.ok(
    cheap.grossGap / cheap.netGap < dear.grossGap / dear.netGap,
    "a euro in hand costs the same gross either side of the insurance ceiling, " +
      "so the ask is being grossed up by one rate rather than through the payroll"
  );
});

test("standStillPay quotes today's gross as the pay card already printed it", () => {
  if (!PAYROLL) return;
  // «€2 738 бруто вместо €2 706» sits a few hundred pixels under the pay card's
  // own «2 706 € бруто», and a second inversion of the same net lands a cent
  // away from the first. Both come out of `bgHouseholdPayroll`, so the sentence
  // and the card cannot quote different contracts.
  const pay = { basis: "net", amounts: [1200, 900] };
  const panel = payslipPanel({ payroll: PAYROLL, pay });
  const ask = standStillPay({ payroll: PAYROLL, pay, pocketPct: -3 });
  assert.equal(ask.grossNow, panel.gross);
  assert.equal(ask.netNow, panel.net);

  // Each contract is scaled and re-inverted on its own, so the pair does not
  // share one ceiling — the failure `bgHouseholdPayroll` exists to prevent,
  // reached here by a different route.
  const asOne = standStillPay({
    payroll: PAYROLL,
    pay: { basis: "net", amounts: [2100] },
    pocketPct: -3,
  });
  assert.ok(
    ask.grossGap !== asOne.grossGap,
    "two contracts were priced as one salary on the way to the ask"
  );
});

test("standStillPay refuses the states it cannot answer for", () => {
  if (!PAYROLL) return;
  const pay = { basis: "net", amounts: [1500] };
  assert.equal(standStillPay({ payroll: PAYROLL, pay, pocketPct: NaN }), null);
  assert.equal(standStillPay({ payroll: PAYROLL, pay, pocketPct: -100 }), null);
  assert.equal(
    standStillPay({ payroll: PAYROLL, pay: { basis: "net", amounts: [] }, pocketPct: -2 }),
    null
  );
  // Level is not a refusal: the answer is that nothing more is needed, and the
  // row that renders it drops out on the euro figure rather than on a null.
  const level = standStillPay({ payroll: PAYROLL, pay, pocketPct: 0 });
  assert.equal(level.grossGap, 0);
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

test("regionGap compares each earner with the average WAGE, one at a time", () => {
  const regionNet = 1486;
  const both = regionGap({ nets: [900, 900], regionNet });
  assert.equal(both.length, 2);
  assert.equal(both[0].direction, "below");
  assert.equal(both[0].magnitudePct, 39);
  // The claim this prevents: two people on €900 each reported as above the
  // average worker, which is what measuring their €1,800 against a wage says.
  const asOne = regionGap({ nets: [1800], regionNet })[0];
  assert.equal(asOne.direction, "above");

  // The magnitude is rounded BEFORE the direction is chosen, so the word and
  // the figure cannot disagree. At +1.4% the rounded figure is 1%, which is
  // inside the dead zone the direction words exist to stay quiet about.
  const edge = regionGap({ nets: [regionNet * 1.014], regionNet })[0];
  assert.equal(edge.magnitudePct, 1);
  assert.equal(edge.direction, "equal", "«над» printed beside a figure inside the dead zone");

  assert.deepEqual(regionGap({ nets: [900], regionNet: 0 }), [], "compared against no average");
  assert.deepEqual(regionGap({ nets: [0, null], regionNet }), []);
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
  assert.equal(out.gaps[1].direction, "below");

  // **The percentage is asserted against a wage this file states, never
  // against the published one.** НСИ republish quarterly and the sector average
  // moves with them, so a figure pinned off the live payload is a test that
  // goes red on a data refresh — a correct refresh, arriving as a failing
  // build, with the only apparent fix being to edit the expectation until it
  // matches whatever the upstream now says. That is the habit this repository
  // exists to make impossible, and a test that teaches it is worse than no
  // test. Stated here, the arithmetic is exact and only a change to the
  // FORMULA can move it.
  const own = 1000;
  const fixed = sectorComparison({
    sectorSalary: { ...payload, sectors: [{ en_name: "X", bg_name: "Х", value_eur: 3000 }] },
    key: "X",
    nets: [own],
    payroll,
  });
  const againstNet = Math.round((1 - own / fixed.net) * 100);
  const againstGross = Math.round((1 - own / fixed.gross) * 100);
  assert.notEqual(
    againstNet,
    againstGross,
    "the fixed wage no longer tells the two readings apart — pick another"
  );
  assert.equal(fixed.gaps[0].direction, "below");
  assert.equal(
    fixed.gaps[0].magnitudePct,
    againstNet,
    `the gap reads ${fixed.gaps[0].magnitudePct}%, which is the gross reading (${againstGross}%) ` +
      `rather than the net one (${againstNet}%)`
  );

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

test("an option leads with the everyday words and still ends with НСИ's own name", () => {
  // The hint exists because НСИ's register is not the reader's: nobody scanning
  // for their job stops on «Създаване и разпространение на информация и
  // творчески продукти; далекосъобщения», and the word they are looking for is
  // in division 62, which the picker never shows.
  //
  // The risk it introduces is the one the whole feature was built to avoid —
  // our words standing in for a publisher's label. So the check is that the
  // label is ADDED TO and never replaced: every option still ends with НСИ's
  // string, character for character, in both languages. Break it by returning
  // the hint alone and this goes red on nineteen rows at once.
  const payload = read("sector_salary");
  if (!payload) return;
  const options = sectorOptions(payload);
  const byKey = new Map(payload.sectors.map((s) => [s.en_name, s]));

  let led = 0;
  for (const o of options) {
    const nsi = byKey.get(o.key);
    assert.ok(o.bg.endsWith(nsi.bg_name), `${o.key}: НСИ's Bulgarian name is not intact: ${o.bg}`);
    assert.ok(o.en.endsWith(nsi.en_name), `${o.key}: НСИ's English name is not intact: ${o.en}`);
    if (o.bg !== nsi.bg_name) led += 1;
  }
  // A hint map that stopped being applied would leave every assertion above
  // true and the picker exactly as unreadable as before.
  assert.ok(led >= 10, `only ${led} of ${options.length} options carry a hint at all`);
});

test("every published section has a hint decision recorded, empty or not", () => {
  // Keyed by `en_name`, so a section НСИ rename or add lands here rather than
  // rendering a bare classification title nobody recognises — the silent half
  // of the failure, since the option still works and still says nothing.
  //
  // An empty string is a decision: «Строителство» and «Образование» say what
  // they are and a hint under them is a word to skip. What is barred is a
  // section with no entry at all.
  const payload = read("sector_salary");
  if (!payload) return;
  const sections = payload.sectors
    .filter((s) => s.en_name !== SECTOR_TOTAL_KEY)
    .map((s) => s.en_name);

  const missing = sections.filter((n) => !Object.hasOwn(SECTOR_HINTS, n));
  assert.deepEqual(
    missing,
    [],
    `no hint decision for: ${missing.join(", ")}\n` +
      "Add an entry to content.js#SECTOR_HINTS naming the divisions inside the " +
      "section, or an empty string if НСИ's own name already reads plainly."
  );

  const stale = Object.keys(SECTOR_HINTS).filter((n) => !sections.includes(n));
  assert.deepEqual(stale, [], `hints for sections НСИ no longer publish: ${stale.join(", ")}`);

  // A hint names KINDS OF WORK, so it never carries a figure — the numbers on
  // this card are НСИ's and Eurostat's, and a euro or a percent inside a picker
  // label would be one under nobody's credit at all.
  for (const [key, hint] of Object.entries(SECTOR_HINTS)) {
    for (const text of [hint.bg, hint.en]) {
      assert.ok(!/[\d€%]/.test(text), `SECTOR_HINTS[${key}] carries a figure: ${text}`);
      // The option joins hint and name with a middot, so a hint containing one
      // draws a second boundary and the reader cannot tell which side is НСИ's.
      // «фабрики · храни, облекло … · Преработваща промишленост» reads as three
      // things rather than two.
      assert.ok(!text.includes("·"), `SECTOR_HINTS[${key}] contains the separator: ${text}`);
    }
    assert.equal(
      hint.bg === "",
      hint.en === "",
      `SECTOR_HINTS[${key}] is hinted in one language and not the other`
    );
  }
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
