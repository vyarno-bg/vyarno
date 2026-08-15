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
  import { number, integer, label } from "$lib/format.js";
  import WedgeChart from "$lib/WedgeChart.svelte";
  import LabourCostChart from "$lib/LabourCostChart.svelte";

  const {
    /** The whole panel from view/payroll.js#taxWedgePanel: points, cap, peak, earners. */
    wedge,
    /** view/employer.js#employerCostPanel — the same contracts, costed. */
    cost,
    /** The chosen section's own name in both languages, or empty strings. */
    sectorNames = { bg: "", en: "" },
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /** The single earner, when there is exactly one — the row's original case. */
  const only = $derived(wedge.earners.length === 1 ? wedge.earners[0] : null);

  /** The one employer-side earner, on the same test as `only` above. */
  const costOnly = $derived(cost?.earners.length === 1 ? cost.earners[0] : null);
  /**
   * Which of the four employer sentences the disclosure states.
   *
   * Decided once, here, and the template never asks again: the branch that
   * would go wrong is the one printing the single-rate sentence for a sector
   * spanning four rates, which is the ordinary case rather than the edge one.
   */
  const costCase = $derived(
    !costOnly
      ? "household"
      : !cost.workAccident.known
        ? "noSector"
        : cost.ambiguous
          ? "range"
          : "one"
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

  <!-- The employer's side, folded away. **The default view of this row does not
       move**: a reader who never opens this sees the same 22.4%, the same
       payslip and the same curve they saw before it existed. Inside is the
       OTHER denominator, and every sentence in it names its base — docs/math.md
       §"The labour tax wedge, and the denominator that is the whole point". -->
  {#if cost && cost.earners.length}
    <!-- Every figure the sentences below draw on, formatted once. `{@const}`
         and not `$derived`, and each pair written `name: xTxt` rather than in
         shorthand, because two suites read this template as text:
         `verify_template_safety.mjs` has to see a formatter behind each value
         and `verify_copy.mjs` a literal `name:` per placeholder. -->
    {@const headTxt = fmt0(costOnly ? costOnly.labourCostLow : cost.householdLabourCost)}
    {@const netTxt = fmt0(costOnly ? costOnly.net : cost.householdNet)}
    {@const wedgeTxt = fmt(costOnly ? costOnly.wedgePctLow : cost.householdWedgePct)}
    {@const capTxt = fmt0(cost.capGross)}
    {@const costHighTxt = fmt0(costOnly?.labourCostHigh)}
    {@const wedgeLowTxt = fmt(costOnly?.wedgePctLow)}
    {@const wedgeHighTxt = fmt(costOnly?.wedgePctHigh)}
    {@const zLowTxt = fmt(cost.workAccidentMinPct)}
    {@const zHighTxt = fmt(cost.workAccidentMaxPct)}
    <details class="rr-more">
      <summary class="disclose">
        <span class="dc-caret" aria-hidden="true">›</span>
        <span class="l-bg">{COPY.discloseEmployerCost.bg}</span>
        <span class="l-en">{COPY.discloseEmployerCost.en}</span>
      </summary>
      <div class="rr-note rr-more-body">
        <!-- The number the employer opened this for, in the row's own value
             type. Everything under it explains this figure; nothing under it
             states it again. -->
        <div class="cost-head">
          <span class="cost-head-v mono">€{headTxt}</span>
          <span class="cost-head-k">
            <span class="l-bg">{COPY.employerCostHeadK.bg}</span>
            <span class="l-en">{COPY.employerCostHeadK.en}</span>
          </span>
        </div>
        {#if costCase === "one"}
          <span class="l-bg"
            >{@html t(COPY.employerCostOne, "bg", { net: netTxt, wedge: wedgeTxt })}</span
          >
          <span class="l-en"
            >{@html t(COPY.employerCostOne, "en", { net: netTxt, wedge: wedgeTxt })}</span
          >
        {:else if costOnly}
          <span class="l-bg"
            >{@html t(
              costCase === "range" ? COPY.employerCostRange : COPY.employerCostNoSector,
              "bg",
              {
                net: netTxt,
                wedgeLow: wedgeLowTxt,
                wedgeHigh: wedgeHighTxt,
                zLow: zLowTxt,
                zHigh: zHighTxt,
                costHigh: costHighTxt,
                sector: label(sectorNames.bg),
              }
            )}</span
          >
          <span class="l-en"
            >{@html t(
              costCase === "range" ? COPY.employerCostRange : COPY.employerCostNoSector,
              "en",
              {
                net: netTxt,
                wedgeLow: wedgeLowTxt,
                wedgeHigh: wedgeHighTxt,
                zLow: zLowTxt,
                zHigh: zHighTxt,
                costHigh: costHighTxt,
                sector: label(sectorNames.en),
              }
            )}</span
          >
        {:else}
          <span class="l-bg"
            >{@html t(COPY.employerCostHousehold, "bg", {
              net: netTxt,
              wedge: wedgeTxt,
              cap: capTxt,
            })}</span
          >
          <span class="l-en"
            >{@html t(COPY.employerCostHousehold, "en", {
              net: netTxt,
              wedge: wedgeTxt,
              cap: capTxt,
            })}</span
          >
          <ul class="cost-earners">
            {#each cost.earners as e (e.index)}
              <li>
                <span class="l-bg"
                  >{@html t(COPY.employerCostEarnerLine, "bg", {
                    n: fmt0(e.ordinal),
                    cost: fmt0(e.labourCostLow),
                    net: fmt0(e.net),
                    wedge: fmt(e.wedgePctLow),
                    cap: e.overCap ? COPY.wedgeEarnerOverCap.bg : "",
                  })}</span
                >
                <span class="l-en"
                  >{@html t(COPY.employerCostEarnerLine, "en", {
                    n: fmt0(e.ordinal),
                    cost: fmt0(e.labourCostLow),
                    net: fmt0(e.net),
                    wedge: fmt(e.wedgePctLow),
                    cap: e.overCap ? COPY.wedgeEarnerOverCap.en : "",
                  })}</span
                >
              </li>
            {/each}
          </ul>
        {/if}

        <!-- The partition, drawn. `$lib/LabourCostChart.svelte` and never
             `WedgeChart` with another series — the two may mark the same ceiling
             and may not share an axis, for the reason that component states. -->
        <LabourCostChart {cost} markers={cost.earners} />

        <p class="cost-assumes">
          <span class="l-bg">{COPY.employerCostAssumes.bg}</span>
          <span class="l-en">{COPY.employerCostAssumes.en}</span>
        </p>
      </div>
    </details>
  {/if}

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
  .wedge-earners,
  .cost-earners {
    margin: 7px 0 0;
    padding: 0 0 0 10px;
    border-left: 1px solid var(--line-2);
    list-style: none;
  }
  /* The two assumptions the payslip drawer already states, restated where the
     employer's figures are because they bind that block identically and a
     reader who opened only this one has not seen them. */
  .cost-assumes {
    margin: 8px 0 0;
    font-size: var(--fs-small);
    color: var(--muted);
  }
  /* The cost, set like the row's own headline rather than like body copy —
     baseline-aligned with its caption so the euro figure reads as the answer
     and the caption as its unit. */
  .cost-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-bottom: 6px;
  }
  /* One step below the row's own 22,4% and in the same face: this is the
     answer inside a disclosure, not a second headline competing with the
     card's. */
  .cost-head-v {
    font-size: var(--fs-strong);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .cost-head-k {
    font-size: var(--fs-small);
    color: var(--muted);
  }
</style>
