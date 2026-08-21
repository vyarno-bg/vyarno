#!/usr/bin/env node
/**
 * The figures `/how/` renders with nobody in them.
 *
 * Everything here answers a question about Bulgaria rather than about the
 * person reading, which is what lets that page render with no inputs on it at
 * all — and, because none of these can take a reader's figure as an argument,
 * what keeps it on the right side of P1 and P2 by construction rather than by
 * review. The wrong numbers are anchoring the ladder on one област's average
 * instead of the country's, a rung that misses the insurance ceiling so the
 * wedge's peak falls off the table, a citation taken from a publisher that
 * does not own the figure, and a city's trend drawn from another city's
 * series.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  systemWedgeLadder,
  wedgeCurve,
  payLadder,
  cityHomeAtAverageWage,
  cityTrend,
  seriesCells,
  quarterGrid,
  QUARTERS,
  nationalQuarter,
  nationalRow,
  unemploymentHistory,
} from "../src/lib/view/country.js";
import { sectorOptions, SECTOR_TOTAL_KEY, taxWedgePanel } from "../src/lib/view/payroll.js";
import { regionQuarter, regionRow, cityRow, SOFIA_CITY_CODE } from "../src/lib/view/region.js";
import { HOME } from "../src/lib/content.js";
import { bgNetSalary, flooredCuts, payrollParams } from "../src/lib/mirror.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

/** The published payroll payload, which the wedge ladder and the net wage read. */
const PAYROLL = read("payroll");

// ---------------------------------------------------------------------------
// THE COUNTRY, WITH NOBODY IN IT
//
// The four values `/how/` renders. What they have in common is the property
// that page is built on: each takes published payloads and no scalar a reader
// could have typed, so the wrong wiring — a personal figure on a page with no
// reader — is not expressible rather than merely untested.
// ---------------------------------------------------------------------------

test("systemWedgeLadder reads the ceiling, the rates and the minimum wage from the payload", () => {
  if (!PAYROLL) return;
  const ladder = systemWedgeLadder({ payroll: PAYROLL });
  assert.ok(
    near(ladder.maxInsurable, PAYROLL.max_insurable_income_eur, 1e-9),
    "the ladder's ceiling is not payroll.json's"
  );
  // The fourth figure the ДВ citation dates, and the one whose slot sits beside
  // a number four times its size. `/how/` renders it as Bulgaria's statutory
  // minimum wage; filled from the insurance ceiling the page would state €2,300
  // as the lowest lawful monthly pay in the country, from a payload that
  // publishes both and a caption that dates both to the same act.
  assert.ok(
    near(ladder.minWageGross, PAYROLL.min_wage_gross_eur, 1e-9),
    "the minimum wage on the page is not payroll.json's"
  );
  assert.notEqual(ladder.minWageGross, ladder.maxInsurable);
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
  const lifted = systemWedgeLadder({ payroll: { ...PAYROLL, min_wage_gross_eur: 700 } });
  assert.ok(near(lifted.minWageGross, 700, 1e-9), "the minimum wage is hardcoded, not read");
  assert.ok(near(lifted.maxInsurable, PAYROLL.max_insurable_income_eur, 1e-9));
});

test("the wedge ladder carries the ДВ issue the four figures are cited by", () => {
  if (!PAYROLL) return;
  const ladder = systemWedgeLadder({ payroll: PAYROLL });
  assert.equal(ladder.gazetteIssue, PAYROLL.gazette_issue ?? null);
  assert.equal(ladder.gazetteDate, PAYROLL.gazette_date ?? "");
  // A published set assembled from several acts has no single issue, and the
  // caption falls back to the year. Both halves go together — «бр. 68 от —»
  // is a citation ДВ's archive cannot be searched with, and it is the shape a
  // payload edited by hand produces.
  const half = systemWedgeLadder({ payroll: { ...PAYROLL, gazette_date: null } });
  assert.equal(half.gazetteIssue, null, "an issue with no date reached the caption");
  const other = systemWedgeLadder({ payroll: { ...PAYROLL, gazette_issue: null } });
  assert.equal(other.gazetteDate, "", "a date with no issue reached the caption");
  // Read, not closed over: the next ЗБДОО moves the issue.
  const moved = systemWedgeLadder({
    payroll: { ...PAYROLL, gazette_issue: 3, gazette_date: "2027-01-09" },
  });
  assert.equal(moved.gazetteIssue, 3);
  assert.equal(moved.gazetteDate, "2027-01-09");
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

test("wedgeCurve draws the same curve the results card does, with nobody on it", () => {
  // One statute, two pages, one sampler. Drawn from a second implementation
  // the country page and the results card would be two pictures of one law —
  // correctable in one place and stale in the other, and no assertion about
  // either drawing could see the disagreement, because each would be right
  // about itself.
  if (!PAYROLL) return;
  const country = wedgeCurve({ payroll: PAYROLL });
  const personal = taxWedgePanel({ payroll: PAYROLL, pay: { basis: "net", amounts: [1500] } });
  assert.deepEqual(
    country.points,
    personal.points,
    "the country page and the results card sample the wedge differently"
  );
  assert.equal(country.capGross, payrollParams(PAYROLL).maxInsurable);
  assert.equal(country.peakEffectivePct, personal.peakEffectivePct);
});

test("wedgeCurve has no parameter a reader's own figure could arrive through", () => {
  // The whole of the difference between this and `taxWedgePanel`, and the
  // reason `/how/` calls this one. `WedgeChart` draws whatever markers it is
  // handed and cannot tell whose they are, so what keeps a personal effective
  // rate off a page with no input is that there is nothing here to pass it
  // through — P2, made unexpressible rather than merely untested.
  assert.equal(wedgeCurve.length, 1, "wedgeCurve takes more than its one options bag");
  const arg = String(wedgeCurve).slice(0, String(wedgeCurve).indexOf(")") + 1);
  assert.ok(
    !/\bpay\b|earners|amounts|salary|gross\s*[,}]/.test(arg),
    `wedgeCurve's signature has grown a way in for a reader's own figure: ${arg}`
  );
  assert.equal(
    wedgeCurve({ payroll: PAYROLL }).earners,
    undefined,
    "wedgeCurve returned markers, so the country page can draw somebody onto its curve"
  );
});

test("wedgeCurve keeps the ceiling as a sample, so the kink is where the law is", () => {
  // A curve whose only kink is stepped over is drawn as a straight line, which
  // is a wrong picture rather than a coarse one — and the fall above the
  // ceiling is the section's whole finding.
  if (!PAYROLL) return;
  const { points, capGross } = wedgeCurve({ payroll: PAYROLL });
  assert.ok(
    points.some((p) => p.gross === capGross),
    "the insurance ceiling is not one of the sampled points"
  );
  const below = points.filter((p) => p.gross < capGross);
  const above = points.filter((p) => p.gross > capGross);
  assert.ok(below.length > 1 && above.length > 1, `the curve has ${points.length} points`);
  // Flat below, falling above: the two facts the picture exists to carry.
  assert.ok(
    below.every((p) => near(p.effectivePct, below[0].effectivePct, 1e-9)),
    "the effective rate is not constant below the ceiling"
  );
  assert.ok(
    above.at(-1).effectivePct < below[0].effectivePct,
    "the effective rate does not fall above the ceiling"
  );
  assert.ok(
    above.every((p) => p.marginalPct < below[0].marginalPct),
    "the marginal rate does not step down above the ceiling"
  );
});

test("payLadder pairs each rung with its cut, and says which were surveyed", () => {
  const dist = read("salary_dist");
  const wage = read("sector_salary");
  if (!dist || !wage || !PAYROLL) return;
  const ladder = payLadder({ salaryDist: dist, sectorSalary: wage, payroll: PAYROLL });

  assert.equal(ladder.rungs.length, 11, "the ladder no longer has one row per published cut");
  assert.deepEqual(
    ladder.rungs.map((r) => r.cut),
    [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99],
    "the cuts are out of order or out of step with the published ladder"
  );
  // Rising in both columns: a table where a higher rung pays less is a
  // re-levelling that went wrong, and it looks entirely ordinary.
  //
  // **Weakly, and only because the statutory floor binds.** A scalar re-level
  // moves the whole shape by however much the MEAN moved, and Bulgaria's
  // minimum wage has moved faster, so the bottom of the scaled shape lands
  // under a wage it is not lawful to pay — `mirror.js#composeLadder` floors
  // every rung there. Two rungs sharing the floor are the floor doing its job;
  // anything above it that fails to rise is the re-levelling going wrong, and
  // the second loop is what keeps this from being a weaker test than it reads.
  const params = payrollParams(PAYROLL);
  const floor = params.minWageGross;
  // **Every rung's net is the net OF ITS OWN GROSS, and P1 is where that is
  // decided.** The two columns arrive from two calls over one cut list, so a
  // whole-column shift pairs each rung with the take-home of the cut below it —
  // monotonic in both directions, every figure a real Bulgarian net wage, and
  // the bottom rung reading €0/month. The monotonicity loop below starts at
  // index 1, so the shifted-in zero sits outside every comparison it makes.
  for (const rung of ladder.rungs) {
    assert.ok(
      near(rung.net, bgNetSalary(rung.gross, params).net, 1e-9),
      `P${rung.cut} shows €${rung.net} net against €${rung.gross} gross`
    );
    assert.ok(rung.net > 0, `P${rung.cut} takes home nothing`);
  }
  for (let i = 1; i < ladder.rungs.length; i += 1) {
    assert.ok(ladder.rungs[i].gross >= floor, "a rung composes below the statutory minimum wage");
    assert.ok(ladder.rungs[i].gross >= ladder.rungs[i - 1].gross, "the gross rungs are not rising");
    assert.ok(ladder.rungs[i].net >= ladder.rungs[i - 1].net, "the net rungs are not rising");
    assert.ok(ladder.rungs[i].net < ladder.rungs[i].gross, "a net rung is not below its gross");
  }
  const abovefloor = ladder.rungs.filter((r) => r.gross > floor);
  for (let i = 1; i < abovefloor.length; i += 1) {
    assert.ok(
      abovefloor[i].gross > abovefloor[i - 1].gross,
      "two rungs clear of the minimum wage carry the same gross"
    );
  }

  // SES publishes three points for BG. Everything else is interpolated, and
  // the page has to be able to say so per row — a table that called every rung
  // surveyed would present eight interpolations as measurements.
  //
  // **Minus whichever of the three the statutory floor replaced.** D1 re-levels
  // under the minimum wage on the payloads shipped today, so what P10 publishes
  // is the minimum wage; calling that row «измерено» credits Eurostat with a
  // figure that came out of the ЗБДОО, on the one column whose job is telling a
  // measurement from a model.
  //
  // The floored set is recomputed from the payloads rather than read back off
  // the rungs under test: an expectation built out of each rung's own
  // `atMinWage` agrees with whatever the rungs say, including a `surveyed` that
  // stopped subtracting the floor at all.
  const floored = flooredCuts(dist, ladder.anchorGross, params);
  assert.deepEqual(
    ladder.rungs.filter((r) => r.atMinWage).map((r) => r.cut),
    [...floored].sort((a, b) => a - b),
    "the rungs marked as replaced by the floor are not the ones the floor replaced"
  );
  assert.deepEqual(
    ladder.rungs.filter((r) => r.surveyed).map((r) => r.cut),
    [10, 50, 90].filter((cut) => !floored.has(cut)),
    "the surveyed rungs are not D1, the median and D9 less the floored ones"
  );
  // No row carries both markers, and every floored row is at the floor. The
  // pair is what the basis column branches on, so a row that answered to both
  // would render whichever branch happened to be written first.
  for (const rung of ladder.rungs) {
    assert.ok(!(rung.surveyed && rung.atMinWage), `P${rung.cut} is marked surveyed and floored`);
    if (rung.atMinWage)
      assert.equal(rung.gross, floor, `P${rung.cut} is marked floored but is not`);
  }
});

test("payLadder takes each provenance from the publisher that owns it", () => {
  // The level's URL and period come from the НСИ payload and the shape's from
  // the Eurostat one. Reading them crosswise would put НСИ's provenance on a
  // Eurostat figure, which is the page-side version of the defect
  // `no НСИ payload carries a second publisher's figures` prevents in the data.
  const dist = read("salary_dist");
  const wage = read("sector_salary");
  if (!dist || !wage || !PAYROLL) return;
  const ladder = payLadder({ salaryDist: dist, sectorSalary: wage, payroll: PAYROLL });
  assert.equal(ladder.anchorUrl, wage.source_url);
  assert.equal(ladder.anchorPeriod, wage.ref_period);
  assert.equal(ladder.anchorGross, nationalQuarter(wage).value);
  assert.equal(ladder.shapeUrl, dist.shape.source_url);
  assert.equal(ladder.shapeYear, String(dist.shape.ref_year));

  // Nothing at all rather than a ladder standing on a zero anchor: without the
  // НСИ level the rungs would be SES's 2022 euro amounts wearing this
  // quarter's date.
  const orphaned = payLadder({ salaryDist: dist, sectorSalary: null, payroll: PAYROLL });
  assert.equal(orphaned.anchorGross, 0);
  assert.deepEqual(
    orphaned.rungs.map((r) => r.gross),
    new Array(11).fill(0),
    "the ladder was re-levelled onto nothing and printed numbers anyway"
  );
});

test("the ladder is anchored on the country's average and never on one област's", () => {
  // **The failure this catches is invisible on screen.** Re-levelling
  // Eurostat's national spread onto София's mean rescales every rung by
  // 1915/1407 — the ladder stays monotonic, every rung stays a plausible
  // Bulgarian wage, and a reader in Видин is told they are ahead of 27% of
  // earners when the country's own ladder puts them at 49%. No gate, no
  // formula test and no render test can see it; only the identity below can.
  //
  // SES publish D1, the median and D9 for Bulgaria and nothing below that, at
  // any vintage, from any publisher, so a national spread times a national
  // mean is the only pair that describes one population.
  const dist = read("salary_dist");
  const sectors = read("sector_salary");
  const regions = read("region_salary");
  if (!dist || !sectors || !regions || !PAYROLL) return;

  const ladder = payLadder({ salaryDist: dist, sectorSalary: sectors, payroll: PAYROLL });
  const national = nationalQuarter(sectors);
  assert.equal(ladder.anchorGross, national.value);

  // And it is a DIFFERENT figure from every област's, which is what makes the
  // assertion above a real one rather than a coincidence of today's data.
  for (const row of regions.regions) {
    assert.notEqual(
      ladder.anchorGross,
      regionQuarter(regions, row.code).value,
      `the ladder is anchored on ${row.code}'s average rather than the country's`
    );
  }
  // The all-activities row is not a sector, and the picker must keep refusing
  // it — this function is the one place the app wants it.
  assert.ok(
    !sectorOptions(sectors).some((o) => o.key === SECTOR_TOTAL_KEY),
    "the all-activities row the ladder is anchored on is offered as a sector"
  );
});

test("nationalQuarter reads НСИ's published quarter and computes nothing", () => {
  // The same property `regionQuarter` holds, on the row the ladder's level now
  // comes from: §2.1.1 of НСИ's licence forbids distributing производни
  // произведения, so the level has to BE a cell they printed (docs/legal.md
  // §НСИ). An averaging step here would move no figure a reader could check
  // against anything.
  const payload = read("sector_salary");
  if (!payload) return;
  const total = payload.sectors.find((s) => s.en_name === SECTOR_TOTAL_KEY);
  assert.ok(total, "sector_salary.json carries no all-activities row to anchor on");

  const q = nationalQuarter(payload);
  assert.match(q.refPeriod, /^\d{4}-Q[1-4]$/);
  assert.equal(q.value, total.value_eur);
  assert.equal(q.value, total.series_by_period[q.refPeriod]);
  const newest = Object.keys(total.series_by_period)
    .filter((k) => /^\d{4}-Q[1-4]$/.test(k))
    .sort()
    .at(-1);
  assert.equal(q.refPeriod, newest, "the level is not НСИ's newest published quarter");

  // A payload with no «Общо» row is the empty state, never the first sector:
  // «Добивна промишленост» in that position would re-level the whole ladder
  // onto mining pay and look exactly as ordinary.
  assert.deepEqual(nationalQuarter({ sectors: payload.sectors.filter((s) => s !== total) }), {
    value: 0,
    refPeriod: "",
    isPreliminary: false,
  });
  for (const junk of [null, undefined, {}, { sectors: [] }]) {
    assert.deepEqual(nationalQuarter(junk), { value: 0, refPeriod: "", isPreliminary: false });
  }
});

test("nationalQuarter falls back to НСИ's newest quarter, and to no month at all", () => {
  // Two branches a live payload never enters, because it carries both a
  // `value_eur` and a quarter-shaped `ref_period` and takes the headline path.
  // They are what an older envelope lands on, and both are one character from
  // the wrong cell: the OLDEST quarter instead of the newest re-levels the whole
  // ladder onto a wage from years back, and a monthly key read as a quarter
  // quotes one month as the quarterly level — March runs ~7.6% above its own
  // quarter on the published series.
  const totalRow = (series) => ({
    sectors: [{ en_name: SECTOR_TOTAL_KEY, series_by_period: series }],
  });

  const q = nationalQuarter(
    totalRow({ "2024-Q2": 1100, "2026-Q1": 1407, "2025-Q3": 1250, "2026-Q2": null })
  );
  assert.equal(q.refPeriod, "2026-Q1", "the fallback is not НСИ's newest published quarter");
  assert.equal(q.value, 1407);

  // Quarter-shaped keys only, both in the series and in the period the payload
  // states. The monthly key above sorts last of the four and is not a quarter;
  // this one is the whole series.
  const monthly = nationalQuarter(totalRow({ "2026-01": 1865, "2026-02": 1818, "2026-03": 2061 }));
  assert.equal(monthly.value, 0);
  assert.equal(monthly.refPeriod, "");

  // A stated `ref_period` that is not a quarter cannot date the headline either,
  // so the row's own quarters answer instead of a month wearing the label.
  const dated = nationalQuarter({
    ref_period: "2026-M05",
    sectors: [
      { en_name: SECTOR_TOTAL_KEY, value_eur: 1500, series_by_period: { "2026-Q1": 1407 } },
    ],
  });
  assert.equal(dated.refPeriod, "2026-Q1");
  assert.equal(dated.value, 1407);
});

test("nationalRow hands /how/'s wage grid the country's row and no sector's", () => {
  // The grid under the ladder prints НСИ's own quarterly cells, and it prints
  // the country's because the ladder above it is anchored on the country's. One
  // selector for both, so the table and the anchor cannot describe different
  // rows — and it selects «Общо» BY NAME. Selecting any other row draws one
  // industry's quarters under a heading that says Bulgaria, beside a ladder
  // still anchored on the real total: «Селско, горско и рибно стопанство» runs
  // well under the country's average and every cell of it is a figure НСИ
  // printed.
  const payload = read("sector_salary");
  if (!payload) return;
  const row = nationalRow(payload);
  assert.ok(row, "sector_salary.json carries no all-activities row for the grid");
  assert.equal(row.en_name, SECTOR_TOTAL_KEY);
  // The grid and the ladder's anchor are the same cell, which is the whole
  // reason there is one selector.
  assert.equal(row.value_eur, nationalQuarter(payload).value);
  assert.equal(
    quarterGrid(row).flatMap((r) => r.cells.filter(Boolean)).length,
    seriesCells(row).length
  );
  // Selected by name and not by position, wherever НСИ put the row.
  const shuffled = {
    sectors: [
      { en_name: "Agriculture, forestry and fishing", value_eur: 900 },
      { en_name: SECTOR_TOTAL_KEY, value_eur: 1407 },
      { en_name: "Information and communication", value_eur: 3900 },
    ],
  };
  assert.equal(nationalRow(shuffled).value_eur, 1407);
  // No «Общо» row is nothing rather than whichever sector is nearest.
  assert.equal(
    nationalRow({ sectors: payload.sectors.filter((s) => s.en_name !== SECTOR_TOTAL_KEY) }),
    null
  );
  for (const junk of [null, undefined, {}, { sectors: [] }]) assert.equal(nationalRow(junk), null);
});

test("the offline ladder sentinel selects the same way the live payload does", () => {
  // `HOME.nationalWageFallback` is what composes the rungs for the few hundred
  // milliseconds before `sector_salary.json` lands. It goes through the same
  // selector, so the pre-load ladder cannot be built differently from the
  // loaded one — and it carries НСИ's own quarter, because a sentinel is a
  // shipped figure like any other (docs/legal.md §НСИ).
  const sentinel = nationalQuarter(HOME.nationalWageFallback);
  assert.match(sentinel.refPeriod, /^\d{4}-Q[1-4]$/);
  assert.ok(sentinel.value > 0);
  assert.equal(
    sentinel.value,
    HOME.nationalWageFallback.sectors[0].series_by_period[sentinel.refPeriod],
    "the sentinel headline is not one of its own published cells"
  );
});

test("the trend on a card is the card's own city's, at both ends", () => {
  // **The failure this exists for was on screen for twenty-six cities.** The
  // calculator read the baseline year and the since-baseline percentage off
  // `cityHome`, which is the country page's reference city and stays София on
  // purpose. So the housing card printed София's 2015 and София's +232% beside
  // Варна's €/m², under Варна's name, with the chart's own end labels
  // correctly Варна's. Every number was real; two of them were about somewhere
  // else, and nothing about the card looked wrong.
  const prices = read("city_price");
  if (!prices) return;
  for (const city of prices.cities) {
    const trend = cityTrend(prices, city.code);
    assert.equal(trend.baselineYear, city.baseline_year, city.code);
    assert.equal(trend.sinceBaselinePct, city.since_baseline_median_pct, city.code);
    assert.equal(trend.trendPublishable, Boolean(city.trend_publishable), city.code);
    assert.equal(trend.nDistricts, city.n_districts, city.code);
    // The baseline year is the OLDEST published year, never the newest — the
    // one-character difference the extraction exists to make once.
    if (city.historical.length) {
      assert.equal(trend.baselineYear, city.historical[0].year, city.code);
      assert.equal(
        trend.sinceBaselinePct,
        city.historical.at(-1).since_baseline_median_pct,
        city.code
      );
    }
  }
  // An unknown or absent city is zeroed, never the first row's.
  for (const code of ["", null, undefined, "atlantis"]) {
    assert.deepEqual(cityTrend(prices, code), {
      sinceBaselinePct: 0,
      baselineYear: 0,
      trendPublishable: false,
      nDistricts: 0,
    });
  }
});

test("a run too short to be a trend says no since-year at all", () => {
  // имот.bg's coverage of a city runs from one year to two decades, and «+4%
  // от 2024» in the voice of a two-decade series is the wrong claim rather
  // than a small one. The pipeline decides it over the whole series
  // (`sources/imot.py#MIN_TREND_YEARS`) and publishes the answer, so every
  // surface reaches the same one instead of counting rows.
  const short = { cities: [{ code: "x", baseline_year: 2024, since_baseline_median_pct: 3.7 }] };
  assert.equal(cityTrend(short, "x").trendPublishable, false);
  const long = { cities: [{ code: "x", baseline_year: 2003, trend_publishable: true }] };
  assert.equal(cityTrend(long, "x").trendPublishable, true);
  // And the percentage is still carried — the chart keeps every qualifying
  // year, it is only the sentence that waits.
  assert.equal(cityTrend(short, "x").sinceBaselinePct, 3.7);
});

test("cityHomeAtAverageWage prices a home against a NET wage, not a gross", () => {
  // Fed the gross, the years-of-salary figure is about a fifth too flattering
  // — the direction AGENTS.md forbids by name, on the one figure the page
  // exists to state plainly.
  const price = read("city_price");
  const wage = read("region_salary");
  if (!price || !wage || !PAYROLL) return;
  const home = cityHomeAtAverageWage({
    cityPrice: price,
    cityCode: SOFIA_CITY_CODE,
    regionSalary: wage,
    regionCode: SOFIA_CITY_CODE,
    payroll: PAYROLL,
    m2: 70,
  });
  const priceRow = cityRow(price, SOFIA_CITY_CODE);
  assert.equal(home.eurPerM2, priceRow.eur_per_m2_median);
  // The city's OWN page, because the median on screen is ours across that
  // page's district rows.
  assert.equal(home.sourceUrl, priceRow.source_url);
  assert.match(home.sourceUrl, /^https:\/\//);
  assert.equal(home.grossMonthly, regionQuarter(wage, SOFIA_CITY_CODE).value);
  assert.equal(home.wagePeriod, wage.ref_period);
  assert.ok(
    home.netMonthly < home.grossMonthly,
    "the wage the home is priced against was not converted to net"
  );
  assert.ok(near(home.price, priceRow.eur_per_m2_median * 70, 1e-9));
  assert.ok(
    near(home.years, home.price / (12 * home.netMonthly), 1e-9),
    "the years figure is not the price over a year of that take-home"
  );

  // The size is the caller's, so the page has to state it — a function that
  // picked its own would let a price be printed without saying what it prices.
  const smaller = cityHomeAtAverageWage({
    cityPrice: price,
    cityCode: SOFIA_CITY_CODE,
    regionSalary: wage,
    regionCode: SOFIA_CITY_CODE,
    payroll: PAYROLL,
    m2: 50,
  });
  assert.ok(smaller.price < home.price && smaller.years < home.years);

  // The two ends of the price ladder, and which end each figure comes from.
  // The strip renders the rise BESIDE the sparkline drawn from the same array,
  // so a swap prints the baseline level as this year's rise and neither figure
  // looks wrong on its own. `.at(-1)` against `[0]` is the whole difference,
  // which is why the selection is here rather than in a `$derived` no test
  // reaches — `calculator.svelte.js#citySinceBaselinePct` reads both from this.
  //
  // Both are read off the city's OWN row rather than off the array's ends: the
  // baseline is per-city now, chosen from how far back имот.bg's coverage of
  // that city holds, so the row and the chart have to agree about which year it
  // is and this is where that is checked.
  const row = cityRow(price, SOFIA_CITY_CODE);
  const history = row.historical ?? [];
  if (history.length > 1) {
    assert.equal(
      home.sinceBaselinePct,
      history.at(-1).since_baseline_median_pct,
      "the since-baseline rise came off the wrong end of the price history"
    );
    assert.equal(home.sinceBaselinePct, row.since_baseline_median_pct);
    assert.equal(
      home.baselineYear,
      history[0].year,
      "the baseline year came off the wrong end of the price history"
    );
    assert.equal(home.baselineYear, row.baseline_year);
    assert.ok(
      home.baselineYear < history.at(-1).year,
      "the baseline is not the oldest year in the ladder"
    );
  }

  // A payload with no historical block must report nothing rather than a zero
  // rise, which would render as «+0% от 2015 г.» over a year nobody published.
  const flat = cityHomeAtAverageWage({
    cityPrice: { ...price, historical: [] },
    regionSalary: wage,
    payroll: PAYROLL,
    m2: 70,
  });
  assert.equal(flat.sinceBaselinePct, 0);
  assert.equal(flat.baselineYear, 0);
});

test("the €/m² link follows the city, and is not one page's held beside it", () => {
  // София's page is имот.bg's bare `/sredni-ceni` and `prodazhbi-sofiya` 302s
  // to it, so a constant spelling that one URL is right for the city `/how/`
  // shows and wrong for twenty-six others — which is invisible while the
  // reference city never moves. Read off the row it cannot be: a caller has to
  // say which city it means, and gets that city's page.
  const price = read("city_price");
  if (!price || !PAYROLL) return;
  const of = (code) =>
    cityHomeAtAverageWage({
      cityPrice: price,
      cityCode: code,
      regionSalary: read("region_salary"),
      regionCode: code,
      payroll: PAYROLL,
      m2: 70,
    }).sourceUrl;
  const links = new Map(price.cities.map((c) => [c.code, of(c.code)]));
  for (const c of price.cities) {
    assert.equal(links.get(c.code), c.source_url, `${c.code} links to another city's page`);
  }
  assert.ok(
    new Set(links.values()).size >= price.cities.length - 1,
    "two cities share a €/m² link, so at least one of them cites district rows " +
      "that are not the ones its median was taken across"
  );
  assert.equal(of("no-such-city"), "", "a city with no row got a link to somewhere");
});

test("cityHomeAtAverageWage prints nothing when either end is missing", () => {
  const wage = read("region_salary");
  if (!wage || !PAYROLL) return;
  const noPrice = cityHomeAtAverageWage({
    cityPrice: null,
    regionSalary: wage,
    regionCode: SOFIA_CITY_CODE,
    payroll: PAYROLL,
    m2: 70,
  });
  assert.equal(noPrice.price, 0);
  assert.equal(noPrice.years, 0);
  const noWage = cityHomeAtAverageWage({
    cityPrice: read("city_price"),
    cityCode: SOFIA_CITY_CODE,
    regionSalary: null,
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
  const wage = regionRow(read("region_salary"), SOFIA_CITY_CODE);
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
  const wage = regionRow(read("region_salary"), SOFIA_CITY_CODE);
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

test("the unemployment curve floors at zero, and its two ends come off the points", () => {
  // Cropped to its own band, any fall draws unemployment reaching nothing.
  // Against zero it draws the fraction of the old rate it actually is. There is
  // no argument here that would let a caller raise the floor.
  const payload = read("unemployment");
  if (!payload) return; // no refresh in this checkout
  const history = unemploymentHistory(payload);
  assert.equal(history.min, 0);
  const values = Object.values(payload.series_by_period);
  assert.equal(history.max, Math.max(...values));
  assert.equal(history.peak.value, Math.max(...values));
  assert.equal(history.trough.value, Math.min(...values));
  // The latest reading is the payload's own headline, so the figure above the
  // chart and the right-hand end of the line cannot disagree.
  assert.equal(history.latest.value, payload.value);
  assert.equal(history.latest.period, payload.ref_period);
  assert.equal(history.to, payload.ref_period);
});

test("the unemployment curve is published cells in order, and nothing else", () => {
  const history = unemploymentHistory({
    series_by_period: { "2020-04": 6.7, "2020-01": 5.2, "2026-06": 3.0 },
    source_url: "https://ec.europa.eu/eurostat/",
  });
  assert.deepEqual(
    history.points.map((p) => p.period),
    ["2020-01", "2020-04", "2026-06"]
  );
  assert.equal(history.peak.period, "2020-04");
  assert.equal(history.trough.period, "2026-06");
  assert.equal(history.sourceUrl, "https://ec.europa.eu/eurostat/");
});

test("a break the publisher declared reaches the chart as a mark of its own", () => {
  // Eurostat flag Bulgaria's series at a month of their own, and a chart that
  // joins the two stretches without saying so has made a claim on their behalf
  // that they declined to make. The months come off `status_by_period`, so a
  // flag Eurostat move or withdraw moves the rule with it.
  const history = unemploymentHistory({
    series_by_period: { "2000-01": 14.3, "2009-01": 6.4, "2026-06": 3.0 },
    status_by_period: { "2009-01": "b" },
  });
  assert.deepEqual(history.breaks, [{ period: "2009-01", i: 1 }]);

  // Only `b`. The other letters qualify a reading — estimated, provisional,
  // counted differently — and none of them says the line either side is two
  // measurements, which is the only thing a rule through the plot can mean.
  for (const letter of ["e", "p", "d", "", "bp"]) {
    const flagged = unemploymentHistory({
      series_by_period: { "2000-01": 14.3, "2009-01": 6.4, "2026-06": 3.0 },
      status_by_period: { "2009-01": letter },
    });
    assert.equal(
      flagged.breaks.length,
      letter.includes("b") ? 1 : 0,
      `${letter || "an unflagged month"} drew the wrong number of rules`
    );
  }

  // A break at the first point is not a break within the line — there is
  // nothing to its left for the rule to separate it from, and a rule on the
  // y-axis reads as furniture.
  const atStart = unemploymentHistory({
    series_by_period: { "2000-01": 14.3, "2026-06": 3.0 },
    status_by_period: { "2000-01": "b" },
  });
  assert.deepEqual(atStart.breaks, []);

  // And a payload from before the flags were published draws no rules rather
  // than failing: `status_by_period` is a field the site reads, not one it
  // requires.
  assert.deepEqual(unemploymentHistory({ series_by_period: { a: 1, b: 2 } }).breaks, []);
});

test("a series with no line in it draws no chart rather than an empty box", () => {
  assert.equal(unemploymentHistory({ series_by_period: { "2026-06": 3.0 } }), null);
  assert.equal(unemploymentHistory({}), null);
  assert.equal(unemploymentHistory(null), null);
});
