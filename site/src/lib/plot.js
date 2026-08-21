/**
 * Plot geometry: the mapping from a published figure to a coordinate in a box,
 * and the two axes that make a box a scale rather than a picture.
 *
 * **Geometry rather than domain math, which is why this is not `mirror.js`.**
 * `systemWedgeLadder` draws a line too, and it returns the rates and leaves the
 * pixels to whoever knows how wide their box is. Nothing here knows anything
 * about property, wages or inflation; give it numbers and a box and it says
 * where the marks go.
 *
 * **And it is not a component, because a tick VALUE is a number a reader
 * reads.** `site/AGENTS.md` lets a component keep display-shape helpers that
 * cannot produce a wrong number on their own, and axis labels are exactly the
 * case that fails the test: the labels along an axis are digits on a screen,
 * and `niceTicks` decides them. The failure it guards against is written into
 * its own body — «12 500,000000001 €» on an axis whose whole purpose is round
 * numbers — and inside a component nothing could have gone red for it.
 *
 * ## Every function here takes its box
 *
 * Nothing in this file knows a width or a height. `/market/` draws one plot
 * taller than the other five, and a module holding a default would place that
 * chart's data in the top three quarters of its own frame with the zero rule
 * floating above the bottom — a chart that reads as though its axis had been
 * cropped, which is the one thing this page's plots may never look like.
 *
 * `tickAt` is the exception, and it is one for a reason rather than by
 * omission: it answers in a PERCENTAGE of the height, so the height cancels out
 * of the arithmetic. It is the one helper a caller cannot hand the wrong box,
 * because there is no box to hand it.
 *
 * `yearTicks` answers in a percentage too and takes the width anyway, which
 * looks redundant and is not. In floating point the width does NOT cancel
 * exactly: `600 * 2 / 8 / 600 * 100` and `100 * 2 / 8` differ in the last bit,
 * and the difference reaches the markup, because a year rule is placed from the
 * percentage while the column it marks is placed from `plotX` directly. Both go
 * through the same box here, so a rule and its column are drawn at the same
 * coordinate rather than a hairline apart.
 *
 * ## The honesty constraint on the y mapping
 *
 * **`plotY` takes a scale and never a pair of bounds.** `view/market.js#plotSeries`
 * clamps `min` at or below zero and offers no way to raise it, so every scale
 * reaching this module contains zero by construction and there is no floor for
 * a later edit to pass in. A y-axis cropped to a property series' own range
 * turns any of them into a cliff.
 *
 * ## What the box may contain
 *
 * **THE BOX IS THE PLOT AND NOTHING ELSE. No axis text may be drawn inside it,
 * and the reason is the phone.** An SVG sized `width: 100%` against a fixed
 * `viewBox` scales its whole coordinate system, TEXT INCLUDED: at a 360px
 * viewport a 600-unit box renders at 0.56 of the width it is declared in, so an
 * 11px axis label reaches the reader at 6.2px — measured in Chromium, on six
 * charts at once, on the page whose smallest type is the thing that makes every
 * figure above it checkable. Padding for the labels came out of the same box
 * too, so the plot itself was 83px tall on the device most readers arrive on.
 *
 * So labels are HTML in a grid beside the box, set in the page's own type scale
 * and therefore the same size at every width, and the SVG carries marks only.
 * `tickAt` is the whole join: a tick's height as a percentage of the plot, which
 * is exactly what a percentage means to a gutter cell a grid has stretched to
 * the same height.
 */

/**
 * A scale's own range, never zero.
 *
 * @param {{min: number, max: number}} scale
 * @returns {number}
 */
export const span = (scale) => scale.max - scale.min || 1;

/**
 * A value's y in a box `h` tall, measured from the top as SVG measures it.
 *
 * @param {number} value
 * @param {{min: number, max: number}} scale
 * @param {number} h  the box's height in its own units
 * @returns {number}
 */
export const plotY = (value, scale, h) => h * (1 - (value - scale.min) / span(scale));

/**
 * The x of point `i` of `n`, evenly across a box `w` wide — first point on the
 * left edge, last on the right. A single point is centred, because a line of
 * one has no direction to run in.
 *
 * @param {number} i
 * @param {number} n
 * @param {number} w
 * @returns {number}
 */
export const plotX = (i, n, w) => (n > 1 ? (w * i) / (n - 1) : w / 2);

/**
 * A column's left edge. Each occupies its own slot with a gap, so a long series
 * still reads as columns rather than as a filled block.
 *
 * @param {number} i
 * @param {number} n
 * @param {number} w
 * @returns {number}
 */
export const columnX = (i, n, w) => (w / n) * (i + 0.12);

/**
 * A column's width, floored so that a series long enough to make the slot
 * narrower than a hairline still draws something.
 *
 * @param {number} n
 * @param {number} w
 * @returns {number}
 */
export const columnW = (n, w) => Math.max(0.8, (w / n) * 0.76);

/**
 * The hit target over point `i` of `n`: its left edge, and its width.
 *
 * The ungapped pair to `columnX`/`columnW`. A `<title>` needs a box to hang on
 * — a line has no mark of its own — and the boxes have to TILE, because a
 * reader pointing between two of them must land on one of the two rather than
 * on whichever was drawn last. Fixed-width targets stop tiling as soon as a
 * series is long enough to space its points closer than that width: on a
 * 318-month series in a 600-unit box the points sit 1.9 apart, and a 4-wide
 * target then reports a neighbour's reading under this month's name.
 *
 * Centred on the point, so half a band hangs off each end of the plot. The SVG
 * clips it, and the alternative — squaring the two ends up — would give the
 * first and last points half the target of every other.
 *
 * @param {number} i
 * @param {number} n
 * @param {number} w
 * @returns {number}
 */
export const hitX = (i, n, w) => plotX(i, n, w) - hitW(n, w) / 2;

/**
 * The width of one hit band. See `hitX`.
 *
 * `n - 1`, not `n`: the divisor is the GAP between points, which is what
 * `plotX` spaces them by. Over `n` the bands come out a hair narrow and stop
 * meeting — a gap of `w / n(n-1)` between each pair, where a pointer lands on
 * the plot and nothing else.
 *
 * @param {number} n
 * @param {number} w
 * @returns {number}
 */
export const hitW = (n, w) => (n > 1 ? w / (n - 1) : w);

/**
 * Where a tick sits down the plot, as the percentage its HTML gutter takes.
 *
 * The box's height cancels — it is `plotY` over the same `h` — so this is the
 * one y helper that cannot be told a wrong box, and a caller could not produce
 * a wrong label with it if they tried.
 *
 * @param {number} value
 * @param {{min: number, max: number}} scale
 * @returns {number}  0 at the top of the plot, 100 at the bottom
 */
export const tickAt = (value, scale) => (1 - (value - scale.min) / span(scale)) * 100;

/**
 * An axis that ends on round numbers, and the values to label along it.
 *
 * **A plot whose axis is labelled only at its own extremes has no scale, it has
 * two captions.** Every chart on `/market/` drew its highest reading, its lowest
 * and zero — so «29 130» named one column and told a reader nothing about the
 * one beside it, and reading a value off the middle of a plot meant estimating
 * against a number that was not round and did not repeat.
 *
 * So the axis is rounded OUTWARD to the step and the step is one a reader adds
 * in their head: 1, 2, 2.5 or 5 times a power of ten. Rounding out costs a
 * little of the box — an axis to 80% over a series that reaches 65.7% draws the
 * columns slightly shorter — and it buys gridlines that mean something at every
 * height rather than only at three of them.
 *
 * **Zero is a tick by construction and stays one.** `plotSeries` guarantees the
 * range contains zero and every step here divides it, so the rule at the foot of
 * a positive chart and through the middle of a signed one is always labelled.
 * Nothing here can crop a scale either: the bounds only ever move outward.
 *
 * @param {number} min  the series' own floor, at or below zero
 * @param {number} max  the series' own ceiling
 * @param {number} [want]  roughly how many intervals to aim for
 * @returns {{min: number, max: number, values: number[]}}
 */
export const niceTicks = (min, max, want = 5) => {
  const range = max - min || 1;
  const raw = range / want;
  const exponent = Math.floor(Math.log10(raw));
  const magnitude = 10 ** exponent;
  const normalised = raw / magnitude;
  const multiple =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  const step = magnitude * multiple;
  /**
   * How many decimals a tick can legitimately carry, and the whole of the
   * arithmetic's precision.
   *
   * A tick is a whole number of steps, so its exact value needs exactly as many
   * decimals as the step does — no computation over it may produce more. The
   * step is a power of ten times 1, 2, 2.5, 5 or 10, so that count is the
   * exponent, plus one where the multiple is the only fractional one.
   *
   * **Neither `lo + i * step` nor `v += step` is exact, and the difference
   * between them is not the point.** Multiplying is better than accumulating —
   * the error stops growing with `i` — but binary floating point cannot hold
   * 0.1, 0.2 or 2.5 at all, so `0 + 3 * 0.2` is 0.6000000000000001 whichever
   * way it is reached. That is a tick LABEL on an axis whose entire purpose is
   * round numbers, and formatting downstream is not a defence: the page happens
   * to write these through `percentSigned(x, 0)` today, so a caller writing one
   * decimal would print it, and nothing would say so.
   *
   * So each value is rounded back onto the decimal grid its own step defines.
   * That is exact rather than approximate — the rounded value IS the tick's
   * mathematical value, to the last digit it can have.
   */
  const decimals = Math.min(100, Math.max(0, -exponent) + (multiple === 2.5 ? 1 : 0));
  const exact = (v) => Number(v.toFixed(decimals));
  const lo = exact(Math.floor(min / step) * step);
  const hi = exact(Math.ceil(max / step) * step);
  const values = [];
  for (let i = 0; lo + i * step <= hi + step / 1000; i += 1) {
    const v = exact(lo + i * step);
    values.push(Math.abs(v) < step / 1000 ? 0 : v);
  }
  return { min: lo, max: hi, values };
};

/**
 * The year a period names, or `null` where it names none.
 *
 * **Four digits, tested, and not `Number()` over the first four characters.**
 * `Number("")` is 0 rather than NaN, so a point whose period is the empty
 * string parses as the year 0 and puts «0» on the axis — a label a reader
 * cannot account for, on a chart that is otherwise correct. `Number(" 12")`
 * and `Number("2e3")` are the same class. A period is `2026`, `2026-Q1` or
 * `2026-01` in every payload here, so what the axis wants is exactly a
 * four-digit head and nothing that merely coerces like one.
 *
 * @param {string|number|null|undefined} period
 * @returns {number|null}
 */
const yearOf = (period) => {
  const head = String(period ?? "").slice(0, 4);
  return /^\d{4}$/.test(head) ? Number(head) : null;
};

/** Six labels is what a 360px plot holds without them touching. */
const YEAR_TICKS_MAX = 6;
/** Steps a reader counts in. Anything else asks them to work out the interval. */
const YEAR_STEPS = [1, 2, 5, 10, 25];

/**
 * The years to mark on a time axis, and where each one sits along it.
 *
 * **Two end labels are what a chart has instead of a time axis.** A plot
 * spanning decades under «Q1 2005» at one end and «Q1 2026» at the other leaves
 * a reader looking at the rise in the middle with no way to say when it
 * happened without counting columns. On two panels drawn together it is worse
 * than unhelpful: the whole reason they share a window is that a column can be
 * carried down onto the line below it, and nothing on either picture says where
 * to carry it to.
 *
 * A year is placed at ITS OWN FIRST POINT rather than at an even fraction of the
 * axis. Those are the same thing only while every year carries a full set of
 * periods, and a series missing one — or starting mid-year — would label the
 * wrong columns while the picture stayed correct.
 *
 * **The step is chosen from the number of years, not from the viewport.** Six
 * labels is what a phone holds, and twenty-one years of an index at one label
 * each is an unreadable smear at that width — so the same rule that keeps the
 * phone legible thins the desk's axis too, and both get the same picture rather
 * than one getting a second layout to maintain.
 *
 * **Counted back from the NEWEST year, never forward from the oldest.** The two
 * differ whenever the step does not divide the span, and what they differ about
 * is which end goes unlabelled — with a two-year step over ten years, forward
 * from the first leaves the last year off the axis. That is the end the page is
 * about: every figure on it is the newest reading, and an axis whose final label
 * is the year before the data stops asks a reader to count columns to find
 * today.
 *
 * `at` is a percentage of the axis, and the width is taken anyway: it is
 * divided back out through the same `plotX` the marks are placed with, so a
 * year rule lands on the column it labels rather than a last-bit away from it.
 *
 * @param {{points: Array<{period: string|number}>}} series
 * @param {number} w  the box the marks are drawn in
 * @returns {Array<{year: string, at: number}>}
 */
export const yearTicks = (series, w) => {
  const n = series.points.length;
  const years = series.points
    .map((p, i) => ({ year: yearOf(p.period), i }))
    // Two passes and not one. Merged, the dedupe compares each year against the
    // previous MAPPED point rather than the previous surviving one, so a period
    // that parsed to nothing sitting between two readings of the same year lets
    // the second through and the axis carries that year twice.
    .filter((y) => y.year !== null)
    .filter((y, k, kept) => k === 0 || y.year !== kept[k - 1].year);
  if (!years.length) return [];
  const step = YEAR_STEPS.find((s) => Math.ceil(years.length / s) <= YEAR_TICKS_MAX) ?? 50;
  const last = years[years.length - 1].year;
  return years
    .filter((y) => (last - y.year) % step === 0)
    .map((y) => ({ year: String(y.year), at: (plotX(y.i, n, w) / w) * 100 }));
};

/**
 * A value's y in a sparkline box, inset so a mark at either extreme is drawn
 * whole rather than clipped by the edge it sits on.
 *
 * @param {number} value
 * @param {{min: number, max: number}} scale
 * @param {number} h  the sparkline box's height
 * @returns {number}
 */
export const sparkY = (value, scale, h) =>
  2 + (h - 4) * (1 - (value - scale.min) / (scale.max - scale.min || 1));

/**
 * A series as an SVG path, `M` to the first point and `L` to each of the rest.
 *
 * Fixed to two decimals, and the second one is already invisible: a 600-unit box
 * draws at 0.6 device pixels per unit on a 360px viewport, so a hundredth of a
 * unit is six thousandths of a pixel. An unrounded coordinate serialises up to
 * seventeen digits per point instead, into markup the build prerenders twice.
 *
 * **`n` and `offset` are what let a shorter series share a longer one's axis.**
 * A second line whose record starts later has fewer points, and placed at its
 * own indices it is stretched across the whole box: every reading lands under a
 * year it does not describe, on a picture whose two lines are drawn together
 * precisely so a reader can read one against the other. Given the LONGER
 * series' length and its own start inside it, each point sits on the year it
 * belongs to. The defaults are the single-series case, unchanged.
 *
 * @param {{points: Array<{value: number}>, min: number, max: number}} series
 * @param {number} w
 * @param {number} h
 * @param {{n?: number, offset?: number}} [grid]  the axis this line is placed on
 * @returns {string}
 */
export const pathOf = (series, w, h, { n = series.points.length, offset = 0 } = {}) =>
  series.points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${plotX(offset + i, n, w).toFixed(2)} ` +
        `${plotY(p.value, series, h).toFixed(2)}`
    )
    .join(" ");
