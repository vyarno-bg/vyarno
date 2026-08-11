<script>
  /**
   * Вярно.bg — the calculator SPA's composition root.
   *
   * This file owns the page's shape and nothing else: header, banner, the two
   * cards, the country strip, the explainer, the footer, plus the two states
   * that replace the calculator entirely (loading, and load-failed).
   *
   * The state everything reads lives in `$lib/calculator.svelte.js`, and its
   * header explains why it is not in this file any more. Math lives in
   * `$lib/mirror` (pure), the wiring between a formula and its inputs in
   * `$lib/view`, BG/EN copy in `$lib/content`, and the fetch in `$lib/data`.
   */
  import { onMount } from "svelte";
  import {
    lang,
    region,
    rememberInputs,
    readInputs,
    writeInputs,
    forgetInputs,
  } from "./lib/stores.js";
  import { Calculator } from "./lib/calculator.svelte.js";
  import { regionOptions } from "./lib/view.js";
  // The footer is shared with /legal/ and /404.html so the upstream
  // attribution and the legal links cannot be present on one page and missing
  // from another. See lib/SiteFooter.svelte.
  import SiteFooter from "./lib/SiteFooter.svelte";
  import SiteHeader from "./components/SiteHeader.svelte";
  import DataBanner from "./components/DataBanner.svelte";
  import NationalStrip from "./components/NationalStrip.svelte";
  import ExplainerBand from "./components/ExplainerBand.svelte";
  import PayField from "./components/PayField.svelte";
  import InputsCard from "./components/InputsCard.svelte";
  import RememberInputs from "./components/RememberInputs.svelte";
  import ResultsCard from "./components/ResultsCard.svelte";
  import { COPY, t } from "./lib/content.js";
  import { CONTACT } from "./lib/legal-nav.js";

  /**
   * Both are set only by `scripts/prerender.mjs`, which renders this component
   * on the server at build time so the page carries its prose AND the
   * country's figures before the bundle runs. `main.js` passes neither.
   *
   * `payloads` is the `loadAll()` result read off disk — the same files
   * `copy-data.mjs` puts in `dist/data/published/` for the bundle to fetch, so
   * the HTML a crawler reads and the JSON the reader's tab fetches come out of
   * one build from one set of files.
   *
   * `prerender` turns off the one region that is not the payloads' to decide:
   * the calculator. Its output follows what the reader typed, and the €900 in
   * the pay field is a placeholder the copy asks them to replace rather than a
   * survey figure (docs/principles.md P7) — so a result computed from it is an
   * answer to a question nobody asked, served to whoever reads the HTML.
   * `docs/seo.md` §"The rule" is the whole reasoning.
   */
  const { prerender = false, payloads = null } = $props();

  // svelte-ignore state_referenced_locally
  // Reading the initial value is the whole intent: `payloads` is set once by
  // the build and never again, and the Calculator holds what it was given.
  const calc = new Calculator(payloads);

  onMount(calc.load);

  /**
   * What a previous visit left on this device, read once, before any effect
   * runs — so the write-through below cannot overwrite it with the defaults it
   * is looking at while the payloads are still in flight.
   *
   * `null` covers every reason there is nothing to put back: a reader who never
   * asked, a private-mode browser, and a blob written by a shape this build
   * cannot read (`stores.js#readInputs` deletes that one rather than leaving
   * the reader's figures on a device where nothing will ever pick them up).
   */
  let saved = readInputs();

  // Not folded into `load()`: the term clamp has to re-run when the *reader*
  // types a term past the BNB maturity cap, not only when a payload arrives.
  // See Calculator#syncWithData.
  $effect(() => {
    calc.syncWithData();
    // AFTER the seeding, and only once there are divisions to measure against:
    // `restore` judges a saved basket by the payload published today, and it is
    // the seeding it has to land on top of. A snapshot this build cannot fit —
    // a division added, a group added, more incomes than the card holds — is
    // refused whole and the device is cleared, because what is on it then is
    // the reader's figures under a shape nothing here will ever read again.
    //
    // **`categories.length`, not `dataReady`.** A fetch that failed leaves the
    // page in its failure state with `dataReady` true and no divisions at all,
    // and measuring a saved basket against nothing refuses every snapshot —
    // which would erase the reader's own figures to report OUR network problem.
    // Held instead, so the retry that fixes the fetch also restores them.
    if (saved && calc.categories.length > 0) {
      if (!calc.restore(saved)) forgetInputs();
      saved = null;
    }
  });

  /**
   * Write-through, and the ONE place anything the reader typed reaches storage.
   *
   * The snapshot is taken unconditionally so this effect depends on every field
   * in it; the write is what the switch gates. With the switch off — which is
   * where every visitor starts — this runs, reads state, and writes nothing, so
   * a first visit leaves the device exactly as it found it (ЗЕТ чл. 4а, ал. 4,
   * т. 2, and `stores.js`'s header carries the argument).
   *
   * **A pending restore holds the write off, and that is not an optimisation.**
   * Until `saved` has been applied, this object is the app's defaults — the €900
   * placeholder, the official basket — and writing them over the reader's own
   * figures loses those figures to the very state they were kept for: a fetch
   * that failed renders no calculator, so nothing can restore them and nobody
   * can retype them.
   */
  $effect(() => {
    const inputs = calc.snapshot();
    if ($rememberInputs && !saved) writeInputs(inputs);
  });

  // WHICH date is on the €/m² figure. `snapshot_date` is имот.bg's own newest
  // published snapshot, read off that city's own date list — when the SOURCE
  // published the figure. `as_of` is when OUR pipeline fetched it. They are
  // different facts, so printing whichever is available with no qualifier lets
  // our fetch date read as the source's. That is not hypothetical: a page that
  // serves no parseable list leaves the field null, which is the case for the
  // payload published today. Say which one is on screen.
  //
  // It is derived here rather than in the calculator because it picks WORDS,
  // and the calculator is deliberately language-agnostic. Two subtrees need
  // it, which is why it is not derived inside either of them.
  const cityPriceDated = $derived(
    calc.cityPricePageDate
      ? t(COPY.srcDatedByPage, $lang, { d: calc.cityPricePageDate })
      : calc.cityPriceAsOf
        ? t(COPY.srcDatedByFetch, $lang, { d: calc.cityPriceAsOf })
        : ""
  );

  // The picker's options. Derived here rather than in the calculator for the
  // same reason `cityPriceDated` is: it picks WORDS — НСИ's name for each
  // област in the reader's language, sorted with that language's collator —
  // and the calculator is deliberately language-agnostic.
  const regionChoices = $derived(regionOptions(calc.data.regionSalary, calc.data.cityPrice, $lang));

  // The reader's choice is the store's, and the calculator reads it from here.
  // The store is what persists and what the picker binds to; the calculator is
  // what every figure hangs off. Keeping the copy one-directional means there
  // is exactly one writer and no path by which the two can hold different
  // области while a card is being drawn.
  $effect(() => {
    calc.regionCode = $region;
  });
</script>

<svelte:head>
  <!-- Only the title. Svelte replaces `document.title`, so this switches with
       the language toggle and there is exactly one of it. A `<meta
       name="description">` here does NOT replace index.html's — Svelte appends
       it, leaving the page with two description tags, of which a crawler reads
       the first. The description belongs in index.html. -->
  <title>{t(COPY.title, $lang)}</title>
</svelte:head>

<SiteHeader />

<DataBanner
  dataReady={calc.dataReady}
  asOfDisplay={calc.asOfDisplay}
  headline={calc.headline}
  headlineRefPeriod={calc.headlineRefPeriod}
  headlineIsFlash={calc.headlineIsFlash}
  showStaleBanner={calc.showStaleBanner}
  dataOverdueCount={calc.dataOverdueCount}
  dataOldestAsOf={calc.dataOldestAsOf}
  dataRows={calc.dataRows}
  bind:panelOpen={calc.panelOpen}
/>

<main id="main">
  <section class="calc wrap">
    <h1>
      <span class="l-bg">{COPY.h1.bg}</span>
      <span class="l-en">{COPY.h1.en}</span>
    </h1>
    <div class="privacy mono">
      <span class="l-bg">{COPY.privacy.bg}</span>
      <span class="l-en">{COPY.privacy.en}</span>
    </div>

    <!-- Under the privacy line because it qualifies it, and out of the build's
         output because it is a control whose state is this device's. A
         prerendered switch is drawn unticked for everybody, including the
         reader who turned it on — and it would be frozen at build time on the
         one page a crawler reads. -->
    {#if !prerender}
      <RememberInputs />
    {/if}

    {#if prerender}
      <!-- Nothing. Every branch below is a statement about the reader, and the
           build has no reader — see the `prerender` prop above. -->
    {:else if !calc.dataReady}
      <div class="loading mono">
        <span class="l-bg">{COPY.loadingK.bg}</span>
        <span class="l-en">{COPY.loadingK.en}</span>
      </div>
    {:else if calc.categories.length === 0}
      <!-- Failure state. Not a debug line: it says what happened, that
           nothing the user typed was lost or transmitted, and offers the
           retry. `calc.reload` re-runs the same fetch rather than reloading
           the page, so a typed salary survives the attempt. -->
      <div class="load-fail" role="alert">
        <h2>
          <span class="l-bg">{COPY.errHead.bg}</span>
          <span class="l-en">{COPY.errHead.en}</span>
        </h2>
        <p>
          <span class="l-bg">{COPY.errBody.bg}</span>
          <span class="l-en">{COPY.errBody.en}</span>
        </p>
        <button class="retry" onclick={calc.reload} disabled={calc.reloading}>
          <span class="l-bg">{COPY.errRetry.bg}</span>
          <span class="l-en">{COPY.errRetry.en}</span>
        </button>
        <p class="mono small">
          <span class="l-bg">{t(COPY.errContact, "bg", { email: CONTACT.general })}</span>
          <span class="l-en">{t(COPY.errContact, "en", { email: CONTACT.general })}</span>
        </p>
      </div>
    {:else}
      <!-- Three grid children, not two, and the order here is the phone's
           order: ask, answer, refine. `card.css` puts the pay field and the
           rest of the inputs back into one column on a wide screen, with the
           seam between them closed, so the desktop layout is the two cards it
           has always been. -->
      <div class="m-grid">
        <div class="m-col">
          <PayField {calc} />
          <InputsCard {calc} {regionChoices} />
        </div>
        <ResultsCard {calc} {cityPriceDated} />
      </div>
    {/if}

    <!-- The national strip is OUTSIDE the branch above, and that is the whole
         of what the build serves a crawler. Every prop it takes is decided by
         a published payload with no reader input anywhere in the chain, so it
         renders the same at build time as it does in the reader's tab — and
         each card carries its own source, its reference period and a verify
         link, which is what makes a stale one visibly stale (P3, P4).

         Gated on the payloads and not on `prerender`, so the strip appears
         under exactly one condition rather than under two that can disagree —
         and moving it inside the branch above would tie a country reference to
         whether the reader's own region is being rendered. -->
    {#if calc.dataReady && calc.categories.length > 0}
      <NationalStrip
        categories={calc.categories}
        data={calc.data}
        headline={calc.headline}
        headlineIsFlash={calc.headlineIsFlash}
        ladder={calc.ladder}
        regionNet={calc.regionNet}
        nationalNet={calc.nationalNet}
        regionNameBg={calc.regionNameBg}
        regionNameEn={calc.regionNameEn}
        cityNameBg={calc.cityNameBg}
        cityNameEn={calc.cityNameEn}
        regionChosen={calc.regionChosen}
        cityCoverage={calc.cityCoverageNow}
        regionMeanGross={calc.regionMeanGrossEur}
        salaryShapeUrl={calc.salaryShapeUrl}
        salaryShapeYear={calc.salaryShapeYear}
        salaryAnchorPeriod={calc.salaryAnchorPeriod}
        cityEurPerM2={calc.cityEurPerM2}
        regionMeanGrossUrl={calc.regionMeanGrossUrl}
        regionWagePeriod={calc.regionWagePeriod}
        regionWageIsPreliminary={calc.regionWageIsPreliminary}
        cityNDistricts={calc.cityNDistricts}
        cityPriceIsLive={calc.cityPriceIsLive}
        {cityPriceDated}
        cityHistorical={calc.cityHistorical}
        citySinceBaselinePct={calc.citySinceBaselinePct}
        cityBaselineYear={calc.cityBaselineYear}
        cityBaselineMedian={calc.cityBaselineMedian}
        cityTrendPublishable={calc.cityTrendPublishable}
        estatCatUrl={calc.estatCatUrl}
      />
    {/if}
  </section>
</main>

<ExplainerBand
  anchor={calc.anchor}
  downPayPct={calc.downPayPct}
  cashEroded={calc.cashEroded}
  headlineMonth={calc.headlineRefPeriod}
  basketMonth={calc.basketRefPeriod}
/>

<SiteFooter />

<style>
  /* The header is sticky, so an unadorned #main jump parks the first heading
     underneath it. This is the offset that makes the skip link in SiteHeader
     actually land the reader on visible content. */
  #main {
    scroll-margin-top: 64px;
  }
  .loading {
    text-align: center;
    padding: 40px 0;
    color: var(--muted);
    font-size: var(--fs-body);
  }
  /* The data-failed state. Sized and styled like a card rather than a
     one-line error, because it is the whole page for as long as it is up. */
  .load-fail {
    max-width: 46ch;
    margin: 44px auto;
    padding: 20px 22px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 2px solid var(--erode);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .load-fail h2 {
    font-family: var(--serif);
    font-size: var(--fs-h2);
    line-height: 1.2;
    margin: 0;
  }
  .load-fail p {
    font-size: var(--fs-lead);
    line-height: 1.6;
    color: var(--ink-2);
    margin: 10px 0 0;
  }
  .load-fail p.small {
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .load-fail .retry {
    margin-top: 14px;
    padding: 9px 16px;
    font-family: var(--sans);
    font-size: var(--fs-lead);
    font-weight: 600;
    color: var(--surface);
    background: var(--real);
    border: 0;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .load-fail .retry:hover:not(:disabled) {
    background: var(--real-ink);
  }
  .load-fail .retry:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* Calculator */
  .calc {
    padding-top: 26px;
  }
  .calc h1 {
    font-family: var(--serif);
    font-weight: 600;
    font-size: clamp(1.5rem, 3.6vw, 2.25rem);
    letter-spacing: -0.015em;
    line-height: 1.1;
    margin: 0 0 8px;
  }
  .privacy {
    display: inline-flex;
    gap: 9px;
    align-items: center;
    font-size: var(--fs-small);
    color: var(--ink-2);
    border: 1px dashed var(--muted);
    padding: 7px 11px;
    border-radius: var(--radius);
    margin: 2px 0 18px;
  }
  .privacy::before {
    content: "";
    width: 7px;
    height: 7px;
    background: var(--real);
    border-radius: 2px;
    flex: none;
  }
</style>
