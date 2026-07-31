<script>
  /** The money the basket was never told about — see the note in the markup. */
  import { lang } from "../lib/stores.js";
  import { number, integer } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
</script>

<!-- NOT PLACED — the money the basket was never told about.
     A € basket that rescales a partial basket up to the full budget
     cannot represent unplaced money at all: it asserts, silently,
     that every euro of take-home belongs to one of thirteen
     divisions. This row is what keeps that assertion out of the
     calculator — it says what the unplaced money is (a size, a
     year's worth) and what prices do to it if it is held as cash.

     It stops there. "Save it" or "invest it" is advice, and
     docs/principles.md P6 and the closed list shut that door — the
     honest form is a comparison plus a number, the last sentence of
     COPY.leftCash. The one-year figure is a projection and carries
     its assumption on the line below (P5). It sits immediately
     above the savings row on purpose: the two answer the same
     question about money that is not being spent, one forward on
     an assumption, one backward on published indices. -->
{#if calc.budget.hasLeftover}
  <div class="r-row">
    <div class="rr-top">
      <span class="rr-k"
        ><span class="l-bg">{COPY.leftK.bg}</span><span class="l-en">{COPY.leftK.en}</span></span
      >
      <span class="rr-v mono"
        >€{fmt0(calc.budget.leftover)}<small
          >/<span class="l-bg">мес</span><span class="l-en">mo</span></small
        ></span
      >
    </div>
    <div class="rr-t">
      <span class="l-bg"
        >{@html t(COPY.leftLead, "bg", {
          m: fmt0(calc.budget.leftover),
          p: fmt0(calc.budget.leftoverPct),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.leftLead, "en", {
          m: fmt0(calc.budget.leftover),
          p: fmt0(calc.budget.leftoverPct),
        })}</span
      >
    </div>
    <div class="rr-t">
      <span class="l-bg"
        >{@html t(COPY.leftYear, "bg", { y: fmt0(calc.budget.leftoverPerYear) })}
        {@html t(COPY.leftCash, "bg", {
          i: fmt(calc.leftoverCash.ratePct),
          e: fmt0(calc.leftoverCash.eaten),
          v: fmt0(calc.leftoverCash.valueToday),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.leftYear, "en", { y: fmt0(calc.budget.leftoverPerYear) })}
        {@html t(COPY.leftCash, "en", {
          i: fmt(calc.leftoverCash.ratePct),
          e: fmt0(calc.leftoverCash.eaten),
          v: fmt0(calc.leftoverCash.valueToday),
        })}</span
      >
    </div>
    <div class="rr-note">
      <span class="l-bg">{COPY.leftAssume.bg}</span>
      <span class="l-en">{COPY.leftAssume.en}</span>
    </div>
  </div>
{:else if calc.budget.over > 0}
  <div class="r-row">
    <div class="rr-top">
      <span class="rr-k"
        ><span class="l-bg">{COPY.leftK.bg}</span><span class="l-en">{COPY.leftK.en}</span></span
      >
      <span class="rr-v mono" style="color: var(--erode)"
        >+€{fmt0(calc.budget.over)}<small
          >/<span class="l-bg">мес</span><span class="l-en">mo</span></small
        ></span
      >
    </div>
    <div class="rr-t">
      <span class="l-bg">{@html t(COPY.leftOver, "bg", { m: fmt0(calc.budget.over) })}</span>
      <span class="l-en">{@html t(COPY.leftOver, "en", { m: fmt0(calc.budget.over) })}</span>
    </div>
  </div>
{/if}
