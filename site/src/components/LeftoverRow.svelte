<script>
  /** The money the basket was never told about — see the note in the markup. */
  import { lang } from "../lib/stores.js";
  import { number, integer } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // The denominator of `leftoverPct` is `spendable` = take-home − housing,
  // and `housingCost` is the carve-out that produced it. When it's non-zero,
  // the row names the amount so the percentage is legible: «X% от … след
  // €Y за жилище». When it's zero, "what's left of your take-home" is the
  // honest phrasing. There are two variants of each sentence (one with
  // housing named, one without) and verify_copy.mjs pins both rules. The
  // ternary sits INSIDE `t(...)` so the template-safety scanner sees two
  // rooted `COPY.<key>.<lang>` leaves; dynamic-key access (`COPY[leadKey]`)
  // fails that static check.
  const hasHousing = $derived(calc.housingCost > 0);
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
        >{@html t(hasHousing ? COPY.leftLeadWithHousing : COPY.leftLeadNoHousing, "bg", {
          m: fmt0(calc.budget.leftover),
          p: fmt0(calc.budget.leftoverPct),
          h: fmt0(calc.housingCost),
        })}</span
      >
      <span class="l-en"
        >{@html t(hasHousing ? COPY.leftLeadWithHousing : COPY.leftLeadNoHousing, "en", {
          m: fmt0(calc.budget.leftover),
          p: fmt0(calc.budget.leftoverPct),
          h: fmt0(calc.housingCost),
        })}</span
      >
    </div>
    <!-- The year's worth and what prices do to it held as cash are a
         projection run forward off the amount above, and the reader has to
         want the question before the answer is worth reading. Its assumption
         travels INTO the fold with it and not out of it: P5 binds the caveat
         to the claim it qualifies, and both are behind the same summary, so
         neither can be met without the other. Folding the assumption while
         the projection stayed on screen is the arrangement that rule
         forbids — this is the opposite one. -->
    <details class="rr-more">
      <summary class="disclose">
        <span class="dc-caret" aria-hidden="true">›</span>
        <span class="l-bg">{COPY.discloseLeftYear.bg}</span>
        <span class="l-en">{COPY.discloseLeftYear.en}</span>
      </summary>
      <div class="rr-more-body">
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
    </details>
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
      <span class="l-bg"
        >{@html t(hasHousing ? COPY.leftOverWithHousing : COPY.leftOverNoHousing, "bg", {
          m: fmt0(calc.budget.over),
          h: fmt0(calc.housingCost),
        })}</span
      >
      <span class="l-en"
        >{@html t(hasHousing ? COPY.leftOverWithHousing : COPY.leftOverNoHousing, "en", {
          m: fmt0(calc.budget.over),
          h: fmt0(calc.housingCost),
        })}</span
      >
    </div>
  </div>
{/if}
