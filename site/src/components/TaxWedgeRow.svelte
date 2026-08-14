<!--
  The tax-wedge row: what share of a Bulgarian gross salary is deducted, drawn
  across the income range with each earner's own salary marked on it.

  The finding is the shape — the effective rate PEAKS at the social-insurance
  ceiling and falls above it — and `$lib/WedgeChart.svelte` draws it, because
  `/how/` draws the same statute with nobody standing on it. What is left here
  is the sentence over the picture, which is this row's own: it names the
  reader's rate, or the household's, or neither, and none of those exists on a
  page with no input. Every number is decided in
  $lib/view/payroll.js#taxWedgePanel and arrives as one `wedge` prop.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";
  import WedgeChart from "$lib/WedgeChart.svelte";

  const {
    /** The whole panel from view/payroll.js#taxWedgePanel: points, cap, peak, earners. */
    wedge,
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /** The single earner, when there is exactly one — the row's original case. */
  const only = $derived(wedge.earners.length === 1 ? wedge.earners[0] : null);
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
    <span class="rr-v mono">{fmt(wedge.headlineEffectivePct ?? wedge.peakEffectivePct)}%</span>
  </div>
  <div class="rr-t">
    {#if wedge.earners.length > 1}
      <!-- The household's own rate, then where each income stands. The ceiling
           is per contract, so a single sentence over several earners would
           bury the one thing this row is drawn to show. -->
      <span class="l-bg"
        >{@html t(COPY.wedgeHouseholdLead, "bg", {
          gross: fmt0(wedge.householdGross),
          eff: fmt(wedge.headlineEffectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.wedgeHouseholdLead, "en", {
          gross: fmt0(wedge.householdGross),
          eff: fmt(wedge.headlineEffectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
      <!-- The lead already says the ceiling is per contract, which is the
           finding. Where each income sits against it is the working behind
           that sentence, and on a phone six of these lines stand between the
           household's own rate and the chart that shows what they mean. -->
      <details class="rr-more">
        <summary class="disclose">
          <span class="dc-caret" aria-hidden="true">›</span>
          <span class="l-bg">{COPY.discloseByEarner.bg}</span>
          <span class="l-en">{COPY.discloseByEarner.en}</span>
        </summary>
        <ul class="wedge-earners">
          {#each wedge.earners as e (e.index)}
            <li>
              <span class="l-bg"
                >{@html t(COPY.wedgeEarnerLine, "bg", {
                  n: fmt0(e.ordinal),
                  gross: fmt0(e.gross),
                  eff: fmt(e.effectivePct),
                  cap: e.overCap ? COPY.wedgeEarnerOverCap.bg : "",
                })}</span
              >
              <span class="l-en"
                >{@html t(COPY.wedgeEarnerLine, "en", {
                  n: fmt0(e.ordinal),
                  gross: fmt0(e.gross),
                  eff: fmt(e.effectivePct),
                  cap: e.overCap ? COPY.wedgeEarnerOverCap.en : "",
                })}</span
              >
            </li>
          {/each}
        </ul>
      </details>
    {:else if only && only.overCap}
      <span class="l-bg"
        >{@html t(COPY.wedgeOver, "bg", {
          gross: fmt0(only.gross),
          cap: fmt0(wedge.capGross),
          peak: fmt(wedge.peakEffectivePct),
          eff: fmt(only.effectivePct),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.wedgeOver, "en", {
          gross: fmt0(only.gross),
          cap: fmt0(wedge.capGross),
          peak: fmt(wedge.peakEffectivePct),
          eff: fmt(only.effectivePct),
        })}</span
      >
    {:else if only}
      <span class="l-bg"
        >{@html t(COPY.wedgeUnder, "bg", {
          gross: fmt0(only.gross),
          eff: fmt(only.effectivePct),
          cap: fmt0(wedge.capGross),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.wedgeUnder, "en", {
          gross: fmt0(only.gross),
          eff: fmt(only.effectivePct),
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

  <!-- The curve, and the reader's own contracts on it. `$lib/WedgeChart.svelte`
       because `/how/` draws the same law with nobody standing on it, and the
       marker list is the whole of the difference between the two. -->
  <WedgeChart {wedge} markers={wedge.earners} />

  <!-- Why the curve does what the chart shows. It explains the picture rather
       than qualifying it: the sentences above state the reader's own rate and
       the chart draws the shape, and neither becomes less true unopened. The
       key under the chart still names both series, so a reader who does not
       tap is not left with an unlabelled plot. -->
  <details class="rr-more">
    <summary class="disclose">
      <span class="dc-caret" aria-hidden="true">›</span>
      <span class="l-bg">{COPY.discloseWedgeWhy.bg}</span>
      <span class="l-en">{COPY.discloseWedgeWhy.en}</span>
    </summary>
    <div class="rr-note rr-more-body">
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
  </details>
</div>

<style>
  /* One line per income behind the household sentence's disclosure. Unbulleted
     and indented: these are the parts of that total, not a list of separate
     findings. The indent comes from `.rr-more-body`'s rule in disclosure.css,
     which every folded block on the card shares — a second one here would give
     this row a deeper step than its neighbours for no reason a reader could
     name. */
  .wedge-earners {
    margin: 7px 0 0;
    padding: 0 0 0 10px;
    border-left: 1px solid var(--line-2);
    list-style: none;
  }
</style>
