<script>
  /** What inflation since 2020 took off cash held since 2020. */
  import { lang } from "../lib/stores.js";
  import { integer } from "../lib/format.js";
  import { COPY } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt0 = (x) => integer(x, $lang);
</script>

<!-- SAVINGS -->
{#if calc.cash > 0}
  <div class="r-row">
    <div class="rr-top">
      <span class="rr-k"
        ><span class="l-bg">{COPY.cashK.bg}</span><span class="l-en">{COPY.cashK.en}</span></span
      >
      <span class="rr-v mono" style="color: var(--erode)">−€{fmt0(calc.cashEroded.eaten)}</span>
    </div>
    <div class="rr-t">
      <span class="l-bg"
        >{@html COPY.cashTxt.bg
          .replace("{c}", fmt0(calc.cash))
          .replace("{t}", fmt0(calc.cashEroded.valueToday))
          .replace("{e}", fmt0(calc.cashEroded.eaten))}</span
      >
      <span class="l-en"
        >{@html COPY.cashTxt.en
          .replace("{c}", fmt0(calc.cash))
          .replace("{t}", fmt0(calc.cashEroded.valueToday))
          .replace("{e}", fmt0(calc.cashEroded.eaten))}</span
      >
    </div>
  </div>
{/if}
