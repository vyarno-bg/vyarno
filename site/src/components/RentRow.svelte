<script>
  /** Rent as a share of take-home, against the conventional 30% line. */
  import { lang } from "../lib/stores.js";
  import { number, integer } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
</script>

<!-- RENT -->
{#if calc.rent > 0}
  <div class="r-row">
    <div class="rr-top">
      <span class="rr-k"
        ><span class="l-bg">{COPY.rentK.bg}</span><span class="l-en">{COPY.rentK.en}</span></span
      >
      <span
        class="rr-v mono"
        style="color: {calc.rentBurdenPct > 30 ? 'var(--erode)' : 'var(--real-ink)'}"
        >{fmt(calc.rentBurdenPct, 0)}%</span
      >
    </div>
    <!-- The rent row's "you entered €X" line, mirroring the
         mortgage row. Wrapped in {@html} because the copy carries
         <b>...</b> markup. -->
    <div class="rr-t">
      <span class="l-bg"
        >{@html t(COPY.rentEntered, $lang, {
          r: fmt0(calc.rent),
          p: fmt(calc.rentBurdenPct, 0),
          s: fmt0(calc.salary),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.rentEntered, $lang, {
          r: fmt0(calc.rent),
          p: fmt(calc.rentBurdenPct, 0),
          s: fmt0(calc.salary),
        })}</span
      >
    </div>
    <!-- The burden line: {p}% / {dir} / {drama} are computed here
         so the COPY string owns the markup. A tag inlined in a
         template literal renders as literal text. -->
    <div class="rr-t">
      <span class="l-bg"
        >{@html t(COPY.rentBurdenTxt, $lang, {
          p: fmt(calc.rentBurdenPct, 0),
          dir:
            $lang === "bg"
              ? calc.rentBurdenPct > 30
                ? COPY.rentDirOver.bg
                : COPY.rentDirUnder.bg
              : calc.rentBurdenPct > 30
                ? COPY.rentDirOver.en
                : COPY.rentDirUnder.en,
          drama:
            calc.rentBurdenPct >= 100
              ? t(COPY.rentDramaAll, $lang)
              : calc.rentBurdenPct > 30
                ? t(COPY.rentDramaOver, $lang, { day: calc.rentDay })
                : t(COPY.rentDramaFine, $lang),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.rentBurdenTxt, $lang, {
          p: fmt(calc.rentBurdenPct, 0),
          dir: calc.rentBurdenPct > 30 ? COPY.rentDirOver.en : COPY.rentDirUnder.en,
          drama:
            calc.rentBurdenPct >= 100
              ? t(COPY.rentDramaAll, $lang)
              : calc.rentBurdenPct > 30
                ? t(COPY.rentDramaOver, $lang, { day: calc.rentDay })
                : t(COPY.rentDramaFine, $lang),
        })}</span
      >
    </div>
    <div class="strain" aria-hidden="true">
      <div
        class="fill"
        style="width:{Math.min(100, calc.rentBurdenPct)}%;background: {calc.rentBurdenPct > 30
          ? 'var(--erode)'
          : 'var(--real)'}"
      ></div>
      <div class="limit" style="left:30%">
        <i>
          <span class="l-bg">общоприета граница 30%</span>
          <span class="l-en">accepted line 30%</span>
        </i>
      </div>
    </div>
  </div>
{/if}

<style>
  .strain {
    position: relative;
    height: 8px;
    background: var(--track);
    border-radius: 2px;
    margin-top: 9px;
  }
  .strain .fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    border-radius: 2px;
    transition: width 0.25s;
  }
  .strain .limit {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2px;
    background: var(--ink);
  }
  /* The limit label sits BELOW the bar: hung above it (top:-14px) it collides
     with the rent-burden text on the line above. */
  .strain .limit i {
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-style: normal;
    font-size: var(--fs-micro);
    color: var(--muted);
    white-space: nowrap;
  }
</style>
