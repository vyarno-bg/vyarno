<!--
  What share of a Bulgarian gross salary is deducted, drawn across the income
  range, with each earner's own salary marked on it where there is one.

  The finding is the shape — the effective rate PEAKS at the social-insurance
  ceiling and falls above it — so this is inline SVG with no chart library and
  no third-party request, and the CSP the privacy notice depends on is
  untouched. Every number arrives decided: `mirror.js#bgTaxWedge` samples the
  curve and this only maps those numbers onto a plot box.

  **Two entries mount it and that is why it is here rather than in
  `components/`.** `/` draws this curve about the person at the keyboard and
  `/how/` draws the same law with nobody on it, and the split under `src/` is
  by AUDIENCE — a component more than one entry needs is not the calculator's
  (`site/AGENTS.md` §"`components/` is the calculator's"). Drawn twice it would
  be two pictures of one statute, correctable in one place and wrong in the
  other, which is the failure the masthead and the table treatment were each
  extracted after.

  **`markers` is the whole of the difference between the two callers, and it
  defaults to none.** A marker is a reader's own gross, so a page that renders
  no input passes nothing and has nothing to pass: `view/country.js#wedgeCurve`
  has no `pay` parameter, while `view/payroll.js#taxWedgePanel` returns
  `earners` beside the identical curve. A personal effective rate inverts to
  the salary above the ceiling (P2) and the SYSTEM's curve is the version
  `docs/principles.md`'s closed list leaves open by name — so which of the two
  a page gets is decided in the wiring layer, where a suite can see it, and
  never by what this component is handed.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";

  const {
    /** `points`, `capGross`, `peakEffectivePct`, `marginalAbovePct` — the
        curve as `mirror.js#bgTaxWedge` returns it. */
    wedge,
    /** One `{index, gross, effectivePct}` per contract, or none at all. */
    markers = [],
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // SVG geometry for the curve. Pure presentation: the numbers are already
  // decided by `wedge`, this only maps them onto the plot box.
  //
  // The two series are the SAME measure on two bases, and below the ceiling
  // they are the same number — so drawn as two lines the marginal one is
  // invisible for a third of the chart, hidden under the effective one, and
  // its key looked like an empty swatch. The marginal rate is therefore an
  // AREA (a wash under its step) and the effective rate a line on top of it:
  // where they coincide the line IS the top of the wash, and above the
  // ceiling a gap opens between them, which is the whole finding.
  const WEDGE_W = 320,
    WEDGE_H = 132;
  const WEDGE_PAD_X = 7,
    WEDGE_PAD_T = 16,
    WEDGE_PAD_B = 22;
  const WEDGE_BASE = WEDGE_H - WEDGE_PAD_B;
  const wedgeMaxGross = $derived(wedge.points.at(-1)?.gross || 1);
  function wedgeX(gross) {
    return WEDGE_PAD_X + (gross / wedgeMaxGross) * (WEDGE_W - 2 * WEDGE_PAD_X);
  }
  function wedgeY(pct) {
    // 0..25% maps to the plot height, so the 22.4 → 10 drop is legible.
    return WEDGE_BASE - (Math.min(pct, 25) / 25) * (WEDGE_BASE - WEDGE_PAD_T);
  }
  function wedgeTrace(key) {
    return wedge.points
      .map(
        (pt, i) => `${i ? "L" : "M"}${wedgeX(pt.gross).toFixed(1)},${wedgeY(pt[key]).toFixed(1)}`
      )
      .join(" ");
  }
  const wedgePath = $derived(wedgeTrace("effectivePct"));
  // The line's value where the frame cuts it. The curve is still falling
  // there, so without this number the eye finishes the curve on the nearest
  // one below it — the wash's 10% — and reads a landing the line never makes.
  const wedgeEndEffectivePct = $derived(wedge.points.at(-1)?.effectivePct ?? 0);
  // Suppressed when a marker is close enough to the right edge to sit under
  // it. The marker wins: it is this reader's own salary, and the sentence
  // above the chart already gives them the same figure in words. With no
  // markers at all there is nothing to collide with and the label always
  // shows, which is the state the country page is always in.
  const wedgeShowEndLabel = $derived(!markers.some((e) => e.gross >= 0.85 * wedgeMaxGross));
  // Closed back down to the baseline, so the marginal step reads as a filled
  // band rather than a line that spends a third of the plot underneath the
  // effective one.
  const wedgeMarginalArea = $derived(
    wedge.points.length
      ? `${wedgeTrace("marginalPct")} L${wedgeX(wedgeMaxGross).toFixed(1)},${WEDGE_BASE} L${wedgeX(0).toFixed(1)},${WEDGE_BASE} Z`
      : ""
  );
</script>

<!-- Inline SVG, no chart library and no third-party script: the
     CSP the privacy notice depends on stays intact. -->
<svg
  class="wedge"
  viewBox="0 0 {WEDGE_W} {WEDGE_H}"
  role="img"
  aria-label={$lang === "bg"
    ? `Колко се удържа от цялата заплата и колко от увеличение, според брутната заплата; осигуровки се плащат до ${fmt0(wedge.capGross)} евро на месец`
    : `How much is taken from the whole salary and how much from a raise, by gross pay; contributions are paid up to ${fmt0(wedge.capGross)} euro a month`}
>
  <!-- Marks first, chrome on top of nothing: the wash is the
       marginal rate, the line is the effective rate. -->
  <path class="wedge-marginal" d={wedgeMarginalArea} />
  <line
    class="wedge-base"
    x1={wedgeX(0)}
    y1={WEDGE_BASE}
    x2={wedgeX(wedgeMaxGross)}
    y2={WEDGE_BASE}
  />
  <!-- The ceiling is a threshold, not a gridline, so it is the
       one dashed rule on the plot. -->
  <line
    class="wedge-cap"
    x1={wedgeX(wedge.capGross)}
    y1={WEDGE_PAD_T - 6}
    x2={wedgeX(wedge.capGross)}
    y2={WEDGE_BASE}
  />
  <path class="wedge-effective" d={wedgePath} />
  <!-- P3: a chart axis is a number. Every level, the line's own value at
       the frame edge and the ceiling are labelled from `wedge`, never
       written in.

       WHERE a label sits is what says WHICH series it belongs to. The two
       series share one hue on purpose, so colour cannot do it: a label
       riding above the line belongs to the line, a label inside the wash
       belongs to the wash. **Keep the 10% label inside the wash.** Floated
       just above it instead, it lands a dozen units under the line's own
       right-hand end, close enough to read as the value the line falls to —
       and the line does not fall to it. The effective rate approaches 10%
       asymptotically and is still 14.8% at €6000 and 11.4% at €20,000, so
       that misreading turns the one counter-intuitive fact on the chart
       into a false one. -->
  <text class="wedge-lbl" x={WEDGE_PAD_X + 2} y={wedgeY(wedge.peakEffectivePct) - 6}
    >{fmt(wedge.peakEffectivePct)}%</text
  >
  {#if wedgeShowEndLabel}
    <text
      class="wedge-lbl"
      x={WEDGE_W - WEDGE_PAD_X}
      y={wedgeY(wedgeEndEffectivePct) - 6}
      text-anchor="end">{fmt(wedgeEndEffectivePct)}%</text
    >
  {/if}
  <text
    class="wedge-lbl"
    x={WEDGE_W - WEDGE_PAD_X}
    y={(wedgeY(wedge.marginalAbovePct) + WEDGE_BASE) / 2}
    dominant-baseline="middle"
    text-anchor="end">{fmt(wedge.marginalAbovePct)}%</text
  >
  <text class="wedge-lbl" x={wedgeX(wedge.capGross) + 5} y={WEDGE_BASE + 13}
    >€{fmt0(wedge.capGross)}</text
  >
  <!-- The frame's right edge, so the line's value there reads as "at this
       salary" rather than "in the end". -->
  <text class="wedge-lbl" x={WEDGE_W - WEDGE_PAD_X} y={WEDGE_BASE + 13} text-anchor="end"
    >€{fmt0(wedgeMaxGross)}</text
  >
  <!-- One marker per earner: each contract sits at its own point on this
       curve, and a marker at their combined pay would stand where nobody in
       the household does. -->
  {#each markers as e (e.index)}
    <circle
      class="wedge-you"
      cx={wedgeX(Math.min(e.gross, wedgeMaxGross))}
      cy={wedgeY(e.effectivePct)}
      r="4"
    />
  {/each}
</svg>
<div class="wedge-key">
  <span class="wk e"
    ><span class="l-bg">{COPY.wedgeAxisEff.bg}</span><span class="l-en">{COPY.wedgeAxisEff.en}</span
    ></span
  >
  <span class="wk m"
    ><span class="l-bg">{COPY.wedgeAxisMar.bg}</span><span class="l-en">{COPY.wedgeAxisMar.en}</span
    ></span
  >
  <span class="wk c"
    ><span class="l-bg">{COPY.wedgeAxisCap.bg}</span><span class="l-en">{COPY.wedgeAxisCap.en}</span
    ></span
  >
</div>

<style>
  /* The tax-wedge curve. Inline SVG, no chart library and no third-party
     script, so the CSP the privacy notice depends on is untouched. Colours
     come from the token set so both themes work. */
  .wedge {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 10px;
    overflow: visible;
  }
  /* One hue, two forms. Both series measure the same thing — what is
     deducted — so they take the palette's one colour for money leaving you
     (`--erode`, as everywhere else on the page) and are told apart by FORM,
     not by a second hue: a wash for the marginal rate, a line for the
     effective one. That also means the pair survives colour-blindness and
     greyscale, which two hues at this size would not. */
  .wedge path {
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .wedge-effective {
    fill: none;
    stroke: var(--erode);
    stroke-width: 2;
  }
  .wedge-marginal {
    fill: var(--erode-soft);
    stroke: none;
  }
  .wedge-base {
    stroke: var(--line);
    stroke-width: 1;
  }
  .wedge-cap {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  /* The "you are here" marker is a pointer, not a third series, so it wears
     ink rather than a data colour — with a surface ring so it stays legible
     where it sits on the line. */
  .wedge-you {
    fill: var(--ink);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .wedge-lbl {
    font-size: var(--fs-micro);
    fill: var(--muted);
    font-family: var(--mono);
  }
  .wedge-key {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 16px;
    margin-top: 7px;
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .wedge-key .wk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* Each swatch is the mark it stands for, at the size it is drawn: a 2px
     line, a filled wash block, a dashed vertical rule. A zero-height element
     carrying a border renders the dashed and hairline ones as blank space,
     and the legend then names a series the reader cannot find. */
  .wedge-key .wk::before {
    content: "";
    flex: none;
    border-radius: 1px;
  }
  .wedge-key .e::before {
    width: 16px;
    height: 2px;
    background: var(--erode);
  }
  .wedge-key .m::before {
    width: 16px;
    height: 10px;
    background: var(--erode-soft);
    box-shadow: inset 0 0 0 1px var(--erode-soft);
  }
  .wedge-key .c::before {
    width: 0;
    height: 12px;
    border-left: 1px dashed var(--muted);
    border-radius: 0;
  }
</style>
