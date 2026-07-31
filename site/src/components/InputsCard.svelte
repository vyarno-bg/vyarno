<script>
  /**
   * Everything the reader types: pay, raise, rent, savings, the home block,
   * and the basket underneath them.
   *
   * Single-column on purpose — the fields have very different heights (net pay
   * carries several sub-hints, the anchor is a dropdown plus a hint), so a
   * two-column grid leaves ungrounded voids between them. Every field is a
   * full-width unit: label + hint + input + optional sub-hint.
   */
  import { lang } from "../lib/stores.js";
  import { number, integer, period } from "../lib/format.js";
  import { COPY, HOME, t } from "../lib/content.js";
  import PayslipTable from "./PayslipTable.svelte";
  import BasketEditor from "./BasketEditor.svelte";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // Short source label for the live-mortgage hint. We map the fallback chain
  // to a visible provenance string so the user can see WHICH tier the rate
  // they're typing over came from.
  function rateSourceLabel(l) {
    const labels = {
      new_business: { bg: "ЕЦБ · нови жилищни кредити", en: "ECB · new home loans" },
      // Only reached if the new-business tier is missing. It answers a
      // different question, so it says so rather than passing for "the rate".
      outstanding_stock: {
        bg: "БНБ · средно по вече изплащани",
        en: "BNB · loans already being repaid",
      },
      // A reader-facing label, so it says what the number is rather than what
      // the code calls the constant: «сенза» is not a Bulgarian word, and
      // "sentinel" is internal vocabulary either way. Same wording as
      // COPY.rateDefaultOffline, which describes the same fallback.
      offline_sentinel: { bg: "резервна стойност", en: "fallback value" },
    };
    return (
      (labels[calc.mortgageRateData.label] ?? labels.offline_sentinel)[l] ??
      labels.offline_sentinel.en
    );
  }
</script>

<div class="m-card">
  <h4>
    <span class="l-bg">{COPY.yourNumbers.bg}</span>
    <span class="l-en">{COPY.yourNumbers.en}</span>
  </h4>

  <!-- Single-column on purpose: the fields have very different
     heights (net pay carries several sub-hints, the anchor is a
     dropdown plus a hint), so a two-column grid leaves ungrounded
     voids between them. Every field is a full-width unit: label +
     hint + input + optional sub-hint. -->
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
        aria-label={t(COPY.netPay, $lang)}
      />
    </span>
    <div class="hint" style="margin-top:4px">
      <span class="l-bg">{COPY.medianDefault.bg}</span>
      <span class="l-en">{COPY.medianDefault.en}</span>
    </div>
    <!-- Back-computed gross + tax breakdown from the typed
       net salary. Shows what the contract GROSS is and
       the effective rate.
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
    {#if calc.payslip}
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
    {#if calc.salary > 0 && calc.sofiaNet > 0}
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

  <div class="field">
    <label for="inAnchor">
      <span class="l-bg">{COPY.anchor.bg}</span>
      <span class="l-en">{COPY.anchor.en}</span>
    </label>
    <!-- The labels state what the math actually computes (see
       mirror.js#rateFor and its anchor branch).
         y1 → verbatim RCH_A from prc_hicp_minr at the
              headline's ref_period. The previous-month
              string is derived from the same ref_period
              (e.g. ref_period="2026-06" → previous="2025-06";
              the YoY window is shown inline as a range).
         {y} → idx[latestYear] / idx[yearEnd] − 1. The
              numerator end-point is whatever year has
              the freshest index (latestIndexYear()).
       Bare numbers like "2025" don't tell the user what
       they're comparing TO — we show the comparison
       end-point inline. The yoyWindow + idxLatestYearLabel
       deriveds are computed at the script's top level
       (see the `$derived` block above) because `{@const}`
       blocks must be the immediate child of an Svelte
       block directive, not a sibling element. -->
    <select
      id="inAnchor"
      value={calc.anchor === "y1" ? "y1" : String(calc.anchor)}
      onchange={calc.onAnchorChange}
    >
      <option value="y1"
        >{COPY.anchorY1[$lang] ?? COPY.anchorY1.bg}{calc.yoyWindowLabel
          ? ` · ${calc.yoyWindowLabel}`
          : ""}</option
      >
      {#each calc.anchorYears as y (y)}
        <!-- The end-point range lives in a title rather than the
           option text: inline it is wider than the field and the
           dropdown breaks. -->
        <option
          value={String(y)}
          title={calc.idxLatestYearLabel && calc.idxLatestYearLabel !== String(y)
            ? $lang === "bg"
              ? `от края на ${y} до ${calc.idxLatestYearLabel}`
              : `end-of-${y} → ${calc.idxLatestYearLabel}`
            : ""}
        >
          {y}</option
        >
      {/each}
    </select>
    <div class="hint" style="margin-top:4px;font-size: var(--fs-small)">
      <span class="l-bg"
        >{calc.anchor === "y1"
          ? t(COPY.anchorY1Hint, $lang, { latest_month: calc.freshestLatestTime })
          : t(COPY.anchorSinceHint, $lang)}</span
      >
      <span class="l-en"
        >{calc.anchor === "y1"
          ? t(COPY.anchorY1Hint, $lang, { latest_month: calc.freshestLatestTime })
          : t(COPY.anchorSinceHint, $lang)}</span
      >
    </div>
  </div>

  <div class="field">
    <label for="inRaise">
      <span class="l-bg"
        >{calc.anchor === "y1"
          ? COPY.raiseLabel.bg
          : COPY.raiseSince.bg.replace("{y}", calc.anchor)}</span
      >
      <span class="l-en"
        >{calc.anchor === "y1"
          ? COPY.raiseLabel.en
          : COPY.raiseSince.en.replace("{y}", calc.anchor)}</span
      >
      <span class="hint">
        <span class="l-bg">{COPY.raiseHint.bg}</span>
        <span class="l-en">{COPY.raiseHint.en}</span>
      </span>
    </label>
    <span class="unit" data-u="%">
      <input
        id="inRaise"
        type="number"
        inputmode="decimal"
        step="0.5"
        placeholder="—"
        value={Number.isFinite(calc.raise) ? calc.raise : ""}
        oninput={calc.onRaiseInput}
        aria-label={t(COPY.raiseLabel, $lang)}
      />
    </span>
    <!-- A sub-hint keeps this field a complete unit like the others
       (label + input + hint), and says WHY we ask: outpacing
       inflation. -->
    <div class="hint" style="margin-top:4px">
      <span class="l-bg">{COPY.raiseHelp.bg}</span>
      <span class="l-en">{COPY.raiseHelp.en}</span>
    </div>
  </div>

  <div class="field">
    <label for="inRent">
      <span class="l-bg">{COPY.rent.bg}</span>
      <span class="l-en">{COPY.rent.en}</span>
      <span class="hint">
        <span class="l-bg">{COPY.rentHint.bg}</span>
        <span class="l-en">{COPY.rentHint.en}</span>
      </span>
    </label>
    <span class="unit" data-u="€">
      <input
        id="inRent"
        type="number"
        inputmode="numeric"
        min="0"
        step="10"
        bind:value={calc.rent}
        aria-label={t(COPY.rent, $lang)}
      />
    </span>
  </div>

  <div class="field">
    <label for="inCash">
      <span class="l-bg">{COPY.cash.bg}</span>
      <span class="l-en">{COPY.cash.en}</span>
      <span class="hint">
        <span class="l-bg">{COPY.cashHint.bg}</span>
        <span class="l-en">{COPY.cashHint.en}</span>
      </span>
    </label>
    <span class="unit" data-u="€">
      <input
        id="inCash"
        type="number"
        inputmode="numeric"
        min="0"
        step="100"
        bind:value={calc.cash}
        aria-label={t(COPY.cash, $lang)}
      />
    </span>
  </div>
  <!-- HOME BLOCK -->
  <div class="h4row home-h">
    <h4 style="margin:0">
      <span class="l-bg">{COPY.homeHeading.bg}</span>
      <span class="l-en">{COPY.homeHeading.en}</span>
    </h4>
    <label class="homeTog">
      <input type="checkbox" bind:checked={calc.homeOn} />
      <span class="l-bg">{COPY.homeToggle.bg}</span>
      <span class="l-en">{COPY.homeToggle.en}</span>
    </label>
  </div>
  <div class="hint" id="homeHint" style="margin:2px 0 10px">
    <span class="l-bg">{COPY.homeHint.bg}</span>
    <span class="l-en">{COPY.homeHint.en}</span>
  </div>
  {#if calc.homeOn}
    <div id="homeInputs">
      <div class="f-row" style="margin-bottom:6px">
        <!-- Price source radio. Default = "from market" — price
           is imot.bg median × m² (the typical-buyer case).
           Manual = user typed the asking price for a home
           they already found. The m² field below is always
           shown (needed to compute years-to-buy at the
           user's salary) but is decoupled from price when
           manual is selected. -->
        <label class="priceModeTog">
          <input
            type="radio"
            name="priceMode"
            value="auto"
            checked={calc.priceMode === "auto"}
            onchange={() => (calc.priceMode = "auto")}
          />
          <span class="l-bg">{COPY.priceModeAuto.bg}</span>
          <span class="l-en">{COPY.priceModeAuto.en}</span>
        </label>
        <label class="priceModeTog">
          <input
            type="radio"
            name="priceMode"
            value="manual"
            checked={calc.priceMode === "manual"}
            onchange={() => {
              if (calc.manualPrice === 0)
                calc.manualPrice = Math.round(calc.sofiaEurPerM2 * calc.m2);
              calc.priceMode = "manual";
            }}
          />
          <span class="l-bg">{COPY.priceModeManual.bg}</span>
          <span class="l-en">{COPY.priceModeManual.en}</span>
        </label>
      </div>
      <div class="f-row">
        <div class="field">
          <label for="inM2">
            <span class="l-bg">{COPY.m2Label.bg}</span>
            <span class="l-en">{COPY.m2Label.en}</span>
          </label>
          <span class="unit" data-u="м²">
            <input
              id="inM2"
              type="number"
              inputmode="numeric"
              min="20"
              step="5"
              bind:value={calc.m2}
              aria-label={t(COPY.m2Label, $lang)}
            />
          </span>
        </div>
        <div class="field">
          <label for="inRate">
            <span class="l-bg">{COPY.rateLabel.bg}</span>
            <span class="l-en">{COPY.rateLabel.en}</span>
          </label>
          <span class="unit" data-u="%">
            <input
              id="inRate"
              type="number"
              inputmode="decimal"
              min="0.1"
              step="0.1"
              bind:value={calc.rate}
              oninput={calc.onRateInput}
              aria-label={t(COPY.rateLabel, $lang)}
            />
          </span>
          <div class="hint" style="margin-top:4px">
            {#if calc.dataReady && calc.data.mortgage && calc.mortgageRateData.label !== "offline_sentinel"}
              <span class="l-bg"
                >{@html t(COPY.rateDefaultLive, $lang, {
                  src: rateSourceLabel($lang),
                  pct: fmt(calc.mortgageRateData.pct, 2),
                  p: period(calc.mortgageRateData.refPeriod),
                })}</span
              >
              <span class="l-en"
                >{@html t(COPY.rateDefaultLive, $lang, {
                  src: rateSourceLabel($lang),
                  pct: fmt(calc.mortgageRateData.pct, 2),
                  p: period(calc.mortgageRateData.refPeriod),
                })}</span
              >
            {:else}
              <span class="l-bg"
                >{@html t(COPY.rateDefaultOffline, $lang, {
                  src: HOME.rateDefaultSource,
                  pct: fmt(HOME.rateDefaultPct, 2),
                })}</span
              >
              <span class="l-en"
                >{@html t(COPY.rateDefaultOffline, $lang, {
                  src: HOME.rateDefaultSource,
                  pct: fmt(HOME.rateDefaultPct, 2),
                })}</span
              >
            {/if}
          </div>
          <!-- The all-in cost of the same loans: APRC (ГПР), fees
             included — the official monthly ЕЦБ answer to "what does
             it really cost", rather than an advertised promotional
             from-rate. Shown as a sub-caption so the cheaper
             headline rate is never the only number on screen. -->
          {#if calc.mortgageAprcData}
            <div class="hint" style="margin-top:2px;opacity:0.8">
              <span class="l-bg"
                >{@html t(COPY.rateAprc, $lang, {
                  pct: fmt(calc.mortgageAprcData.pct, 2),
                  p: period(calc.mortgageAprcData.refPeriod),
                })}</span
              >
              <span class="l-en"
                >{@html t(COPY.rateAprc, $lang, {
                  pct: fmt(calc.mortgageAprcData.pct, 2),
                  p: period(calc.mortgageAprcData.refPeriod),
                })}</span
              >
            </div>
          {/if}
        </div>
      </div>
      <div class="f-row">
        <!-- Manual price input. Shown only when priceMode === "manual".
           The homePrice derived uses this when set, so the
           mortgage math immediately reflects the asking price.
           Hint below shows the implied €/m² next to the Sofia
           median for sanity-check. -->
        {#if calc.priceMode === "manual"}
          <div class="field" style="grid-column: span 2">
            <label for="inManualPrice">
              <span class="l-bg">{COPY.manualPriceLabel.bg}</span>
              <span class="l-en">{COPY.manualPriceLabel.en}</span>
            </label>
            <span class="unit" data-u="€">
              <input
                id="inManualPrice"
                type="number"
                inputmode="numeric"
                min="1000"
                step="1000"
                bind:value={calc.manualPrice}
                aria-label={t(COPY.manualPriceLabel, $lang)}
              />
            </span>
            <div class="hint" style="margin-top:4px">
              <span class="l-bg"
                >при {calc.m2} м² ≈ <b>{fmt0(calc.manualEurPerM2)} €/м²</b>
                {calc.manualEurPerM2 > 0
                  ? `(софийската медиана е ${fmt0(calc.sofiaEurPerM2)} €/м²)`
                  : ""}.</span
              >
              <span class="l-en"
                >at {calc.m2} m² ≈ <b>€{fmt0(calc.manualEurPerM2)}/m²</b>
                {calc.manualEurPerM2 > 0
                  ? `(Sofia median is €${fmt0(calc.sofiaEurPerM2)}/m²)`
                  : ""}.</span
              >
            </div>
          </div>
        {/if}
        <div class="field" style="grid-column: span 2">
          <label for="inTerm">
            <span class="l-bg">{COPY.termLabel.bg}</span>
            <span class="l-en">{COPY.termLabel.en}</span>
          </label>
          <!-- Capped at the BNB maturity limit (30y). A longer term
             would quote a payment no BG bank can legally offer. -->
          <span class="unit" data-u="г.">
            <input
              id="inTerm"
              type="number"
              inputmode="numeric"
              min="5"
              max={calc.limits.maturityMaxYears}
              step="1"
              bind:value={calc.term}
              aria-label={t(COPY.termLabel, $lang)}
            />
          </span>
          <div class="hint" style="margin-top:4px;opacity:0.8">
            <span class="l-bg"
              >{@html t(COPY.limitsNote, $lang, {
                ltv: fmt0(100 - calc.downPayPct),
                d: fmt0(calc.downPayPct),
                ty: fmt0(calc.limits.maturityMaxYears),
              })}</span
            >
            <span class="l-en"
              >{@html t(COPY.limitsNote, $lang, {
                ltv: fmt0(100 - calc.downPayPct),
                d: fmt0(calc.downPayPct),
                ty: fmt0(calc.limits.maturityMaxYears),
              })}</span
            >
          </div>
        </div>
      </div>
    </div>
  {/if}

  <BasketEditor {calc} />
</div>

<style>
  .home-h {
    margin-top: 14px;
  }
  /* Price-source radio, for someone who already found a home. Same flex
     treatment as homeTog above; the two labels sit on one row and whichever
     is checked drives the homePrice derived value. */
  .priceModeTog {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--ink-2);
    cursor: pointer;
    user-select: none;
    margin-right: 14px;
  }
  .priceModeTog input {
    accent-color: var(--real);
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
  }
</style>
