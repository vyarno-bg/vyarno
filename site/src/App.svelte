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
  import { lang } from "./lib/stores.js";
  import { Calculator } from "./lib/calculator.svelte.js";
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
  import ResultsCard from "./components/ResultsCard.svelte";
  import { COPY, t } from "./lib/content.js";
  import { CONTACT } from "./lib/legal-nav.js";

  const calc = new Calculator();

  onMount(calc.load);

  // Not folded into `load()`: the term clamp has to re-run when the *reader*
  // types a term past the BNB maturity cap, not only when a payload arrives.
  // See Calculator#syncWithData.
  $effect(() => {
    calc.syncWithData();
  });

  // WHICH date is on the Sofia €/m² figure. `page_as_of_dd_mm_yyyy` is
  // имот.bg's own «обновена на» stamp — when the SOURCE published the figure.
  // `as_of` is when OUR pipeline fetched it. They are different facts, so
  // printing whichever is available with no qualifier lets our fetch date read
  // as the source's. That is not hypothetical: a scrape that cannot find the
  // page date leaves the field an empty string, which is the case for the
  // payload published today. Say which one is on screen.
  //
  // It is derived here rather than in the calculator because it picks WORDS,
  // and the calculator is deliberately language-agnostic. Two subtrees need
  // it, which is why it is not derived inside either of them.
  const sofiaPriceDated = $derived(
    calc.sofiaPricePageDate
      ? t(COPY.srcDatedByPage, $lang, { d: calc.sofiaPricePageDate })
      : calc.sofiaPriceAsOf
        ? t(COPY.srcDatedByFetch, $lang, { d: calc.sofiaPriceAsOf })
        : ""
  );
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

    {#if !calc.dataReady}
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
          <InputsCard {calc} />
        </div>
        <ResultsCard {calc} {sofiaPriceDated} />
      </div>

      <NationalStrip
        categories={calc.categories}
        data={calc.data}
        headline={calc.headline}
        ladder={calc.ladder}
        sofiaNet={calc.sofiaNet}
        salaryShapeUrl={calc.salaryShapeUrl}
        salaryShapeYear={calc.salaryShapeYear}
        salaryAnchorPeriod={calc.salaryAnchorPeriod}
        sofiaEurPerM2={calc.sofiaEurPerM2}
        sofiaMeanGrossUrl={calc.sofiaMeanGrossUrl}
        sofiaSalaryAsOf={calc.sofiaSalaryAsOf}
        sofiaNDistricts={calc.sofiaNDistricts}
        sofiaPriceIsLive={calc.sofiaPriceIsLive}
        {sofiaPriceDated}
        sofiaHistorical={calc.sofiaHistorical}
        sofiaSince2015Pct={calc.sofiaSince2015Pct}
        sofiaBaselineYear={calc.sofiaBaselineYear}
        sofiaBaselineMedian={calc.sofiaBaselineMedian}
        estatCatUrl={calc.estatCatUrl}
      />
    {/if}
  </section>
</main>

<ExplainerBand anchor={calc.anchor} downPayPct={calc.downPayPct} cashEroded={calc.cashEroded} />

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
