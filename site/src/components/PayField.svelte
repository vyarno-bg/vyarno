<script>
  /**
   * The net-pay field, and the one input the rest of the page is priced off.
   *
   * It is its own component, and its own grid child, because of WHERE it has
   * to be rather than what it is. Below 820px `card.css` orders the results
   * card ahead of the inputs card — the payoff should not sit under thirteen
   * basket sliders — and that put this field 2,969px down a 6,670px page, five
   * screens past the figures computed from it. A reader who wants to answer
   * the page's one question had to scroll past every answer to find where to
   * put it.
   *
   * Lifting it out gives phones the order a calculator actually wants: ask,
   * answer, refine. The card it used to live in keeps everything the reader
   * can leave alone.
   *
   * On a desktop the two cards sit in the same grid column with the seam
   * between them closed (`.m-pay` / `.m-inputs` in card.css), so the split is
   * invisible there and nothing about the wide layout moves.
   *
   * Everything below the input is gated on `earnersDirty`. The gross, the
   * deductions and the Sofia comparison are facts about whoever earns the €900
   * placeholder until the reader replaces it — the same reasoning that keeps
   * PercentileRow silent, and here it also keeps the first paint short enough
   * that the headline figure stays above the fold on a 664px phone.
   *
   * ## More than one income
   *
   * The card holds a LIST of incomes and starts with one, so a single earner
   * meets the page exactly as they always have: one field, one label, one
   * payslip, and no control describing a situation they are not in. The second
   * income appears only when asked for.
   *
   * It is a list and not a checkbox-plus-second-field because a checkbox is a
   * second source of truth for something the list already knows. "Household
   * mode on, one income" is a state that means nothing and would have to be
   * handled everywhere; `earners.length` cannot disagree with itself.
   *
   * Each income is entered on its own because the insurance ceiling is per
   * contract — see `mirror.js#bgHouseholdPayroll` for what summing first costs.
   * Everything below the fields therefore comes in two shapes: per earner where
   * the figure describes a person (the gross, the payslip, the comparison with
   * the Sofia average) and once for the household where it describes money (the
   * total take-home).
   */
  import { lang } from "../lib/stores.js";
  import {
    number,
    integer,
    label,
    period,
    httpUrl,
    safeText,
    decimalText,
    parseDecimal,
  } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";
  import PayslipTable from "./PayslipTable.svelte";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /**
   * Put the reader's own notation back in the box whenever the AMOUNT moved
   * without them typing — a restore off this device, and the net/gross flip,
   * which converts every figure in place.
   *
   * Gated on the box no longer parsing to its own amount, which is what keeps
   * it off the keystroke path: while somebody is typing, the amount IS the
   * parse of what is in the box, so «1200,» is left alone rather than rewritten
   * to «1200» under the cursor. `decimalText` is here rather than in the
   * calculator because it picks a SEPARATOR, and a separator is a language.
   */
  $effect(() => {
    for (const earner of calc.earners) {
      if (parseDecimal(earner.amountText) !== earner.amount) {
        earner.amountText = decimalText(earner.amount, $lang);
      }
    }
  });

  // The direction word carries the sign, so the magnitude is unsigned. Emitting
  // both produced «-39% под средната» / "-39% below the average" — a double
  // negative that reads, literally, as 39% less far below.
  const DIR_KEY = { above: "statRegionAbove", below: "statRegionBelow", equal: "statRegionEqual" };
  /**
   * **Neither comparison on this card is painted, and the rent-burden pattern
   * is why they both look like they should be.**
   *
   * `--real` and `--erode` there mean the reader's figure beat or lost to the
   * country's, and a rent burden HAS a good end: 45% of net is worse than 25%.
   * A distance from a mean does not have one. `--erode` is the site's «this is
   * costing you» red — it paints «инфлацията изяде €285» and «над границата от
   * 30%» — and it was painting «твоята нетна заплата е 18% под средната за
   * „…"» two lines above the card's own «Средната не е средата», which is the
   * sentence the colour asserted the opposite of. Colour is read first.
   *
   * The Sofia line is the same quantity against a different mean. Sofia's mean
   * sits above Sofia's median for the same right skew that puts the country's
   * above its own (`mirror.js#meanRungPosition`), so «41% над средната» in
   * green tells a reader they are ahead by a measure that is not the middle.
   *
   * P6: we describe, we do not advise, and the strongest honest form is a
   * comparison plus a number. Both gaps therefore get the neutral the equal
   * case already had. The direction word in the sentence carries the sign,
   * which is all the reader needs — and is the only version a reader who
   * cannot separate the two colours ever had.
   */

  // The whole «28% над» / "28% above" clause, built here and spliced into the
  // COPY string as ONE placeholder — which is what keeps the Bulgarian
  // grammatical. Assembling it out of separate {sign}{n}{word} holes in the
  // template is what produced «-39% под средната»: a magnitude carrying a sign
  // beside a word that already carries one, which reads as 39% less far below.
  // The magnitude arrives unsigned from view/payroll.js#regionGap and is formatted here,
  // so nothing reaches the markup that a formatter has not been through.
  // The field's own name and hint follow the toggle. A box holding a gross
  // under «Нетна заплата» is a right number with a wrong name on it, and the
  // reader has no way to tell which of the two the page went on to use.
  const payLabel = $derived(calc.payBasis === "gross" ? COPY.grossPay : COPY.netPay);
  const payHint = $derived(calc.payBasis === "gross" ? COPY.grossPayHint : COPY.netPayHint);

  // Which sentence the summary line tells, and with which figures. In net mode
  // the reader typed the take-home and the answer is the contract; in gross
  // mode it runs the other way. Decided here rather than in four nested
  // ternaries in the markup, where the wrong pairing of key and arguments
  // renders a gross figure under a sentence naming it a net.
  const summaryKey = $derived(
    calc.payBasis === "gross"
      ? calc.hasHousehold
        ? COPY.payNetFromGrossHousehold
        : COPY.payNetFromGross
      : calc.hasHousehold
        ? COPY.payGrossHousehold
        : COPY.payGross
  );
  const summaryArgs = $derived({
    g: fmt0(calc.payslip?.gross ?? 0),
    n: fmt0(calc.payslip?.net ?? 0),
    i: fmt0(calc.payslip?.insurance ?? 0),
    t: fmt0(calc.payslip?.tax ?? 0),
    r: fmt(calc.payslip?.effectiveRatePct ?? 0),
  });

  function deltaPhrase(gap, l) {
    const word = COPY[DIR_KEY[gap.direction]][l] ?? COPY[DIR_KEY[gap.direction]].bg;
    return gap.direction === "equal" ? word : `${fmt0(gap.magnitudePct)}% ${word}`;
  }
</script>

<div class="m-card m-pay">
  <h4>
    <span class="l-bg">{COPY.yourNumbers.bg}</span>
    <span class="l-en">{COPY.yourNumbers.en}</span>
  </h4>

  <!-- Which figure the fields carry. The segmented control is the pattern the
       basket's %/€ toggle already uses, and it keeps the same contract: the
       amounts convert in place, so the number in the box changes and nothing
       below it does. -->
  <div class="seg basis" role="group" aria-label={t(COPY.basisGroup, $lang)}>
    <button
      class="segbtn"
      aria-pressed={calc.payBasis === "net"}
      onclick={() => calc.setPayBasis("net")}
    >
      <span class="l-bg">{COPY.basisNet.bg}</span><span class="l-en">{COPY.basisNet.en}</span>
    </button>
    <button
      class="segbtn"
      aria-pressed={calc.payBasis === "gross"}
      onclick={() => calc.setPayBasis("gross")}
    >
      <span class="l-bg">{COPY.basisGross.bg}</span><span class="l-en">{COPY.basisGross.en}</span>
    </button>
  </div>

  <div class="field">
    <!-- The first field keeps the id `inSalary`: ResultsSummary's «въведи
         своята заплата» button focuses it by id across the component boundary,
         and on a phone that tap is the whole route from the answer back to the
         question. Renaming it would break the route silently — the button
         would scroll nowhere and raise no keyboard. -->
    <label for="inSalary">
      <span class="l-bg"
        >{calc.hasHousehold ? t(COPY.earnerLabel, "bg", { n: 1 }) : payLabel.bg}</span
      >
      <span class="l-en"
        >{calc.hasHousehold ? t(COPY.earnerLabel, "en", { n: 1 }) : payLabel.en}</span
      >
      <span class="hint">
        <span class="l-bg">{payHint.bg}</span>
        <span class="l-en">{payHint.en}</span>
      </span>
    </label>
    <span class="unit" data-u="€">
      <input
        id="inSalary"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        value={calc.earners[0].amountText}
        oninput={(e) => calc.onEarnerInput(0, e)}
        aria-label={calc.hasHousehold ? t(COPY.earnerLabel, $lang, { n: 1 }) : t(payLabel, $lang)}
      />
    </span>
    <!-- The hint describes the €900 in the box, so it goes when the €900 does.
         Left ungated it told a reader who had just typed their own pay that
         «числото е просто начална стойност — смени го със своята заплата», which
         is a false statement about the one figure on the page that is theirs.
         Its twin over the headline figure — `startingSalary`, which names the
         amount — has taken this gate since it was written; only the hint
         attached to the field was missing it. -->
    {#if !calc.earnersDirty}
      <div class="hint" style="margin-top:4px">
        <span class="l-bg">{COPY.medianDefault.bg}</span>
        <span class="l-en">{COPY.medianDefault.en}</span>
      </div>
    {/if}
    <div class="hint" style="margin-top:2px">
      <span class="l-bg">{COPY.basisHint.bg}</span>
      <span class="l-en">{COPY.basisHint.en}</span>
    </div>

    <!-- The further incomes. Keyed by index rather than by value: two people
         earning the same amount are two rows, and a keyed-by-value each block
         would collapse them into one. -->
    {#each calc.earners.slice(1) as _, k (k)}
      {@const i = k + 1}
      <div class="earner">
        <label for="inEarner{i}">
          <span class="l-bg">{t(COPY.earnerLabel, "bg", { n: i + 1 })}</span>
          <span class="l-en">{t(COPY.earnerLabel, "en", { n: i + 1 })}</span>
        </label>
        <div class="earner-in">
          <span class="unit" data-u="€">
            <input
              id="inEarner{i}"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              value={calc.earners[i].amountText}
              oninput={(e) => calc.onEarnerInput(i, e)}
              aria-label={t(COPY.earnerLabel, $lang, { n: i + 1 })}
            />
          </span>
          <button
            type="button"
            class="earner-rm"
            onclick={() => calc.removeEarner(i)}
            aria-label={t(COPY.earnerRemove, $lang, { n: i + 1 })}
            title={t(COPY.earnerRemove, $lang, { n: i + 1 })}>×</button
          >
        </div>
      </div>
    {/each}

    <!-- The control disappears at the limit rather than the next income being
         accepted and dropped. See Calculator#MAX_EARNERS. -->
    {#if calc.canAddEarner}
      <button type="button" class="earner-add" onclick={calc.addEarner}>
        <span class="l-bg">{COPY.earnerAdd.bg}</span>
        <span class="l-en">{COPY.earnerAdd.en}</span>
      </button>
    {/if}
    {#if !calc.hasHousehold}
      <div class="hint" style="margin-top:2px">
        <span class="l-bg">{COPY.earnerAddHint.bg}</span>
        <span class="l-en">{COPY.earnerAddHint.en}</span>
      </div>
    {/if}
    {#if calc.hasHousehold && calc.householdNet > 0}
      <div class="hint total" style="margin-top:6px">
        <span class="l-bg"
          >{@html t(COPY.householdTotal, "bg", { s: fmt0(calc.householdNet) })}</span
        >
        <span class="l-en"
          >{@html t(COPY.householdTotal, "en", { s: fmt0(calc.householdNet) })}</span
        >
      </div>
    {/if}

    <!-- Back-computed gross + tax breakdown from the typed net salary. Shows
       what the contract GROSS is and the effective rate.
       «ефективно 22,4%» was the internal name of the rate rendered
       straight at a reader: a share with no stated denominator, in a
       word nobody uses about their own payslip. It now says what the
       percentage is a share OF.
       The one-line summary is the answer; the <details> below it is
       the working. A single gross figure is not checkable — a reader
       comparing it against another calculator has no way to see WHICH
       step differs, and the step that differs is nearly always the
       insurance ceiling. Closed by default: the summary is enough for
       the reader who believes us, and the table is one click for the
       reader who does not.
       With several incomes there is one payslip per person, because a
       payslip is a document one person receives. The household line
       above them adds the columns up. -->
    {#if calc.earnersDirty && calc.payslip}
      <div class="answer">
        <!-- Both readings side by side, always. The toggle changes which one the
             reader edits, and showing only the other half leaves them working out
             which basis the page is in from the wording of a sentence. -->
        <div class="pair mono">
          <span class="l-bg"
            >{t(COPY.payBothNet, "bg", {
              n: fmt0(calc.payslip.net),
              g: fmt0(calc.payslip.gross),
            })}</span
          >
          <span class="l-en"
            >{t(COPY.payBothNet, "en", {
              n: fmt0(calc.payslip.net),
              g: fmt0(calc.payslip.gross),
            })}</span
          >
        </div>
        <div class="hint deduct">
          <span class="l-bg">{t(summaryKey, "bg", summaryArgs)}</span>
          <span class="l-en">{t(summaryKey, "en", summaryArgs)}</span>
        </div>
      </div>
      {#if calc.payslip.earners.length > 1}
        <div class="hint" style="margin-top:4px">
          <span class="l-bg">{COPY.householdSeparate.bg}</span>
          <span class="l-en">{COPY.householdSeparate.en}</span>
        </div>
      {/if}
      {#each calc.payslip.earners as earner (earner.index)}
        {#if calc.payslip.earners.length > 1}
          <div class="earner-head mono">
            <span class="l-bg"
              >{t(COPY.earnerPayslipHead, "bg", {
                n: fmt0(earner.ordinal),
                s: fmt0(earner.net),
              })}</span
            >
            <span class="l-en"
              >{t(COPY.earnerPayslipHead, "en", {
                n: fmt0(earner.ordinal),
                s: fmt0(earner.net),
              })}</span
            >
          </div>
        {/if}
        <PayslipTable payslip={earner} />
      {/each}
    {/if}

    <!-- The personal Sofia comparison sits under the reader's typed
       salary, next to the input it compares against — the Sofia card
       in the national strip is a country reference and carries no
       personal verdict.
       Unpainted, for the reason the block above `DIR_KEY` gives.
       One line per income: НСИ publish a WAGE, so comparing a
       two-earner total against it would report a household of two on
       €900 each as 21% above the average worker. The magnitude, the
       direction word and the dead zone are decided in
       view/payroll.js#regionGap; this picks the words. -->
    {#if calc.earnersDirty}
      {#each calc.regionGaps as gap (gap.index)}
        <div class="gap">
          <span class="l-bg"
            >{@html t(calc.hasHousehold ? COPY.statRegionDiffEarner : COPY.statRegionDiff, "bg", {
              n: fmt0(gap.ordinal),
              delta: deltaPhrase(gap, "bg"),
              region: safeText(calc.regionNameBg),
            })}</span
          >
          <span class="l-en"
            >{@html t(calc.hasHousehold ? COPY.statRegionDiffEarner : COPY.statRegionDiff, "en", {
              n: fmt0(gap.ordinal),
              delta: deltaPhrase(gap, "en"),
              region: safeText(calc.regionNameEn),
            })}</span
          >
        </div>
      {/each}
    {/if}

    <!-- The sector comparison, under the Sofia one because it answers the
       same question against a narrower reference. It is a picker rather
       than a default: the card would otherwise assert an industry about
       somebody who never named one (P7, no unsourced defaults).

       Two sentences travel with the number and neither is optional.
       НСИ publish an average by activity and NOBODY publishes a
       distribution by one — not Eurostat either, whose earn_ses_monthly
       carries no NACE section for BG at all, only broad groupings that
       lump section J with seven others — so a gap here is a distance from an average and
       never a rank. Said plainly by `sectorNoRank`; corrected for by
       `sectorAverageFlatters`, whose figures are the COUNTRY's shape and
       come nowhere near the sector average (mirror.js#meanRungPosition). -->
    {#if calc.sectorOptions.length > 0}
      <!-- A `.field` like every other control in this card: the label on its own
           line, the select at full width under it. It was the one side-by-side
           pair here, and sharing the line is what left the select 178px wide at
           360px — clipping «— избери дейност —» to «— избери дейно» on the
           control whose options are НСИ's section names, the longest strings on
           the page. Stacking is not a narrow-screen workaround; it is what the
           salary, the rent, the savings and the size fields all already do. -->
      <div class="field sector">
        <label for="sector-pick">
          <span class="l-bg">{COPY.sectorLabel.bg}</span>
          <span class="l-en">{COPY.sectorLabel.en}</span>
        </label>
        <select
          id="sector-pick"
          value={calc.sectorKey}
          onchange={(e) => calc.setSector(e.currentTarget.value)}
        >
          <option value="">{t(COPY.sectorNone, $lang)}</option>
          {#each calc.sectorOptions as opt (opt.key)}
            <option value={opt.key}>{$lang === "bg" ? opt.bg : opt.en}</option>
          {/each}
        </select>
      </div>

      {#if calc.sector}
        {#if calc.earnersDirty}
          {#each calc.sector.gaps as gap (gap.index)}
            <div class="gap">
              <span class="l-bg"
                >{@html t(calc.hasHousehold ? COPY.sectorDiffEarner : COPY.sectorDiff, "bg", {
                  n: fmt0(gap.ordinal),
                  delta: deltaPhrase(gap, "bg"),
                  sector: label(calc.sector.bgName),
                })}</span
              >
              <span class="l-en"
                >{@html t(calc.hasHousehold ? COPY.sectorDiffEarner : COPY.sectorDiff, "en", {
                  n: fmt0(gap.ordinal),
                  delta: deltaPhrase(gap, "en"),
                  sector: label(calc.sector.enName),
                })}</span
              >
            </div>
          {/each}
        {/if}
        <div class="hint src">
          <a class="l-bg" href={httpUrl(calc.sector.sourceUrlBg)} target="_blank" rel="noopener"
            >{t(COPY.sectorSrc, "bg", {
              gross: fmt0(calc.sector.gross),
              net: fmt0(calc.sector.net),
              period: period(calc.sector.refPeriod),
              prelim: calc.sector.isPreliminary ? t(COPY.srcPrelim, "bg") : "",
            })}</a
          >
          <a class="l-en" href={httpUrl(calc.sector.sourceUrl)} target="_blank" rel="noopener"
            >{t(COPY.sectorSrc, "en", {
              gross: fmt0(calc.sector.gross),
              net: fmt0(calc.sector.net),
              period: period(calc.sector.refPeriod),
              prelim: calc.sector.isPreliminary ? t(COPY.srcPrelim, "en") : "",
            })}</a
          >
        </div>
        <p class="hint caveat">
          <span class="l-bg">{COPY.sectorNoRank.bg}</span>
          <span class="l-en">{COPY.sectorNoRank.en}</span>
        </p>
        <!-- Directly under the rank caveat, because it answers the same
             question: what this gap is NOT. The sector table is НСИ's
             country-wide one and the Sofia line sits a few rows up, so without
             this the two read as one scale. -->
        <!-- The other two, one tap down.
             Four caveats under one figure is longer than a reader finishes,
             and the two above are the ones that say what the figure IS: an
             average rather than a rank, and the country's rather than Sofia's.
             What folds is how to read a gap the reader has already been told
             is a gap from an average.
             The chip's own label carries that, so a reader who never opens it
             has still been told there is more to the average than the level —
             the same standard the receipt rows' working is held to. -->
        <p class="hint caveat">
          <span class="l-bg">{COPY.sectorNationwide.bg}</span>
          <span class="l-en">{COPY.sectorNationwide.en}</span>
        </p>
        <details class="caveat-more">
          <summary class="disclose">
            <span class="dc-caret" aria-hidden="true">›</span>
            <span class="l-bg">{COPY.discloseSectorMore.bg}</span>
            <span class="l-en">{COPY.discloseSectorMore.en}</span>
          </summary>
          <div class="caveat-more-body">
            <!-- Gated on the skew the sentence asserts, not merely on the
                 payload being readable. It says more than half of employees
                 earn below the average and shows neither level to prove it, so
                 the only thing standing between the reader and a false claim is
                 the published median sitting below the published mean —
                 `mirror.js#meanRungPosition` reads that off the shape. Where a
                 future SES round did not carry it, this renders nothing rather
                 than a confident sentence about a distribution that had changed
                 shape underneath it. -->
            {#if calc.averageFlatters?.meanAboveMedian}
              <p class="hint caveat">
                <span class="l-bg"
                  >{t(COPY.sectorAverageFlatters, "bg", {
                    shapeYear: period(calc.averageFlatters.shapeYear),
                  })}</span
                >
                <span class="l-en"
                  >{t(COPY.sectorAverageFlatters, "en", {
                    shapeYear: period(calc.averageFlatters.shapeYear),
                  })}</span
                >
              </p>
            {/if}
            <p class="hint caveat">
              <span class="l-bg">{COPY.sectorCoverage.bg}</span>
              <span class="l-en">{COPY.sectorCoverage.en}</span>
            </p>
          </div>
        </details>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* A further income is the same field as the first, minus the hint stack:
     the label above it already says which income it is, and repeating
     «(чиста заплата на месец)» under every row turns one instruction into a
     column of them. */
  .earner {
    margin-top: 10px;
  }
  /* The picker sits apart from the income rows: it describes the reader's
     work rather than their pay, and running it into the stack of amounts
     reads as a third field of the same kind. */
  /* Only the spacing. `card.css` already lays a `.field` out — label block on
     its own line, control at `width: 100%` — and the picker now takes that
     rather than a flex row of its own.

     The row it used to be tried to keep the label and the select side by side
     and let the select shrink into whatever was left, which at 360px was 178px
     and clipped «— избери дейност —» down to «— избери дейно». Widening the
     select's floor instead only moved the problem: a `ch` floor is the font's
     own `0` advance, the select falls back to a different face per platform,
     and the same rule that wrapped the row on Linux left it one line on
     Windows CI at 179px. Any rule that decides this by measuring text is a rule
     that answers differently on somebody's machine.

     So the layout is a decision rather than an outcome, and it is the one the
     other eleven controls in this card already make. */
  .sector {
    margin-top: 14px;
  }
  /* The caveats are the sentence the number cannot be read without, so they
     are quiet but not fine print — same size as every other hint here, only
     dimmed. A caveat set smaller than the claim it qualifies is a caveat
     designed not to be read. That holds for the two behind the chip as well:
     folding a sentence is not licence to shrink it. */
  .caveat {
    margin: 6px 0 0;
    color: var(--ink-2);
  }
  /* The two comparison lines, and they are the loudest thing on this card
     after the pay field itself.

     **A claim may not be painted like the sentences qualifying it.** These are
     the two second-person answers the card exists to give — «твоята нетна
     заплата е 18% под средната за …» — and each is surrounded by three or four
     caveats explaining how to read it. Carrying `.hint` put the claim at 13px
     `--ink-2`, which is the caveats' own size and, after `.caveat` resolved to
     the same token, their exact colour: a reader scanning the card met five
     interchangeable grey lines and no answer among them. It was also smaller
     than the payslip chip above it and the sector picker below it, so the one
     sentence about the reader was the quietest thing in its neighbourhood.

     So the claim takes `--fs-lead` and `--ink` — the size the controls either
     side of it already use — and the caveats step down to `--muted`. The
     figure inside carries the weight, because `{delta}` arrives already
     wrapped in `<b>` by the copy.

     **What does NOT change is the hue, and that is a rule rather than a
     restraint.** `--real` and `--erode` mean a figure beat or lost to a
     reference, and a distance from a mean has no good end — see the block at
     the top of this component, and `verify_render_payroll.mjs`
     §"neither pay comparison is painted as a verdict". Prominence and valence
     are separate levers; this pulls the first one. */
  .gap {
    margin-top: 8px;
    font-size: var(--fs-lead);
    line-height: 1.45;
    color: var(--ink);
  }
  /* `:global`, because the sentence is rendered as markup rather than as text,
     and Svelte scopes a component's CSS by stamping a class onto the elements
     IT compiles. A `<b>` that arrived inside a COPY string carries no such
     class, so the plain selector compiles to `b.svelte-xxx`, matches nothing,
     and leaves the figure on the browser's default 700 — a rule that is there
     and does nothing, which `svelte-check` reports as an unused selector.
     `ResultsAnswer.svelte` spells it the same way for the same reason.

     The literal token for that rendering mode is deliberately not written in
     this comment: `verify_template_safety.mjs` scans the file for it and does
     not strip CSS comments, which is the conservative direction for a scanner
     whose job is finding every place markup reaches the DOM. */
  .gap :global(b) {
    font-weight: 600;
  }
  /* The caveats, one step down from the claim they qualify. Their own colour
     rather than the inherited `--ink-2`: the hierarchy the claim needs only
     exists if something below it is quieter, and these are the sentences a
     reader consults after the figure rather than before it. */
  .caveat {
    color: var(--muted);
  }
  .caveat-more {
    margin-top: 8px;
  }
  /* The rule down the left is what says the two sentences belong to the figure
     above rather than starting a new claim — the same mark the receipt rows'
     working carries, and the reason `disclosure.css` draws one there. It is
     not repeated here from that file because these rules are scoped to a
     component and that one is scoped to `.r-row`. */
  .caveat-more-body {
    margin-top: 7px;
    padding-left: 10px;
    border-left: 1px solid var(--line-2);
  }
  .earner-in {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .earner-in .unit {
    flex: 1;
  }
  /* The remove control is a quiet × rather than a labelled button: it sits on
     every row after the first, and a row of «премахни» buttons reads as the
     card's main action when the card's main action is typing a number. The
     accessible name is the full sentence, so a screen reader is not handed a
     multiplication sign. */
  .earner-rm {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    font-family: var(--sans);
    font-size: 1.1rem;
    line-height: 1;
    color: var(--muted);
    background: none;
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .earner-rm:hover {
    color: var(--erode);
    border-color: var(--erode);
  }
  /* Reads as a link, not a call to action — the same reasoning that keeps the
     «въведи своята заплата» route quiet. Adding an income is a thing some
     readers need, not the thing the card wants them to do. */
  .earner-add {
    display: inline-block;
    margin-top: 8px;
    padding: 0;
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--real-ink);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .earner-add:hover {
    color: var(--ink);
  }
  /* The toggle sits above the field it governs and reads as chrome, not as a
     result: it is the smallest control on the card because it is the one the
     reader touches least. */
  .basis {
    margin-bottom: 8px;
  }
  /* **The ledger rule between what the reader typed and what this card worked
     out.** Four hints in `--muted` 13px stand between the field and this
     answer, so painted the same the reader's own gross is the fifth
     interchangeable grey line and nothing says which of them the card produced
     rather than asked for. The pair leads and the deductions follow it: the
     answer, then how it was reached.

     **Prominence, never a hue** — `--real` and `--erode` say a figure beat or
     lost to a reference, and a gross is not a verdict. That is the rule at the
     top of this component and `.gap`'s below, on the card's other claim. */
  .answer {
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid var(--line);
  }
  .pair {
    font-size: var(--fs-lead);
    font-weight: 600;
    color: var(--ink);
  }
  .deduct {
    margin-top: 3px;
  }
  .hint.total {
    color: var(--ink-2);
  }
  /* Names the person a payslip belongs to. Only drawn when there is more than
     one, because a single payslip under a single field needs no heading to say
     whose it is. */
  .earner-head {
    margin-top: 10px;
    font-size: var(--fs-small);
    color: var(--ink-2);
  }
</style>
