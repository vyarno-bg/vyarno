<script>
  /**
   * Everything the reader can leave alone: the raise, rent, savings, the home
   * block, and the basket underneath them. **Every control here is a fact about
   * the reader**, which is why the measurement window is not — it is drawn
   * beside the figure it governs, and `ResultsSummary.svelte` says why.
   *
   * Net pay is not here. It is the one input every figure on the page is
   * priced off, so it has its own card and its own place in the grid —
   * `PayField.svelte` says why, and it matters most on a phone, where this
   * card is ordered last.
   *
   * Single-column on purpose — the fields have very different heights (the home
   * block opens a grid), so a two-column grid leaves ungrounded voids between
   * them. Every field is a full-width unit: label + hint + input + optional
   * sub-hint.
   */
  import { lang } from "../lib/stores.js";
  import { number, integer, period, decimalText, parseDecimal } from "../lib/format.js";
  import { COPY, HOME, t } from "../lib/content.js";
  import BasketEditor from "./BasketEditor.svelte";
  import RegionPicker from "./RegionPicker.svelte";

  /**
   * @type {{
   *   calc: import("../lib/calculator.svelte.js").Calculator,
   *   regionChoices?: Array<{code: string, name: string, coverage: string}>,
   * }}
   */
  const { calc, regionChoices = [] } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /**
   * What the rate field SHOWS, which is not always what the model holds.
   *
   * Every figure field on this card is `type="text"` so that a comma
   * reaches `parseDecimal` instead of being eaten by the number sanitiser
   * (format.js says what that cost). A text input has to be handed a string,
   * and the string cannot simply be `decimalText(calc.rate)`: re-deriving it
   * from the parsed number rewrites the box under the reader's caret, so
   * «2,» normalises to «2» before they have finished typing «2,75».
   *
   * So the draft is only ever assigned from somewhere the reader is not: the
   * published ECB figure, which lands after the payloads load and stops
   * landing the moment `rateTouched` flips. While they are typing, this holds
   * exactly the characters they entered and Svelte writes nothing back.
   */
  let rateDraft = $state(decimalText(HOME.rateDefaultPct, $lang));
  $effect(() => {
    if (!calc.rateTouched) rateDraft = decimalText(calc.rate, $lang);
  });

  /**
   * The same contract for the four money boxes, whose strings live on the
   * calculator because their numbers do.
   *
   * `rateTouched` has no counterpart here, so the gate is the box no longer
   * parsing to its own amount — true when a restore off this device sets one,
   * false on every keystroke, since typing is what put the amount there. That
   * is what leaves «1200,» alone until the reader finishes it.
   */
  const MONEY_FIELDS = ["rent", "cash", "m2", "manualPrice"];
  $effect(() => {
    for (const field of MONEY_FIELDS) {
      if (parseDecimal(calc[`${field}Text`]) !== calc[field]) {
        calc[`${field}Text`] = decimalText(calc[field], $lang);
      }
    }
  });

  // Short source label for the live-mortgage hint. We map the fallback chain
  // to a visible provenance string so the user can see WHICH tier the rate
  // they're typing over came from.
  // The raise field's label: it names the window (a year, or since a year) and,
  // when there is more than one income, which one it is about. Built here
  // because it combines two COPY keys with the anchor, and a template that does
  // that inline picks the wrong key on one of the four combinations.
  function raiseLabel(l, i) {
    const many = calc.earners.length > 1;
    if (calc.anchor === "y1") {
      return many ? t(COPY.raiseLabelEarner, l, { n: i + 1 }) : t(COPY.raiseLabel, l);
    }
    return many
      ? t(COPY.raiseSinceEarner, l, { y: calc.anchor, n: i + 1 })
      : t(COPY.raiseSince, l, { y: calc.anchor });
  }

  function rateSourceLabel(l) {
    const labels = {
      new_business: { bg: "ЕЦБ · нови жилищни кредити", en: "ECB · new home loans" },
      // Only reached if the new-business tier is missing. It answers a
      // different question, so it says so rather than passing for "the rate".
      outstanding_stock: {
        bg: "БНБ · средно по изплащаните кредити",
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

<div class="m-card m-inputs">
  <!-- The place picker sits ABOVE this card's heading, and the heading is the
     reason. «Ако искаш — още за теб» is a true promise about the raise, the
     rent, the savings and the home block below it — none of them has to be
     filled in — and it is the wrong promise about the one control on the card
     that decides WHICH published figures two other cards read. A reader who
     takes the heading at its word and skips the card meets «избери къде
     живееш» twice further down with nothing to act on.

     Inside this card rather than between the two, which is where it first
     went: `card.css` closes the seam between the pay field and this one on a
     wide screen so they read as a single card, and a third element between
     them opens a 135px hole that `verify_render_layout.mjs` measures.

     Not a modal, either: `docs/seo.md` prerenders every indexable entry, and
     what the READER decides may not be baked in — so an overlay would ship
     shut to a crawler or pop in over an already-hydrated page. A native
     `<select>` also degrades to a working control with no JavaScript, and on a
     360px screen the platform's own picker beats any listbox written here. -->
  {#if regionChoices.length > 0}
    <div class="field">
      <RegionPicker options={regionChoices} />
    </div>
  {/if}

  <h4>
    <span class="l-bg">{COPY.restOfNumbers.bg}</span>
    <span class="l-en">{COPY.restOfNumbers.en}</span>
  </h4>

  <!-- ONE RAISE PER INCOME. A household's rise is not a number people share:
       +10% for one earner and nothing for the other is not "+5% between us",
       and the combined figure is weighted by what each was paid BEFORE
       (mirror.js#householdNetRaisePct). Asking once and applying it to
       everybody would invent the missing answer.
       The fields stay in THIS card rather than moving next to the pay inputs:
       the raise is optional, and the pay card is ordered first on a phone
       precisely so the question it asks is short. -->
  {#each calc.earners as earner, i (i)}
    <div class="field">
      <label for={i === 0 ? "inRaise" : `inRaise${i}`}>
        <span class="l-bg">{raiseLabel("bg", i)}</span>
        <span class="l-en">{raiseLabel("en", i)}</span>
        <span class="hint">
          <span class="l-bg">{COPY.raiseHint.bg}</span>
          <span class="l-en">{COPY.raiseHint.en}</span>
        </span>
      </label>
      <span class="unit" data-u="%">
        <input
          id={i === 0 ? "inRaise" : `inRaise${i}`}
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="—"
          value={earner.raiseText}
          oninput={(e) => calc.onRaiseInput(i, e)}
          aria-label={raiseLabel($lang, i)}
        />
      </span>
    </div>
  {/each}
  <div class="field">
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
        type="text"
        inputmode="decimal"
        autocomplete="off"
        value={calc.rentText}
        oninput={(e) => calc.onAmountInput("rent", e)}
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
        type="text"
        inputmode="decimal"
        autocomplete="off"
        value={calc.cashText}
        oninput={(e) => calc.onAmountInput("cash", e)}
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
            onchange={calc.useMarketPrice}
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
            onchange={calc.useManualPrice}
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
              type="text"
              inputmode="decimal"
              autocomplete="off"
              value={calc.m2Text}
              oninput={(e) => calc.onAmountInput("m2", e)}
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
              type="text"
              inputmode="decimal"
              autocomplete="off"
              bind:value={rateDraft}
              oninput={(e) => calc.onRateInput(e)}
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
          <!-- The total cost of the same credit: APRC (ГПР), the
             charges the bank requires in order to lend included. An
             official monthly ЕЦБ figure rather than an advertised
             promotional from-rate, and the cost of the CREDIT rather
             than of the purchase — the directives defining it exclude
             notarial costs and the transfer-registration fee. Shown as
             a sub-caption so the cheaper headline rate is never the
             only number on screen. -->
          {#if calc.mortgageAprcData}
            <div class="hint" style="margin-top:2px">
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
           Hint below shows the implied €/m² next to the median for
           the reader's own град, and only when there is one. -->
        {#if calc.priceMode === "manual"}
          <div class="field" style="grid-column: span 2">
            <label for="inManualPrice">
              <span class="l-bg">{COPY.manualPriceLabel.bg}</span>
              <span class="l-en">{COPY.manualPriceLabel.en}</span>
            </label>
            <span class="unit" data-u="€">
              <input
                id="inManualPrice"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                value={calc.manualPriceText}
                oninput={(e) => calc.onAmountInput("manualPrice", e)}
                aria-label={t(COPY.manualPriceLabel, $lang)}
              />
            </span>
            <!-- The comparison in brackets names the city it is a median OF,
                 and it is drawn only when there IS one. It read «софийската
                 медиана» beside whichever град the reader picked, and beside
                 `HOME.eurPerM2_offlineFallback` — a round constant имот.bg
                 never published — for a reader who had picked none. Both are
                 the same defect: a number wearing a provenance that is not
                 its own, on the control where somebody is checking their own
                 asking price against ours. -->
            <div class="hint" style="margin-top:4px">
              <span class="l-bg"
                >при {calc.m2} м² ≈ <b>{fmt0(calc.manualEurPerM2)} €/м²</b>
                {calc.manualEurPerM2 > 0 && calc.cityPriceIsLive
                  ? t(COPY.manualVsMedian, "bg", {
                      city: calc.cityNameBg,
                      pm2: fmt0(calc.cityEurPerM2),
                    })
                  : ""}.</span
              >
              <span class="l-en"
                >at {calc.m2} m² ≈ <b>€{fmt0(calc.manualEurPerM2)}/m²</b>
                {calc.manualEurPerM2 > 0 && calc.cityPriceIsLive
                  ? t(COPY.manualVsMedian, "en", {
                      city: calc.cityNameEn,
                      pm2: fmt0(calc.cityEurPerM2),
                    })
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
          <div class="hint" style="margin-top:4px">
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
