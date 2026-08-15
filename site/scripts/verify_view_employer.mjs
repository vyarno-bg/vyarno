#!/usr/bin/env node
/**
 * What a job costs, and how much of that cost never reaches the person doing it.
 *
 * The arithmetic is covered by `verify_net_salary.mjs`, where payroll formulas
 * live. What is covered here is what those formulas get fed, and this subject
 * has exactly one wrong number that looks right: the DENOMINATOR. 22.4% of
 * gross and 34.7% of labour cost are the same euros over two bases, both are
 * true, and either one wired to the other's caller is a figure inside every
 * plausible band.
 *
 * The second is the ТЗПБ range. Ten of nineteen НСИ sections span more than
 * one rate, so a panel that resolves a sector to a single number is wrong for
 * most of the people who pick it — and wrong in the direction of looking more
 * precise, which nothing on screen would reveal.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  employerCostPanel,
  sectorWorkAccident,
  systemLabourWedge,
} from "../src/lib/view/employer.js";
import { bgGrossFromNet, bgLabourWedge, bgNetSalary, payrollParams } from "../src/lib/mirror.js";
import { published } from "./published-payload.mjs";

const read = published;

/** The published payroll payload, which every panel below is fed. */
const PAYROLL = read("payroll");

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// The ТЗПБ range — a sector is a range far more often than it is a rate
// ---------------------------------------------------------------------------

test("an unknown sector falls back to the act's span, never to its floor", () => {
  // 0.4% is a specific claim about this reader that happens to be the cheapest
  // one available. The span is what is actually known about them.
  if (!PAYROLL) return;
  for (const key of ["", "Not a section НСИ publish"]) {
    const band = sectorWorkAccident(PAYROLL, key);
    assert.equal(band.known, false);
    assert.equal(band.min, PAYROLL.work_accident.min);
    assert.equal(band.max, PAYROLL.work_accident.max);
  }
});

test("a sector spanning several ТЗПБ rates keeps both ends", () => {
  if (!PAYROLL) return;
  const band = sectorWorkAccident(PAYROLL, "Manufacturing");
  assert.equal(band.known, true);
  assert.ok(band.max > band.min, "manufacturing runs 0.5% to 1.1% and must not collapse");
});

test("a sector on one rate reports it as a range that happens to be a point", () => {
  // One shape for both cases, so no template branches on whether a field is
  // present — the branch that forgets the second case prints a point estimate
  // over a sector that runs to 1.1%.
  if (!PAYROLL) return;
  const band = sectorWorkAccident(PAYROLL, "Construction");
  assert.equal(band.known, true);
  assert.equal(band.min, band.max);
});

test("no section is published a range wider than the act's own", () => {
  if (!PAYROLL) return;
  const { min, max } = PAYROLL.work_accident;
  for (const key of Object.keys(PAYROLL.work_accident.by_nsi_section)) {
    const band = sectorWorkAccident(PAYROLL, key);
    assert.ok(band.min >= min && band.max <= max, `${key} escapes the act's span`);
  }
});

// ---------------------------------------------------------------------------
// The panel — denominators, the ceiling, and the household
// ---------------------------------------------------------------------------

test("the wedge is measured over labour cost, not over gross", () => {
  // The whole subject. Feeding the employee-side denominator here would report
  // 22.4% under a label promising the employer's side, and every band on the
  // chart would still add to 100.
  if (!PAYROLL) return;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [1000] },
    sectorKey: "Construction",
  });
  const e = panel.earners[0];
  const params = payrollParams(PAYROLL);
  const net = bgNetSalary(1000, params).net;

  assert.ok(e.labourCostLow > e.gross, "labour cost has to exceed the gross it contains");
  assert.ok(
    near(e.wedgePctLow, (100 * (e.labourCostLow - net)) / e.labourCostLow),
    "the wedge must divide by labour cost"
  );
  assert.ok(
    !near(e.wedgePctLow, (100 * (e.gross - net)) / e.gross, 0.5),
    "the wedge came out equal to the employee's rate on gross — wrong denominator"
  );
});

test("the employer's contributions stop at the same ceiling the employee's do", () => {
  // КСО чл. 6, ал. 3 caps the осигурителен доход and only then splits it. Cap
  // the employee's half alone and the wedge stays near 35% at every salary,
  // making the whole shape above €2300 wrong.
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const cap = params.maxInsurable;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [cap, cap * 2] },
    sectorKey: "Construction",
  });
  const [atCap, above] = panel.earners;
  assert.ok(
    near(atCap.employerSocial, above.employerSocial),
    "an employer pays the same contributions on a salary twice the ceiling"
  );
  assert.ok(above.wedgePctLow < atCap.wedgePctLow, "the wedge must fall above the ceiling");
});

test("the wedge peaks at the ceiling and falls afterwards", () => {
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const cap = params.maxInsurable;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [cap / 2, cap, cap * 3] },
    sectorKey: "Construction",
  });
  const [below, at, above] = panel.earners.map((e) => e.wedgePctLow);
  assert.ok(near(below, at), "below the ceiling the wedge is a constant");
  assert.ok(above < at, "above it every extra euro dilutes it");
});

test("each contract is costed against its own ceiling, never the household's total", () => {
  // The same mistake `bgHouseholdPayroll` exists to prevent, one layer up: two
  // people on €2,000 cost full contributions on every euro, one person on
  // €4,000 does not.
  if (!PAYROLL) return;
  const two = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [2000, 2000] },
    sectorKey: "Construction",
  });
  const one = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [4000] },
    sectorKey: "Construction",
  });
  assert.ok(
    two.householdLabourCost > one.householdLabourCost,
    "two capped contracts must cost more than one uncapped one at the same gross"
  );
});

test("the household rate is total over total, not the mean of the earners'", () => {
  if (!PAYROLL) return;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [700, 6000] },
    sectorKey: "Construction",
  });
  const mean = panel.earners.reduce((s, e) => s + e.wedgePctLow, 0) / panel.earners.length;
  assert.ok(
    near(
      panel.householdWedgePct,
      (100 * (panel.householdLabourCost - panel.householdNet)) / panel.householdLabourCost
    )
  );
  assert.ok(
    !near(panel.householdWedgePct, mean, 0.5),
    "an unequal household must not report the plain average of its rates"
  );
});

test("a net and the gross it inverts to cost the employer the same", () => {
  // The reader types a net by default. Costing that figure as though it were
  // the contract amount understates the employer's side by about 29%.
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const gross = bgGrossFromNet(1200, params);
  const fromNet = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "net", amounts: [1200] },
    sectorKey: "Education",
  });
  const fromGross = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [gross] },
    sectorKey: "Education",
  });
  assert.ok(near(fromNet.earners[0].labourCostLow, fromGross.earners[0].labourCostLow, 0.01));
});

test("an ambiguous sector produces two labour costs and says it did", () => {
  if (!PAYROLL) return;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [2000] },
    sectorKey: "Manufacturing",
  });
  assert.equal(panel.ambiguous, true);
  assert.ok(panel.earners[0].labourCostHigh > panel.earners[0].labourCostLow);
  assert.ok(panel.earners[0].wedgePctHigh > panel.earners[0].wedgePctLow);
});

test("an unambiguous sector collapses to one figure", () => {
  if (!PAYROLL) return;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [2000] },
    sectorKey: "Financial and insurance activities",
  });
  assert.equal(panel.ambiguous, false);
  assert.ok(near(panel.earners[0].labourCostHigh, panel.earners[0].labourCostLow));
});

test("the panel and the curve it spreads collide only where the panel means to", () => {
  // `employerCostPanel` spreads `bgLabourWedge(...)` and then writes its own
  // keys over the top, so the two share one namespace and the spread order
  // decides. Three keys are already produced by both halves — deliberately,
  // since the panel's `workAccident` carries the `known` flag the curve has no
  // way to know. A fourth arriving on either side would win silently, in the
  // direction of whichever was written last, and every figure would still look
  // ordinary.
  if (!PAYROLL) return;
  const params = payrollParams(PAYROLL);
  const band = sectorWorkAccident(PAYROLL, "Manufacturing");
  const curve = Object.keys(bgLabourWedge({ params, workAccident: band }));
  // What the panel writes after the spread, in its own return literal.
  const own = [
    "workAccident",
    "ambiguous",
    "capGross",
    "employerRatePct",
    "earners",
    "householdLabourCost",
    "householdNet",
    "householdWedgePct",
  ];
  assert.deepEqual(
    own.filter((k) => curve.includes(k)).sort(),
    ["ambiguous", "capGross", "workAccident"],
    "the panel's keys and bgLabourWedge's overlap somewhere new — the spread " +
      "order is deciding a value nobody chose"
  );

  // The keys the panel writes are what the sentence quotes; the keys it lets
  // through are what the chart draws. They have to describe one band, and only
  // the panel can be asked — recomputing the curve here would compare two
  // correct answers and prove nothing.
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "gross", amounts: [2000] },
    sectorKey: "Manufacturing",
  });
  assert.ok(
    near(panel.workAccidentMinPct, 100 * panel.workAccident.min) &&
      near(panel.workAccidentMaxPct, 100 * panel.workAccident.max),
    `the chart was sampled at ${panel.workAccidentMinPct}–${panel.workAccidentMaxPct}% ` +
      `while the sentence states ${100 * panel.workAccident.min}–${100 * panel.workAccident.max}%`
  );
  assert.equal(
    panel.ambiguous,
    panel.workAccidentMaxPct > panel.workAccidentMinPct,
    "the flag the copy branches on disagrees with the span the chart was drawn over"
  );
  assert.equal(panel.capGross, params.maxInsurable);
});

test("blanks describe nobody rather than costing zero", () => {
  if (!PAYROLL) return;
  const panel = employerCostPanel({
    payroll: PAYROLL,
    pay: { basis: "net", amounts: [null, 0, undefined, ""] },
  });
  assert.deepEqual(panel.earners, []);
  assert.equal(panel.householdWedgePct, 0);
});

// ---------------------------------------------------------------------------
// The system curve — the version `/how/` draws, with nobody on it
// ---------------------------------------------------------------------------

test("the system curve carries no personal figure and takes no pay", () => {
  // P2: a personal wedge rate is closed on any shareable surface, and `/how/`
  // renders no input at all. There must be no argument through which a salary
  // could reach this.
  assert.equal(systemLabourWedge.length, 1);
  const curve = systemLabourWedge({ payroll: PAYROLL });
  assert.ok(curve.points.length > 10);
  assert.ok(!("earners" in curve), "the system curve must not carry per-person rows");
});

test("the three bands partition the labour cost at every sampled salary", () => {
  // The chart draws a partition rather than an opinion, and that is only true
  // if the shares sum. Three independently computed bands would not have to.
  const curve = systemLabourWedge({ payroll: PAYROLL });
  for (const p of curve.points) {
    assert.ok(
      near(p.netSharePct + p.employeeSharePct + p.employerSharePct, 100, 1e-9),
      `bands sum to ${p.netSharePct + p.employeeSharePct + p.employerSharePct} at €${p.gross}`
    );
  }
});

test("the curve names the appendix its ТЗПБ figures come from, or names neither", () => {
  // P3: these are the only figures on the site read out of a fetched act, and
  // the ДВ permalink is the one link that reaches the table itself. Half a
  // citation is refused for the reason the gazette pair is — a caption reading
  // «Приложение № 2А от —» is what a hand-edited payload would survive as.
  const curve = systemLabourWedge({ payroll: PAYROLL });
  assert.equal(Boolean(curve.appendix), Boolean(curve.sourceUrl));
  assert.equal(Boolean(curve.gazetteIssue), Boolean(curve.gazetteDate));
  if (PAYROLL) {
    assert.ok(curve.sourceUrl.includes("dv.parliament.bg"));
    assert.ok(curve.appendix.includes("Приложение"));
  }
});

test("a payload with no work_accident block still draws, on the act's span", () => {
  // The offline sentinel's job. A first paint before the fetch resolves must
  // not render a labour cost missing its accident line, which would be low by
  // up to 1.1% of gross and look complete.
  const stripped = PAYROLL ? { ...PAYROLL, work_accident: undefined } : null;
  const curve = systemLabourWedge({ payroll: stripped });
  assert.equal(curve.appendix, "");
  assert.ok(curve.points.every((p) => p.employerSharePct > 0));
  assert.ok(curve.workAccident.max > curve.workAccident.min, "the fallback is a span");
});
