<!--
  What a job costs, divided into the three things that cost pays for.

  **This is not `WedgeChart` with a different series, and it may not become
  one**: a share of the GROSS salary and a share of the TOTAL COST are the same
  euros over two denominators, so the two charts may both mark the €2300 ceiling
  and may not share an axis (docs/math.md §"The labour tax wedge, and the
  denominator that is the whole point"). Each names its own in its own key.

  **Stacked, because the wedge is a partition and not an opinion** — the three
  bands sum to 100% of the labour cost by construction in
  `mirror.js#bgLabourCost`, not by three coincidences meeting, which is what
  lets a reader see the wedge IS the top two bands. Drawn at one named end of
  the ТЗПБ range for the reason `bgLabourWedge` states, with the range itself in
  words beside the chart.

  Every number arrives decided: `view/employer.js` samples the curve and this
  only maps those numbers onto a plot box. Inline SVG, no chart library and no
  third-party request, so the CSP the privacy notice depends on is untouched.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";

  const {
    /** `points`, `capGross`, `peakWedgePct`, `workAccident` — from view/employer.js. */
    cost,
    /**
     * One `{index, gross, wedgeSharePct}` per contract, or none at all.
     *
     * The same arrangement `WedgeChart` uses and for the same reason: `/how/`
     * renders no input and passes nothing, while a page that has a reader marks
     * them. Unmarked, the calculator draws the system's partition beside a
     * sentence stating this reader's own rate — above the ceiling 34.7% on the
     * plot against 32.8% in the text, with nothing saying why.
     */
    markers = [],
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // SVG geometry. Pure presentation: `cost` has already decided every figure,
  // and the same box as `WedgeChart` so the two stack legibly on one page and
  // their €2300 rules line up.
  const W = 320,
    H = 132;
  const PAD_X = 7,
    PAD_T = 10,
    PAD_B = 22;
  const BASE = H - PAD_B;
  const maxGross = $derived(cost.points.at(-1)?.gross || 1);
  function x(gross) {
    return PAD_X + (gross / maxGross) * (W - 2 * PAD_X);
  }
  // The full 0–100% of labour cost, unlike the wedge chart's 0–25% window.
  // Cropping a partition would stop it being one.
  function y(pct) {
    return BASE - (Math.min(Math.max(pct, 0), 100) / 100) * (BASE - PAD_T);
  }

  /** A band between two running totals, closed into a fillable shape. */
  function band(lowerOf, upperOf) {
    const pts = cost.points;
    if (!pts.length) return "";
    const top = pts.map(
      (p, i) => `${i ? "L" : "M"}${x(p.gross).toFixed(1)},${y(upperOf(p)).toFixed(1)}`
    );
    const bottom = pts
      .slice()
      .reverse()
      .map((p) => `L${x(p.gross).toFixed(1)},${y(lowerOf(p)).toFixed(1)}`);
    return `${top.join(" ")} ${bottom.join(" ")} Z`;
  }

  // **THE WEDGE SITS ON THE BASELINE, AND THAT IS WHAT MAKES IT READABLE.**
  // Off the floor its top edge is at 65% for a quantity of 35%, so the one
  // number on the chart names a region the reader has to subtract to find.
  // Drawn from zero the top edge IS the value, and this chart falls to the
  // right like `WedgeChart` above it — both falling because contributions stop
  // at the ceiling while the pay does not.
  const employerBand = $derived(
    band(
      () => 0,
      (p) => p.employerSharePct
    )
  );
  const employeeBand = $derived(
    band(
      (p) => p.employerSharePct,
      (p) => p.employerSharePct + p.employeeSharePct
    )
  );
  const netBand = $derived(
    band(
      (p) => p.employerSharePct + p.employeeSharePct,
      () => 100
    )
  );
  // The wedge's own top edge: everything below it never reaches the person.
  const wedgeEdge = $derived(
    cost.points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${x(p.gross).toFixed(1)},${y(p.employerSharePct + p.employeeSharePct).toFixed(1)}`
      )
      .join(" ")
  );
</script>

<svg
  class="lc"
  viewBox="0 0 {W} {H}"
  role="img"
  aria-label={$lang === "bg"
    ? `Какъв дял от общия разход за труд не стига до работника, според брутната заплата: отдолу вноските на работодателя, над тях удръжките от заплатата, а най-отгоре това, което стига до работника; осигуровки се плащат до ${fmt0(cost.capGross)} евро на месец`
    : `What share of the total cost of employment never reaches the worker, by gross pay: the employer's contributions along the bottom, the deductions from their pay above them, and what reaches the worker on top; contributions are paid up to ${fmt0(cost.capGross)} euro a month`}
>
  <defs>
    <!-- The employer's band is the one a reader has never seen on a payslip,
         and it shares its hue with the employee's deductions because both are
         the same thing leaving. Told apart by FORM rather than by a second
         red, so the pair survives greyscale and colour-blindness — the rule
         `WedgeChart` states for its own two series. -->
    <pattern
      id="lc-hatch"
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="6" class="lc-hatch-line" />
    </pattern>
  </defs>

  <path class="lc-net" d={netBand} />
  <path class="lc-employee" d={employeeBand} />
  <path class="lc-employer" d={employerBand} />
  <path class="lc-employer-hatch" d={employerBand} />
  <path class="lc-edge" d={wedgeEdge} />

  <line class="lc-base" x1={x(0)} y1={BASE} x2={x(maxGross)} y2={BASE} />
  <!-- The ceiling is a threshold, not a gridline, so it is the one dashed rule
       — drawn the same way on both charts so a reader can align them. -->
  <line class="lc-cap" x1={x(cost.capGross)} y1={PAD_T} x2={x(cost.capGross)} y2={BASE} />

  <!-- P3: every label is read off `cost`, never written in. The wedge at the
       ceiling is the maximum of the curve and the figure the prose quotes. -->
  <text class="lc-lbl" x={PAD_X + 4} y={y(cost.peakWedgePct) + 12}>{fmt(cost.peakWedgePct)}%</text>
  <text class="lc-lbl" x={W - PAD_X} y={y(cost.endWedgePct) + 12} text-anchor="end"
    >{fmt(cost.endWedgePct)}%</text
  >
  <text class="lc-lbl" x={x(cost.capGross) + 5} y={BASE + 13}>€{fmt0(cost.capGross)}</text>
  <text class="lc-lbl" x={W - PAD_X} y={BASE + 13} text-anchor="end">€{fmt0(maxGross)}</text>
  <!-- One marker per contract, on the boundary between what arrives and what
       does not — the line this chart is drawn to show. -->
  {#each markers as m (m.index)}
    <circle class="lc-you" cx={x(Math.min(m.gross, maxGross))} cy={y(m.wedgeSharePct)} r="4" />
  {/each}
</svg>

<div class="lc-key">
  <span class="lk e"
    ><span class="l-bg">{COPY.lcKeyEmployer.bg}</span><span class="l-en"
      >{COPY.lcKeyEmployer.en}</span
    ></span
  >
  <span class="lk d"
    ><span class="l-bg">{COPY.lcKeyEmployee.bg}</span><span class="l-en"
      >{COPY.lcKeyEmployee.en}</span
    ></span
  >
  <span class="lk n"
    ><span class="l-bg">{COPY.lcKeyNet.bg}</span><span class="l-en">{COPY.lcKeyNet.en}</span></span
  >
  <span class="lk c"
    ><span class="l-bg">{COPY.wedgeAxisCap.bg}</span><span class="l-en">{COPY.wedgeAxisCap.en}</span
    ></span
  >
</div>
<!-- The denominator, under the picture rather than in it. Every percentage on
     this chart is a share of the labour cost, and the axis has to say so or
     the figure reads as a share of the salary — which is the OTHER chart's
     number, ten points lower and equally true. -->
<p class="lc-denom">
  <span class="l-bg"
    >{@html t(COPY.lcDenominator, "bg", { z: fmt(cost.workAccidentMinPct, 1) })}</span
  >
  <span class="l-en"
    >{@html t(COPY.lcDenominator, "en", { z: fmt(cost.workAccidentMinPct, 1) })}</span
  >
</p>

<style>
  .lc {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 10px;
    overflow: visible;
  }
  .lc path {
    stroke-linejoin: round;
  }
  /* Money that stays takes the palette's green, money that leaves takes its
     red — the same assignment every other figure on the site uses, so a reader
     arriving here already knows which way is which. */
  .lc-net {
    fill: var(--real-soft);
    stroke: none;
  }
  .lc-employee {
    fill: var(--erode-soft);
    stroke: none;
  }
  .lc-employer {
    fill: var(--erode-soft);
    stroke: none;
  }
  .lc-employer-hatch {
    fill: url(#lc-hatch);
    stroke: none;
  }
  .lc-hatch-line {
    stroke: var(--erode);
    stroke-width: 1;
    opacity: 0.45;
  }
  /* The wedge itself: the boundary between what arrives and what does not. */
  /* The wedge's cap, in the same colour and weight as the falling line on the
     chart above — one mark, one meaning, on both pictures. It binds the label
     inside the band to the band the label counts. */
  .lc-edge {
    fill: none;
    stroke: var(--erode);
    stroke-width: 2;
  }
  .lc-base {
    stroke: var(--line);
    stroke-width: 1;
  }
  .lc-cap {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  /* A pointer, not a fourth series, so it wears ink rather than a data colour
     — with a surface ring so it stays legible on the band edge it sits on. */
  .lc-you {
    fill: var(--ink);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .lc-lbl {
    font-size: var(--fs-micro);
    fill: var(--muted);
    font-family: var(--mono);
  }
  .lc-key {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 16px;
    margin-top: 7px;
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .lc-key .lk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* Each swatch is the mark it stands for, at the size it is drawn — a
     zero-height element carrying a border renders the dashed rule as blank
     space, and the key then names a series the reader cannot find. */
  .lc-key .lk::before {
    content: "";
    flex: none;
    border-radius: 1px;
  }
  /* No outline: the band it stands for has none — its only edge is the red
     wedge line below it, and a ringed swatch sends the eye hunting for an
     outlined green region the plot never draws. */
  .lc-key .n::before {
    width: 16px;
    height: 10px;
    background: var(--real-soft);
  }
  .lc-key .d::before {
    width: 16px;
    height: 10px;
    background: var(--erode-soft);
  }
  .lc-key .e::before {
    width: 16px;
    height: 10px;
    background: var(--erode-soft);
    /* The hatch, as a swatch: two strokes of the same 45° rule the band wears. */
    background-image: repeating-linear-gradient(45deg, var(--erode) 0 1px, transparent 1px 6px);
  }
  .lc-key .c::before {
    width: 0;
    height: 12px;
    border-left: 1px dashed var(--muted);
    border-radius: 0;
  }
  .lc-denom {
    margin: 6px 0 0;
    font-size: var(--fs-small);
    color: var(--muted);
  }
</style>
