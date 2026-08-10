<script>
  /**
   * Everything the reader can leave alone: the comparison period, the raise,
   * rent, savings, the home block, and the basket underneath them.
   *
   * Net pay is not here. It is the one input every figure on the page is
   * priced off, so it has its own card and its own place in the grid —
   * `PayField.svelte` says why, and it matters most on a phone, where this
   * card is ordered last.
   *
   * Single-column on purpose — the fields have very different heights (the
   * anchor is a dropdown plus a hint, the home block opens a grid), so a
   * two-column grid leaves ungrounded voids between them. Every field is a
   * full-width unit: label + hint + input + optional sub-hint.
   */
  import { lang } from "../lib/stores.js";
  import { number, integer, period, decimalText } from "../lib/format.js";
  import { COPY, HOME, t } from "../lib/content.js";
  import BasketEditor from "./BasketEditor.svelte";
  import RegionPicker from "./RegionPicker.svelte";

  /**
   * @type {{
   *   calc: import("../lib/calculator.svelte.js").Calculator,
   *   regionChoices?: Array<{code: string, name: string, hasPrice: boolean}>,
   * }}
   */
  const { calc, regionChoices = [] } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /**
   * What the rate field SHOWS, which is not always what the model holds.
   *
   * The two decimal fields on this card are `type="text"` so that a comma
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
  <h4>
    <span class="l-bg">{COPY.restOfNumbers.bg}</span>
    <span class="l-en">{COPY.restOfNumbers.en}</span>
  </h4>

  <!-- The област picker leads, because it is the one control here that
     changes WHICH published figures the page reads rather than what is done
     with them — and it governs two cards in the strip that render an explicit
     "choose one" state until it is answered.

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

  <!-- Single-column on purpose: the fields have very different
     heights (the anchor is a dropdown plus a hint, the home block
     opens a grid), so a two-column grid leaves ungrounded voids
     between them. Every field is a full-width unit: label + hint +
     input + optional sub-hint. -->
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
          ? t(COPY.anchorY1Hint, $lang, { latest_month: calc.basketRefPeriod })
          : t(COPY.anchorSinceHint, $lang)}</span
      >
      <span class="l-en"
        >{calc.anchor === "y1"
          ? t(COPY.anchorY1Hint, $lang, { latest_month: calc.basketRefPeriod })
          : t(COPY.anchorSinceHint, $lang)}</span
      >
    </div>
  </div>

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
                calc.manualPrice = Math.round(calc.cityEurPerM2 * calc.m2);
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
          <!-- The all-in cost of the same loans: APRC (ГПР), fees
             included — the official monthly ЕЦБ answer to "what does
             it really cost", rather than an advertised promotional
             from-rate. Shown as a sub-caption so the cheaper
             headline rate is never the only number on screen. -->
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
                  ? `(софийската медиана е ${fmt0(calc.cityEurPerM2)} €/м²)`
                  : ""}.</span
              >
              <span class="l-en"
                >at {calc.m2} m² ≈ <b>€{fmt0(calc.manualEurPerM2)}/m²</b>
                {calc.manualEurPerM2 > 0
                  ? `(Sofia median is €${fmt0(calc.cityEurPerM2)}/m²)`
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
