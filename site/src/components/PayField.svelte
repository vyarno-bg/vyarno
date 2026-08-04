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
  import { number, integer } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";
  import PayslipTable from "./PayslipTable.svelte";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // The direction word carries the sign, so the magnitude is unsigned. Emitting
  // both produced «-39% под средната» / "-39% below the average" — a double
  // negative that reads, literally, as 39% less far below.
  const DIR_KEY = { above: "statSofiaAbove", below: "statSofiaBelow", equal: "statSofiaEqual" };
  const DIR_COLOR = { above: "var(--real)", below: "var(--erode)", equal: "var(--ink-2)" };

  // The whole «28% над» / "28% above" clause, built here and spliced into the
  // COPY string as ONE placeholder — which is what keeps the Bulgarian
  // grammatical. Assembling it out of separate {sign}{n}{word} holes in the
  // template is what produced «-39% под средната»: a magnitude carrying a sign
  // beside a word that already carries one, which reads as 39% less far below.
  // The magnitude arrives unsigned from view.js#sofiaGap and is formatted here,
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
        type="number"
        inputmode="numeric"
        min="0"
        step="10"
        bind:value={calc.earners[0].amount}
        oninput={() => calc.onEarnerInput(0)}
        aria-label={calc.hasHousehold ? t(COPY.earnerLabel, $lang, { n: 1 }) : t(payLabel, $lang)}
      />
    </span>
    <div class="hint" style="margin-top:4px">
      <span class="l-bg">{COPY.medianDefault.bg}</span>
      <span class="l-en">{COPY.medianDefault.en}</span>
    </div>
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
              type="number"
              inputmode="numeric"
              min="0"
              step="10"
              bind:value={calc.earners[i].amount}
              oninput={() => calc.onEarnerInput(i)}
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
      <div class="hint" style="margin-top:4px; color:var(--ink-2)">
        <span class="l-bg">{t(summaryKey, "bg", summaryArgs)}</span>
        <span class="l-en">{t(summaryKey, "en", summaryArgs)}</span>
      </div>
      <!-- Both readings side by side, always. The toggle changes which one the
           reader edits, and showing only the other half leaves them working out
           which basis the page is in from the wording of a sentence. -->
      <div class="hint pair mono" style="margin-top:2px">
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
       personal verdict. Colour follows the rent-burden pattern
       (--real above, --erode below, neutral when ≈ equal).
       One line per income: НСИ publish a WAGE, so comparing a
       two-earner total against it would report a household of two on
       €900 each as 21% above the average worker. The magnitude, the
       direction word and the dead zone are decided in
       view.js#sofiaGap; this picks the words and the colour. -->
    {#if calc.earnersDirty}
      {#each calc.sofiaGaps as gap (gap.index)}
        <div class="hint" style="margin-top:4px; color:{DIR_COLOR[gap.direction]}">
          <span class="l-bg"
            >{@html t(calc.hasHousehold ? COPY.statSofiaDiffEarner : COPY.statSofiaDiff, "bg", {
              n: fmt0(gap.ordinal),
              delta: deltaPhrase(gap, "bg"),
            })}</span
          >
          <span class="l-en"
            >{@html t(calc.hasHousehold ? COPY.statSofiaDiffEarner : COPY.statSofiaDiff, "en", {
              n: fmt0(gap.ordinal),
              delta: deltaPhrase(gap, "en"),
            })}</span
          >
        </div>
      {/each}
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
  .hint.pair {
    color: var(--muted);
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
