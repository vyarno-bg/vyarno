<!--
  The two strips between the header and the calculator: which PERIOD the figures
  describe, a disclosure opening the full per-payload panel, and — only when
  something has actually fallen behind — a warning that it is late.

  The first line dates the figures by their reference period, not by any fetch
  date: a reader quoting "inflation is 2.6%" needs to know it is June's. The
  fetch dates live in `DataPanel`, one per payload, beside the period each
  describes.

  All of it describes the published payloads rather than anything the visitor
  typed, so they take their figures as props and hold no state beyond the panel's
  open flag, which App owns.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { number, dateShort, periodLong } from "$lib/format.js";
  import DataPanel from "./DataPanel.svelte";

  // `let`, not `const`: `panelOpen` is `$bindable`, and a const destructure
  // cannot be reassigned. Same reason MethodDrawer's props are `let`.
  let {
    /** False until the payloads have loaded; the strip is absent before that. */
    dataReady = false,
    /**
     * The month the headline prices are FROM ("YYYY-MM") — the strip dates
     * itself by the figures, never by the day they were downloaded.
     */
    asOfDisplay = "",
    /** Official HICP annual rate, or null when the headline payload is absent. */
    headline = null,
    /** The month the headline rate describes, as "YYYY-MM". */
    headlineRefPeriod = "",
    /** True when some payload is overdue against its own cadence. */
    showStaleBanner = false,
    /** How many payloads are overdue — the banner counts them, not days. */
    dataOverdueCount = 0,
    dataOldestAsOf = "",
    /** One row per payload, for the panel. See view.js#dataAge. */
    dataRows = [],
    /** Bound: the panel's open state, persisted by App alongside the drawer's. */
    panelOpen = $bindable(false),
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmtDate = (value) => dateShort(value, $lang);
</script>

<!-- As-of data banner -->
{#if dataReady}
  <div class="data-strip">
    <div class="wrap data-strip-inner mono">
      <span>
        <span class="l-bg">{t(COPY.dataAsOf, "bg", { period: periodLong(asOfDisplay, "bg") })}</span
        >
        <span class="l-en">{t(COPY.dataAsOf, "en", { period: periodLong(asOfDisplay, "en") })}</span
        >
      </span>
      {#if headline}
        <span class="off-fig">
          <span class="l-bg"
            >{t(COPY.headlineRate, $lang, {
              rate: fmt(headline),
              ref_period: headlineRefPeriod,
            })}</span
          >
          <span class="l-en"
            >{t(COPY.headlineRate, $lang, {
              rate: fmt(headline),
              ref_period: headlineRefPeriod,
            })}</span
          >
        </span>
      {/if}
    </div>
    <!-- The panel lives inside the strip because the strip is where the doubt
         starts: a reader who wonders how current one date is wants the other
         seven, not a different page. -->
    <div class="wrap">
      <DataPanel rows={dataRows} bind:open={panelOpen} />
    </div>
  </div>
{/if}

{#if showStaleBanner}
  <div class="stale-banner">
    <div class="wrap mono">
      ⚠
      <span class="l-bg"
        >{t(COPY.dataStale, "bg", { n: dataOverdueCount, date: fmtDate(dataOldestAsOf) })}
        {t(COPY.dataStaleHint, "bg")}</span
      >
      <span class="l-en"
        >{t(COPY.dataStale, "en", { n: dataOverdueCount, date: fmtDate(dataOldestAsOf) })}
        {t(COPY.dataStaleHint, "en")}</span
      >
    </div>
  </div>
{/if}

<style>
  .data-strip {
    background: var(--paper-2);
    border-top: 1px solid var(--line-2);
    border-bottom: 1px solid var(--line-2);
    padding: 6px 0;
    font-size: var(--fs-fine);
    letter-spacing: 0.045em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .data-strip-inner {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  /* The verified official figure carries a single stamp-tick — an
     "on the record" mark, in the stamp accent. Deliberately the only
     stamp on the page (no chip-soup). */
  .off-fig::before {
    content: "\2713\00a0";
    color: var(--stamp);
    font-weight: 700;
  }
  .stale-banner {
    background: var(--erode-soft);
    border-bottom: 1px solid var(--erode);
    padding: 7px 0;
    color: var(--erode);
    font-size: var(--fs-small);
  }
  .stale-banner .wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
