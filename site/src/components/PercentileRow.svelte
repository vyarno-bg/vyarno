<script>
  /** Where the reader's pay sits on the published net-earnings ladder. */
  import { lang } from "../lib/stores.js";
  import { integer, period, httpUrl } from "../lib/format.js";
  import { COPY } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt0 = (x) => integer(x, $lang);
</script>

<!-- PERCENTILE -->
<div class="r-row">
  <div class="rr-top">
    <span class="rr-k"
      ><span class="l-bg">{COPY.pctK.bg}</span><span class="l-en">{COPY.pctK.en}</span></span
    >
    <!-- Position from the bottom: "ahead of X%". Higher income →
         bigger number. Honest for below-median incomes (no
         "top 63%" that reads as an achievement). -->
    <span class="rr-v mono"
      >{calc.pctAhead > 0
        ? `${$lang === "bg" ? "пред " : "ahead of "}${calc.pctAhead}%`
        : "—"}</span
    >
  </div>
  {#if calc.salary > 0 && calc.pctRank > 0}
    <div class="rr-t">
      <span class="l-bg"
        >{@html COPY.pctTopTxt.bg
          .replace("{r}", fmt0(calc.pctAhead))
          .replace("{m}", fmt0(calc.ladder[5] ?? 0))}</span
      >
      <span class="l-en"
        >{@html COPY.pctTopTxt.en
          .replace("{r}", fmt0(calc.pctAhead))
          .replace("{m}", fmt0(calc.ladder[5] ?? 0))}</span
      >
    </div>
    <!-- Caveat: salary (per earner or household) is compared to a
         household-disposable-income ladder. Different units
         if per earner (caveat fires), same units if the
         user typed the household net. Either way, treat as
         directional. -->
    <div class="rr-note">
      <span class="l-bg">{COPY.pctCaveat.bg}</span>
      <span class="l-en">{COPY.pctCaveat.en}</span>
    </div>
    <!-- Source citation (↗) — Eurostat SES shape + NSI level, the
         same every-figure-carries-a-link contract as the baskets. -->
    <div class="rr-note ss">
      <span class="l-bg"
        >{@html COPY.pctSrc.bg
          .replace("{shapeUrl}", httpUrl(calc.salaryShapeUrl))
          .replace("{shapeYear}", period(calc.salaryShapeYear))
          .replace("{anchorUrl}", httpUrl(calc.salaryAnchorUrl))
          .replace("{anchorPeriod}", period(calc.salaryAnchorPeriod))}</span
      >
      <span class="l-en"
        >{@html COPY.pctSrc.en
          .replace("{shapeUrl}", httpUrl(calc.salaryShapeUrl))
          .replace("{shapeYear}", period(calc.salaryShapeYear))
          .replace("{anchorUrl}", httpUrl(calc.salaryAnchorUrl))
          .replace("{anchorPeriod}", period(calc.salaryAnchorPeriod))}</span
      >
    </div>
    <div class="pctbar" aria-hidden="true">
      <span class="seg" style="left:10%"></span><span class="seg" style="left:20%"></span>
      <span class="seg" style="left:30%"></span><span class="seg" style="left:40%"></span>
      <span class="seg" style="left:50%"></span><span class="seg" style="left:60%"></span>
      <span class="seg" style="left:70%"></span><span class="seg" style="left:80%"></span>
      <span class="seg" style="left:90%"></span>
      <span class="me" style="left:{calc.pctAhead}%"></span>
    </div>
  {:else}
    <div class="rr-t">
      <span class="l-bg">Въведи заплата горе.</span>
      <span class="l-en">Enter your pay above.</span>
    </div>
  {/if}
</div>

<style>
  .pctbar {
    position: relative;
    height: 8px;
    background: var(--track);
    border-radius: 2px;
    margin-top: 9px;
  }
  .pctbar .seg {
    position: absolute;
    top: 0;
    height: 100%;
    width: 1px;
    background: var(--line);
  }
  .pctbar .me {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    border-radius: 100px;
    background: var(--real);
    border: 2.5px solid var(--surface);
    box-shadow: 0 0 0 1px var(--real);
    transition: left 0.25s;
  }
</style>
