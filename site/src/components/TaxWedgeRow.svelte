<!--
  The tax-wedge row: what share of a Bulgarian gross salary is deducted, drawn
  across the income range with the reader's own salary marked on it.

  The finding is the shape — the effective rate PEAKS at the social-insurance
  ceiling and falls above it — so the chart is inline SVG with no chart library
  and no third-party request. Every number is decided in
  $lib/view.js#taxWedgePanel and arrives as one `wedge` prop; this component
  only maps those numbers onto a plot box.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";

  const {
    /** The whole panel from view.js#taxWedgePanel: points, cap, peak, you. */
    wedge,
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
  // Suppressed when the reader's own marker is close enough to the right edge
  // to sit under it. The marker wins: it is this reader's own salary, and the
  // sentence above the chart already gives them the same figure in words.
  const wedgeShowEndLabel = $derived(!wedge.you || wedge.you.gross < 0.85 * wedgeMaxGross);
  // Closed back down to the baseline, so the marginal step reads as a filled
  // band rather than a line that spends a third of the plot underneath the
  // effective one.
  const wedgeMarginalArea = $derived(
    wedge.points.length
      ? `${wedgeTrace("marginalPct")} L${wedgeX(wedgeMaxGross).toFixed(1)},${WEDGE_BASE} L${wedgeX(0).toFixed(1)},${WEDGE_BASE} Z`
      : ""
  );
</script>

<!-- THE TAX WEDGE — the tax wedge.
     The claim is "computable from the official data and nobody has
     computed it for you", never "they hide it" (docs/principles.md P11). Both
     inputs are state-published and carried, dated, in payroll.json. -->
<div class="r-row">
  <div class="rr-top">
    <span class="rr-k"
      ><span class="l-bg">{COPY.wedgeK.bg}</span><span class="l-en">{COPY.wedgeK.en}</span></span
    >
    <span class="rr-v mono"
      >{fmt(wedge.you ? wedge.you.effectivePct : wedge.peakEffectivePct)}%</span
    >
  </div>
  <div class="rr-t">
    {#if wedge.you && wedge.you.overCap}
      <span class="l-bg"
        >{@html t(COPY.wedgeOver, "bg", {
          gross: fmt0(wedge.you.gross),
          cap: fmt0(wedge.capGross),
          peak: fmt(wedge.peakEffectivePct),
          eff: fmt(wedge.you.effectivePct),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.wedgeOver, "en", {
          gross: fmt0(wedge.you.gross),
          cap: fmt0(wedge.capGross),
          peak: fmt(wedge.peakEffectivePct),
          eff: fmt(wedge.you.effectivePct),
        })}</span
      >
    {:else if wedge.you}
      <span class="l-bg"
        >{@html t(COPY.wedgeUnder, "bg", {
          gross: fmt0(wedge.you.gross),
          eff: fmt(wedge.you.effectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.wedgeUnder, "en", {
          gross: fmt0(wedge.you.gross),
          eff: fmt(wedge.you.effectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
    {:else}
      <span class="l-bg"
        >{@html t(COPY.wedgeNone, "bg", {
          peak: fmt(wedge.peakEffectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.wedgeNone, "en", {
          peak: fmt(wedge.peakEffectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
    {/if}
  </div>

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
    {#if wedge.you}
      <circle
        class="wedge-you"
        cx={wedgeX(Math.min(wedge.you.gross, wedgeMaxGross))}
        cy={wedgeY(wedge.you.effectivePct)}
        r="4"
      />
    {/if}
  </svg>
  <div class="wedge-key">
    <span class="wk e"
      ><span class="l-bg">{COPY.wedgeAxisEff.bg}</span><span class="l-en"
        >{COPY.wedgeAxisEff.en}</span
      ></span
    >
    <span class="wk m"
      ><span class="l-bg">{COPY.wedgeAxisMar.bg}</span><span class="l-en"
        >{COPY.wedgeAxisMar.en}</span
      ></span
    >
    <span class="wk c"
      ><span class="l-bg">{COPY.wedgeAxisCap.bg}</span><span class="l-en"
        >{COPY.wedgeAxisCap.en}</span
      ></span
    >
  </div>

  <div class="rr-note">
    <span class="l-bg"
      >{@html t(COPY.wedgeWhy, "bg", {
        peak: fmt(wedge.peakEffectivePct),
        cap: fmt0(wedge.capGross),
      })}</span
    >
    <span class="l-en"
      >{@html t(COPY.wedgeWhy, "en", {
        peak: fmt(wedge.peakEffectivePct),
        cap: fmt0(wedge.capGross),
      })}</span
    >
  </div>
</div>

<style>
  /* The tax-wedge curve — the tax wedge. Inline SVG, no chart library
     and no third-party script, so the CSP the privacy notice depends on is
     untouched. Colours come from the token set so both themes work. */
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
     line, a filled wash block, a dashed vertical rule. The previous keys were
     zero-height elements carrying a border, so the dashed and hairline ones
     rendered as blank space and the legend named a series the reader could
     not find. */
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
