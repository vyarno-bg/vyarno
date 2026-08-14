#!/usr/bin/env node
/**
 * Plot geometry — the arithmetic behind every chart on `/market/`.
 *
 * **A tick VALUE is a number a reader reads off the screen.** The axis labels
 * beside every plot are digits, `niceTicks` decides them, and while that lived
 * inside a component the only thing that could go red for it was a browser
 * suite reading a rendered label — which is to say, nothing checked the
 * arithmetic and everything checked one instance of its output.
 *
 * So this file exercises the module, and the cases are the failures the code
 * itself names. Each would ship a chart that renders, looks plausible and is
 * wrong:
 *
 *   - a tick carrying more precision than its own step, so a label reads
 *     «0,6000000000000001 %» on an axis whose whole purpose is round numbers;
 *   - a bound rounded inward, cropping a scale the page promises never to crop;
 *   - zero missing from the values, so the rule at the foot of a positive chart
 *     and through the middle of a signed one goes unlabelled;
 *   - a year axis counted forward from the oldest reading, which drops the
 *     newest year — the end every figure on the page is about;
 *   - a mark placed against the box it was not drawn in, which is what the tall
 *     chart's height parameter exists to prevent;
 *   - a period that coerces to a number without being one, which puts the year
 *     0 on the axis, and a year labelled twice because an unreadable period sat
 *     between two of its readings.
 *
 * `verify_render_market.mjs` still reads the rendered axis, and it is a
 * different question: that the labels this module returns are the ones the page
 * puts on the screen. Neither covers the other.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  span,
  plotY,
  plotX,
  columnX,
  columnW,
  tickAt,
  niceTicks,
  yearTicks,
  sparkY,
  pathOf,
} from "../src/lib/plot.js";
import { near } from "./near.mjs";

/** A series of `values` on consecutive quarters from `startYear`. */
const quarterly = (values, startYear = 2020) => ({
  points: values.map((value, i) => ({
    period: `${startYear + Math.floor(i / 4)}-Q${(i % 4) + 1}`,
    value,
  })),
  min: Math.min(0, ...values),
  max: Math.max(0, ...values),
});

// ---------------------------------------------------------------------------
// The y mapping
// ---------------------------------------------------------------------------

test("a value's y is measured from the top, and the scale's floor sits on the floor", () => {
  const scale = { min: 0, max: 100 };
  assert.equal(plotY(100, scale, 240), 0, "the ceiling is not at the top of the box");
  assert.equal(plotY(0, scale, 240), 240, "the floor is not at the bottom of the box");
  assert.equal(plotY(50, scale, 240), 120);
});

test("every mark is placed in the box it is drawn in, never in the default one", () => {
  // The tall chart is the case. A `plotY` carrying a height of its own would put
  // this page's two-line index plot in the top three quarters of its own frame,
  // with the zero rule floating above the bottom — which reads as a chart whose
  // axis has been cropped, on the page that refuses to crop one.
  const scale = { min: -10, max: 30 };
  assert.equal(plotY(-10, scale, 240), 240);
  assert.equal(plotY(-10, scale, 320), 320, "the tall box's floor is not at its own bottom");
  assert.equal(plotY(30, scale, 320), 0);
  // …and the same value is at a different y in the two boxes, which is the
  // whole reason the height is an argument.
  assert.notEqual(plotY(0, scale, 240), plotY(0, scale, 320));
});

test("a scale with no range still divides", () => {
  // A series of one reading, or of a value that never moved. `span` returning 0
  // would make every y `NaN` and the chart would render as nothing at all.
  assert.equal(span({ min: 5, max: 5 }), 1);
  assert.ok(Number.isFinite(plotY(5, { min: 5, max: 5 }, 240)));
  // `tickAt` divides by the same range and is the third caller. It reaches the
  // page through a different route — the HTML gutter beside the box rather than
  // the SVG — so a NaN here empties the axis labels of a chart whose marks are
  // still drawn, which reads as a picture with no scale rather than as a blank.
  assert.equal(tickAt(5, { min: 5, max: 5 }), 100);
});

// ---------------------------------------------------------------------------
// The x mapping
// ---------------------------------------------------------------------------

test("points span the box edge to edge, and a lone point is centred", () => {
  assert.equal(plotX(0, 5, 600), 0);
  assert.equal(plotX(4, 5, 600), 600, "the last point does not reach the right edge");
  assert.equal(plotX(2, 5, 600), 300);
  // A line of one has no direction to run in, so it goes in the middle rather
  // than dividing by zero and drawing at NaN.
  assert.equal(plotX(0, 1, 600), 300);
});

test("a column takes its own slot and never disappears", () => {
  assert.equal(columnX(0, 4, 600), 18);
  assert.ok(near(columnX(1, 4, 600), 168));
  assert.equal(columnW(4, 600), 114);
  // Eighty-four quarterly readings across 600 units is a slot under a unit
  // wide. Without the floor the columns round away and the chart is empty.
  assert.equal(columnW(2000, 600), 0.8);
  assert.ok(columnW(2000, 600) > 0);
});

// ---------------------------------------------------------------------------
// The y axis
// ---------------------------------------------------------------------------

test("an axis only ever moves outward, so no scale is cropped", () => {
  // Over every range the precision case below covers, because rounding a tick
  // onto its own decimal grid is exactly the operation that could pull a bound
  // inward — and a bound pulled inward crops a scale, which is the one thing
  // the page's charts may never do.
  for (const [lo, hi, want] of [
    [0, 65.7, 5],
    [-19.8, 30.4, 5],
    [0, 1, 5],
    [0, 0.4, 5],
    [-0.3, 0.5, 4],
    [-0.02, 0.11, 5],
    [0, 29130, 5],
    [0, 0.07, 5],
    [0, 3, 5],
    [-1, 1, 4],
  ]) {
    const axis = niceTicks(lo, hi, want);
    assert.ok(axis.min <= lo, `niceTicks(${lo}, ${hi}, ${want}) floor rose to ${axis.min}`);
    assert.ok(axis.max >= hi, `niceTicks(${lo}, ${hi}, ${want}) ceiling fell to ${axis.max}`);
  }
});

test("zero is a tick on every axis, positive or signed", () => {
  // The rule at the foot of a positive chart and through the middle of a signed
  // one is the one a reader reads everything else against. An axis that steps
  // past it labels every gridline but that one.
  for (const [lo, hi] of [
    [0, 100],
    [0, 65.7],
    [-19.8, 30.4],
    [-3, 3],
    [0, 0.4],
    [0, 29130],
    [-0.02, 0.11],
  ]) {
    const axis = niceTicks(lo, hi);
    assert.ok(
      axis.values.some((v) => v === 0),
      `niceTicks(${lo}, ${hi}) labels no zero: ${axis.values.join(", ")}`
    );
  }
});

test("a tick value carries no more precision than its own step", () => {
  // The failure is a LABEL: an axis whose entire purpose is round numbers
  // printing «12 500,000000001 €» or «0,6000000000000001 %». Binary floating
  // point holds neither 0.1 nor 2.5, so it is reachable at any fractional step
  // however the values are reached — multiplying stops the error growing with
  // the index, it does not remove it.
  //
  // A tick is a whole number of steps, so its exact value needs exactly as many
  // decimals as the step does. Anything past that is drift.
  const decimalsOf = (x) => {
    const written = String(x);
    if (written.includes("e")) return 100;
    return written.includes(".") ? written.split(".")[1].length : 0;
  };
  for (const [lo, hi, want] of [
    [0, 12500, 5],
    [0, 29130, 5],
    [0, 25000, 4],
    [-20, 40, 5],
    [0, 100, 5],
    [0, 1, 5],
    [0, 0.4, 5],
    [-0.3, 0.5, 4],
    [0, 7, 5],
    [-0.02, 0.11, 5],
    [0, 65.7, 5],
    [-19.8, 30.4, 5],
    [0, 0.07, 5],
    [-1, 1, 4],
    [0, 3, 5],
  ]) {
    const { values, min, max } = niceTicks(lo, hi, want);
    const step = values[1] - values[0];
    const allowed = decimalsOf(step);
    for (const v of [min, max, ...values]) {
      assert.ok(
        decimalsOf(v) <= allowed,
        `niceTicks(${lo}, ${hi}, ${want}) returned ${v} against a step of ${step}`
      );
    }
  }
});

test("the step is one a reader adds in their head", () => {
  // 2.5 is the one allowed multiple that is not a whole number of its own
  // magnitude, so it is the one whose ticks need a decimal the exponent does not
  // account for. A range of 12 over five intervals picks it: rounded onto the
  // grid the exponent alone gives, the axis reads 0, 3, 5, 8, 10, 13 — gaps that
  // alternate between two and three on a scale whose whole purpose is that a
  // reader can count along it. 1.2 is the same multiple an order of magnitude
  // down, where the decimal the exponent asks for and the one the multiple asks
  // for add.
  for (const [lo, hi] of [
    [0, 100],
    [0, 65.7],
    [0, 29130],
    [-19.8, 30.4],
    [0, 7],
    [0, 12],
    [0, 1.2],
  ]) {
    const { values } = niceTicks(lo, hi);
    const step = values[1] - values[0];
    const magnitude = 10 ** Math.floor(Math.log10(step));
    const normalised = step / magnitude;
    assert.ok(
      [1, 2, 2.5, 5, 10].some((allowed) => near(normalised, allowed)),
      `step ${step} normalises to ${normalised}, which is not 1, 2, 2.5, 5 or 10`
    );
    // Evenly spaced, all the way along. A single uneven gap is a gridline that
    // means something different from the ones either side of it.
    for (let i = 1; i < values.length; i += 1) {
      assert.ok(
        near(values[i] - values[i - 1], step),
        `gap ${i} is ${values[i] - values[i - 1]}, not ${step}`
      );
    }
  }
});

test("the axis reaches its own ends and stops", () => {
  // The loop's bound carries a thousandth of a step in slack, and only a
  // fractional axis can show why. `-0.1 + 4 × 0.1` is 0.30000000000000004, so an
  // axis whose ceiling IS 0.3 stops a tick short of it without the slack: the
  // top gridline goes unlabelled while the columns are still drawn to it, on a
  // chart nothing else calls wrong. 29130 is the other end of the same
  // question — integer arithmetic that cannot drift, so it says the slack never
  // adds a tick PAST the ceiling.
  for (const [lo, hi] of [
    [0, 29130],
    [-0.1, 0.3],
    [0, 0.4],
    [-0.02, 0.11],
    [-1, 1],
  ]) {
    const axis = niceTicks(lo, hi);
    assert.equal(axis.values[0], axis.min, `niceTicks(${lo}, ${hi}) starts above its own floor`);
    assert.equal(
      axis.values[axis.values.length - 1],
      axis.max,
      `niceTicks(${lo}, ${hi}) ends at ${axis.values.at(-1)}, not at its own ceiling ${axis.max}`
    );
  }
});

test("a tick's height is a percentage, so the box cancels", () => {
  // `tickAt` is the join between the SVG and the HTML gutter beside it. It has
  // no height parameter BECAUSE the height cancels — which is what makes it the
  // one helper a caller cannot hand the wrong box.
  const scale = { min: 0, max: 100 };
  assert.equal(tickAt(100, scale), 0, "the ceiling is not at the top of the gutter");
  assert.equal(tickAt(0, scale), 100, "the floor is not at the bottom of the gutter");
  assert.equal(tickAt(25, scale), 75);
  // The same reading, in both of the page's boxes, as a fraction of each.
  for (const h of [240, 320]) {
    assert.ok(near(tickAt(25, scale), (plotY(25, scale, h) / h) * 100));
  }
});

// ---------------------------------------------------------------------------
// The time axis
// ---------------------------------------------------------------------------

test("the newest year is always labelled", () => {
  // Counted forward from the oldest, a step that does not divide the span drops
  // the last year — the end every figure on this page is about. Nine years at a
  // two-year step is the case: forward gives 2016, 2018, 2020, 2022, 2024 and
  // leaves 2025 off.
  for (const years of [3, 7, 9, 11, 13, 21, 40]) {
    const series = quarterly(
      Array.from({ length: years * 4 }, (_, i) => i),
      2005
    );
    const ticks = yearTicks(series, 600);
    const newest = String(2005 + years - 1);
    assert.ok(
      ticks.some((t) => t.year === newest),
      `${years} years: the axis ends at ${ticks[ticks.length - 1]?.year}, not ${newest}`
    );
  }
});

test("a year is placed at its own first reading, not at an even fraction", () => {
  // The two are the same thing only while every year carries a full set of
  // periods. A series starting mid-year labels the wrong columns otherwise,
  // while the picture stays correct — which is a chart nobody can see is wrong.
  const series = {
    points: [
      { period: "2020-Q3", value: 1 },
      { period: "2020-Q4", value: 2 },
      { period: "2021-Q1", value: 3 },
      { period: "2021-Q2", value: 4 },
      { period: "2021-Q3", value: 5 },
    ],
    min: 0,
    max: 5,
  };
  // 2021's first reading is the third of five, so it belongs halfway along. As
  // the second of two years it would sit at the right-hand end, against the last
  // column of the chart — a rule three columns from the one it names.
  const ticks = yearTicks(series, 600);
  assert.deepEqual(
    ticks.map((t) => t.year),
    ["2020", "2021"]
  );
  assert.deepEqual(
    ticks.map((t) => t.at),
    [0, 50]
  );
});

test("a year rule is divided back out of the box the columns were placed in", () => {
  // `yearTicks` answers in a percentage and takes the width anyway, which looks
  // redundant. It is not: `Market.svelte` draws the rule at `(at / 100) * 600`
  // and the reading it names at `plotX(i, n, 600)`, and those are the same
  // double only while the percentage came back out through that same `plotX`.
  //
  // Eight quarters from mid-2020 put 2021's first reading at the fourth of them.
  // Three sevenths of the axis is 42.85714285714286 divided back out of the box
  // and 42.857142857142854 computed from the index alone — one bit, and it
  // reaches the markup as a rule drawn a hairline off its own column. Written
  // out rather than computed, because an expectation reached the way the
  // function reaches it agrees with the function however the function is
  // written.
  const w = 600;
  const points = [
    "2020-Q2",
    "2020-Q3",
    "2020-Q4",
    "2021-Q1",
    "2021-Q2",
    "2021-Q3",
    "2021-Q4",
    "2022-Q1",
  ].map((period, i) => ({ period, value: i }));
  const ticks = yearTicks({ points }, w);
  assert.deepEqual(
    ticks.map((t) => t.year),
    ["2020", "2021", "2022"]
  );
  assert.deepEqual(
    ticks.map((t) => t.at),
    [0, 42.85714285714286, 100]
  );
  // And the consequence on this series, in the markup's own arithmetic: every
  // rule lands on the exact coordinate its column was drawn at.
  for (const [k, i] of [
    [0, 0],
    [1, 3],
    [2, 7],
  ]) {
    assert.equal(
      (ticks[k].at / 100) * w,
      plotX(i, points.length, w),
      `${ticks[k].year}'s rule is at ${(ticks[k].at / 100) * w}, its column at ${plotX(i, points.length, w)}`
    );
  }
});

test("a long series is thinned rather than smeared", () => {
  // Six labels is what a 360px plot holds without them touching, and the step
  // is chosen from the number of years rather than from the viewport — so the
  // phone and the desk get one picture instead of two layouts.
  //
  // Thirteen years is here because it is the only span under thirty where
  // counting LABELS and counting INTERVALS disagree: at a two-year step that
  // series has six intervals and seven labels, so a rule reading the intervals
  // admits a step the axis has no room for. Every other span in the sweep is
  // thinned identically either way, which is what makes this one the case.
  for (const years of [1, 6, 7, 12, 13, 21, 40, 200]) {
    const series = quarterly(
      Array.from({ length: years * 4 }, (_, i) => i),
      1900
    );
    const ticks = yearTicks(series, 600);
    assert.ok(ticks.length <= 6 || years > 150, `${years} years drew ${ticks.length} labels`);
    assert.ok(ticks.length >= 1, `${years} years drew no label at all`);
  }
});

test("a series with no readable period gets no axis rather than a wrong one", () => {
  // A period is `2026`, `2026-Q1` or `2026-01` in every payload here, so the
  // axis wants exactly a four-digit head — not anything that merely coerces
  // like one. `Number("")` is 0, and read as a year it puts «0» on the axis of
  // a chart that is otherwise correct: a label a reader cannot account for and
  // no other test could see.
  assert.deepEqual(yearTicks({ points: [] }, 600), []);
  assert.deepEqual(yearTicks({ points: [{ period: null }, { period: undefined }] }, 600), []);
  assert.deepEqual(yearTicks({ points: [{ period: "not-a-year" }] }, 600), []);
  assert.deepEqual(yearTicks({ points: [{ period: "" }] }, 600), []);
  assert.deepEqual(yearTicks({ points: [{ period: " 12" }, { period: "2e30" }] }, 600), []);
  // …and a period that IS one still works, written as a number or a string.
  assert.deepEqual(yearTicks({ points: [{ period: 2026 }] }, 600), [{ year: "2026", at: 50 }]);
});

test("a year is labelled once, whatever sits between its readings", () => {
  // The parse and the dedupe are two passes for this. Merged, the dedupe
  // compares against the previous MAPPED point rather than the previous
  // surviving one, so an unreadable period between two readings of the same
  // year lets the second through and the axis carries that year twice — two
  // rules through one column, on a chart nothing else would call wrong.
  const ticks = yearTicks(
    {
      points: [{ period: "2024-Q1" }, { period: "" }, { period: "2024-Q3" }, { period: "2025-Q1" }],
    },
    600
  );
  assert.deepEqual(
    ticks.map((t) => t.year),
    ["2024", "2025"]
  );
});

// ---------------------------------------------------------------------------
// The sparkline, and the path
// ---------------------------------------------------------------------------

test("a sparkline mark at either extreme is drawn whole, not clipped", () => {
  // The inset is why the box is not used edge to edge: a 2px radius mark at the
  // top of a 26px box would be half outside it.
  const scale = { min: 0, max: 10 };
  assert.equal(sparkY(10, scale, 26), 2);
  assert.equal(sparkY(0, scale, 26), 24);
  assert.ok(sparkY(10, scale, 26) > 0);
  assert.ok(sparkY(0, scale, 26) < 26);
});

test("a path runs M to the first point and L to the rest, on this box", () => {
  const series = { points: [{ value: 0 }, { value: 50 }, { value: 100 }], min: 0, max: 100 };
  assert.equal(pathOf(series, 600, 240), "M0.00 240.00 L300.00 120.00 L600.00 0.00");
});

test("a path is written to two decimals, not to seventeen", () => {
  const series = {
    points: Array.from({ length: 7 }, (_, i) => ({ value: i })),
    min: 0,
    max: 6,
  };
  for (const n of pathOf(series, 600, 240).matchAll(/[\d.]+/g)) {
    const decimals = n[0].includes(".") ? n[0].split(".")[1].length : 0;
    assert.equal(decimals, 2, `${n[0]} is not written to two decimals`);
  }
});
