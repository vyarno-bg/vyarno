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
   * Everything below the input is gated on `salaryDirty`. The gross, the
   * deductions and the Sofia comparison are facts about whoever earns the €900
   * placeholder until the reader replaces it — the same reasoning that keeps
   * PercentileRow silent, and here it also keeps the first paint short enough
   * that the headline figure stays above the fold on a 664px phone.
   */
  import { lang } from "../lib/stores.js";
  import { number, integer } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";
  import PayslipTable from "./PayslipTable.svelte";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
</script>

<div class="m-card m-pay">
  <h4>
    <span class="l-bg">{COPY.yourNumbers.bg}</span>
    <span class="l-en">{COPY.yourNumbers.en}</span>
  </h4>

  <div class="field">
    <label for="inSalary">
      <span class="l-bg">{COPY.netPay.bg}</span>
      <span class="l-en">{COPY.netPay.en}</span>
      <span class="hint">
        <span class="l-bg">{COPY.netPayHint.bg}</span>
        <span class="l-en">{COPY.netPayHint.en}</span>
      </span>
    </label>
    <span class="unit" data-u="€">
      <input
        id="inSalary"
        type="number"
        inputmode="numeric"
        min="0"
        step="10"
        bind:value={calc.salary}
        oninput={calc.onSalaryInput}
        aria-label={t(COPY.netPay, $lang)}
      />
    </span>
    <div class="hint" style="margin-top:4px">
      <span class="l-bg">{COPY.medianDefault.bg}</span>
      <span class="l-en">{COPY.medianDefault.en}</span>
    </div>
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
       reader who does not. -->
    {#if calc.salaryDirty && calc.payslip}
      <div class="hint" style="margin-top:4px; color:var(--ink-2)">
        <span class="l-bg"
          >по договор (бруто) това е ≈ {fmt0(calc.payslip.gross)} € - от тях {fmt0(
            calc.payslip.insurance
          )} € осигуровки и {fmt0(calc.payslip.tax)} € данък, или {fmt(
            calc.payslip.effectiveRatePct
          )}% удръжки</span
        >
        <span class="l-en"
          >on the contract (gross) that's ≈ {fmt0(calc.payslip.gross)} € - of which {fmt0(
            calc.payslip.insurance
          )} € contributions and {fmt0(calc.payslip.tax)} € tax, i.e. {fmt(
            calc.payslip.effectiveRatePct
          )}% deducted</span
        >
      </div>
      <PayslipTable payslip={calc.payslip} />
    {/if}
    <!-- The personal Sofia comparison sits under the user's typed
       salary, next to the input it compares against — the Sofia card
       in the national strip is a country reference and carries no
       personal verdict. Colour follows the rent-burden pattern
       (--real above, --erode below, neutral when ≈ equal). {delta}
       is built here from {sign} + {n}% + {dirWord} and spliced into
       the COPY string as one clause, which is what keeps the
       Bulgarian grammatical. -->
    {#if calc.salaryDirty && calc.salary > 0 && calc.sofiaNet > 0}
      {@const sofiaDiff = Math.round((100 * (calc.salary - calc.sofiaNet)) / calc.sofiaNet)}
      {@const sofiaDirKey =
        sofiaDiff > 1 ? "statSofiaAbove" : sofiaDiff < -1 ? "statSofiaBelow" : "statSofiaEqual"}
      <!-- No sign here. The direction word already carries it, and
         emitting both produced «-39% под средната» / "-39% below the
         average" — a double negative that reads, literally, as 39%
         less far below. The magnitude is unsigned; «под»/"below" and
         «над»/"above" say which way, and the colour reinforces it. -->
      {@const sofiaDirWord = COPY[sofiaDirKey][$lang] ?? COPY[sofiaDirKey].bg}
      {@const sofiaDelta =
        sofiaDirKey === "statSofiaEqual" ? sofiaDirWord : `${Math.abs(sofiaDiff)}% ${sofiaDirWord}`}
      {@const sofiaColor =
        sofiaDiff > 1 ? "var(--real)" : sofiaDiff < -1 ? "var(--erode)" : "var(--ink-2)"}
      <div class="hint" style="margin-top:4px; color:{sofiaColor}">
        <span class="l-bg"
          >{@html COPY.statSofiaDiff.bg.replace("{delta}", `<b>${sofiaDelta}</b>`)}</span
        >
        <span class="l-en"
          >{@html COPY.statSofiaDiff.en.replace("{delta}", `<b>${sofiaDelta}</b>`)}</span
        >
      </div>
    {/if}
  </div>
</div>
