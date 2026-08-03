<script>
  /** Where the reader's pay sits on the published net-earnings ladder. */
  import { lang } from "../lib/stores.js";
  import { integer, period, httpUrl } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt0 = (x) => integer(x, $lang);

  // This row waits for the reader, where the rest of the card demonstrates
  // itself on the €900 placeholder.
  //
  // The difference is what the sentence claims. «≈ €46 повече всеки месец» is
  // arithmetic about prices that happens to be scaled by a salary, and the
  // note under the headline says whose. «Изпреварваш 34% от работещите в
  // София» is a ranking OF THE READER against their neighbours, addressed to
  // them in the second person, and there is no caveat that makes an unasked
  // one land well — a visitor who earns €2,400 and is told on arrival that
  // they out-earn a third of Sofia has been told something false about
  // themselves before typing a character. So the row does what PocketRow does
  // with an empty raise: it says what it needs and computes nothing.
  //
  // With several incomes there is one position per earner, because the ladder
  // ranks people: its rungs are individual full-time earnings, so reading a
  // household total off it would report two people on €900 each as out-earning
  // 78% of Sofia when what is true is that each of them out-earns 34%.
  const answered = $derived(calc.earnersDirty && calc.ranks.length > 0);
  // What the corner states when there is more than one. A RANGE, not a single
  // figure: the row has no way to choose which earner the corner is about, and
  // picking the first would make an arbitrary one speak for the household.
  // «пред 34-62%» is a true statement about where the people in this household
  // sit; any single number in that corner is not.
  const cornerText = $derived.by(() => {
    if (!answered) return "—";
    const lead = $lang === "bg" ? "пред " : "ahead of ";
    const { low, high } = calc.rankRange;
    return low === high ? `${lead}${low}%` : `${lead}${low}-${high}%`;
  });
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
    <!-- The corner figure is gated on the same condition as the sentence
         below it, not on `pctAhead` alone. A bare «пред 34%» in the corner
         over a prompt asking for a salary is the claim with its caveat
         removed, which is the arrangement this row exists to avoid. -->
    <span class="rr-v mono">{cornerText}</span>
  </div>
  {#if answered}
    {#if calc.hasHousehold}
      <!-- The corner states the range and this states what makes it one: the
           rungs are individual earnings, so the household has no single
           position on the ladder. It is the caveat the range cannot stand
           without, which is why it is here and not behind the disclosure —
           «пред 34-62%» with the reason folded away is the corner figure with
           its sentence removed, the arrangement this whole row exists to
           avoid. -->
      <div class="rr-t">
        <span class="l-bg">{COPY.pctHouseholdNote.bg}</span>
        <span class="l-en">{COPY.pctHouseholdNote.en}</span>
      </div>
      <!-- One line per income, then the median once. The second person is
           dropped here on purpose: «изпреварваш» addressed to a household is a
           claim about a person who does not exist.
           These are the parts of the range above, so they are what the reader
           opens when the range is not enough — a column of one line per earner
           between the corner figure and its caveat pushed the caveat off the
           screen on a phone with three incomes. -->
      <details class="rr-more">
        <summary class="disclose">
          <span class="dc-caret" aria-hidden="true">›</span>
          <span class="l-bg">{COPY.discloseByEarner.bg}</span>
          <span class="l-en">{COPY.discloseByEarner.en}</span>
        </summary>
        <div class="rr-more-body">
          {#each calc.ranks as r (r.index)}
            <div class="rr-t">
              <span class="l-bg"
                >{@html t(COPY.pctEarnerLine, "bg", {
                  n: fmt0(r.ordinal),
                  s: fmt0(r.net),
                  r: fmt0(r.ahead),
                })}</span
              >
              <span class="l-en"
                >{@html t(COPY.pctEarnerLine, "en", {
                  n: fmt0(r.ordinal),
                  s: fmt0(r.net),
                  r: fmt0(r.ahead),
                })}</span
              >
            </div>
          {/each}
          <div class="rr-t">
            <span class="l-bg"
              >{@html t(COPY.pctMedian, "bg", { m: fmt0(calc.ladder[5] ?? 0) })}</span
            >
            <span class="l-en"
              >{@html t(COPY.pctMedian, "en", { m: fmt0(calc.ladder[5] ?? 0) })}</span
            >
          </div>
        </div>
      </details>
    {:else}
      <div class="rr-t">
        <span class="l-bg"
          >{@html COPY.pctTopTxt.bg
            .replace("{r}", fmt0(calc.ranks[0].ahead))
            .replace("{m}", fmt0(calc.ladder[5] ?? 0))}</span
        >
        <span class="l-en"
          >{@html COPY.pctTopTxt.en
            .replace("{r}", fmt0(calc.ranks[0].ahead))
            .replace("{m}", fmt0(calc.ladder[5] ?? 0))}</span
        >
      </div>
    {/if}
    <!-- The standing caveat, and it is about the DATA rather than the units:
         both sides are one person's monthly net, so the comparison is
         like-for-like. What stays approximate is that the spread comes from a
         national survey re-levelled onto Sofia's average, which the copy says
         in as many words. -->
    <div class="rr-note">
      <span class="l-bg"
        >{t(COPY.pctCaveat, "bg", { shapeYear: period(calc.salaryShapeYear) })}</span
      >
      <span class="l-en"
        >{t(COPY.pctCaveat, "en", { shapeYear: period(calc.salaryShapeYear) })}</span
      >
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
    <!-- One marker per earner. Two people at the same rung draw two markers on
         the same spot, which is what the ladder actually says about them —
         nudging one aside would place somebody where they do not stand. -->
    <div class="pctbar" aria-hidden="true">
      <span class="seg" style="left:10%"></span><span class="seg" style="left:20%"></span>
      <span class="seg" style="left:30%"></span><span class="seg" style="left:40%"></span>
      <span class="seg" style="left:50%"></span><span class="seg" style="left:60%"></span>
      <span class="seg" style="left:70%"></span><span class="seg" style="left:80%"></span>
      <span class="seg" style="left:90%"></span>
      {#each calc.ranks as r (r.index)}
        <span class="me" style="left:{r.ahead}%"></span>
      {/each}
    </div>
  {:else}
    <div class="rr-t">
      <span class="l-bg">{COPY.pctNoSalary.bg}</span>
      <span class="l-en">{COPY.pctNoSalary.en}</span>
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
