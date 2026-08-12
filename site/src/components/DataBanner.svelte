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
    /**
     * True when that rate is Eurostat's flash — their early all-items estimate
     * for the month, published ahead of the index and the divisions. The strip
     * says so, because the figure beside it moves when the full release lands
     * and nothing else on this line would tell a reader that.
     */
    headlineIsFlash = false,
    /** True when some payload is overdue against its own cadence. */
    showStaleBanner = false,
    /** How many payloads are overdue — the banner counts them, not days. */
    dataOverdueCount = 0,
    dataOldestAsOf = "",
    /** One row per payload, for the panel. See view/freshness.js#dataAge. */
    dataRows = [],
    /** Bound: the panel's open state, persisted by App alongside the drawer's. */
    panelOpen = $bindable(false),
  } = $props();

  const fmtDate = (value) => dateShort(value, $lang);

  /**
   * The plural or the singular sentence, chosen by the count.
   *
   * One late payload out of eight is the commonest shape of this banner, and
   * both languages break on it — Bulgarian needs the participle to agree in the
   * singular, English needs "is". Picked here rather than inside the string
   * because neither language builds the singular by editing the plural.
   */
  const staleCopy = $derived(dataOverdueCount === 1 ? COPY.dataStaleOne : COPY.dataStale);
</script>

<!-- As-of data banner -->
{#if dataReady}
  <div class="data-strip">
    <div class="wrap data-strip-inner mono">
      <!-- Only when there is a month to name. `dataReady` flips even when every
           fetch failed — `loadAll` returns nulls rather than throwing, and the
           calculator is replaced by its failure card — so this line was drawn
           over an empty period and read «ЧИСЛАТА СА КЪМ —»: a half-written
           sentence at the top of a page that had just told the reader, properly,
           what went wrong. `periodLong("")` returns the em dash it returns for
           anything it cannot render, which is right for a table cell and is not
           a date. The loading state omits the whole strip and this now matches
           it. -->
      {#if asOfDisplay}
        <span>
          <span class="l-bg"
            >{t(COPY.dataAsOf, "bg", { period: periodLong(asOfDisplay, "bg") })}</span
          >
          <span class="l-en"
            >{t(COPY.dataAsOf, "en", { period: periodLong(asOfDisplay, "en") })}</span
          >
        </span>
      {/if}
      {#if headline}
        <!-- Each span states its OWN language, never `$lang`. Both are in the
             DOM at once with the CSS hiding one, so `$lang` in both puts the
             reader's chosen language into the other's box — invisible to them,
             and served verbatim to whatever reads the HTML. The build writes
             this strip into `dist/index.html` (scripts/prerender.mjs), which is
             read by a crawler that sees no CSS and both spans. -->
        <!-- Both dates in this bar go through `periodLong`. The line beside
             this one already did and this one did not, so the strip carried
             «ЧИСЛАТА СА КЪМ ЮНИ 2026 Г.» and «ОФИЦИАЛНА ИНФЛАЦИЯ: 4,1% ЗА
             2026-07» — two different months in two notations, side by side.
             They differ during Eurostat's flash, which is the one thing the bar
             has to make obvious, and a reader had to convert an ISO period
             before they could even see that they were not the same month.
             `/how/` prints the same pair as «юли 2026 г.» and «юни 2026 г.». -->
        <span class="off-fig">
          <span class="l-bg"
            >{t(COPY.headlineRate, "bg", {
              rate: number(headline, 1, "bg"),
              ref_period: periodLong(headlineRefPeriod, "bg"),
              flash: headlineIsFlash ? t(COPY.srcFlash, "bg") : "",
            })}</span
          >
          <span class="l-en"
            >{t(COPY.headlineRate, "en", {
              rate: number(headline, 1, "en"),
              ref_period: periodLong(headlineRefPeriod, "en"),
              flash: headlineIsFlash ? t(COPY.srcFlash, "en") : "",
            })}</span
          >
        </span>
      {/if}
    </div>
    <!-- The panel lives inside the strip because the strip is where the doubt
         starts: a reader who wonders how current one date is wants the other
         seven, not a different page.

         Gated on there being rows, because the build renders this strip with
         the payloads but WITHOUT a freshness verdict — that one is a function
         of the clock and the build's clock is not the reader's
         (calculator.svelte.js, the seeded constructor). Without the gate, the
         served HTML would carry the panel's four column headings above an
         empty table: a disclosure that opens onto nothing. -->
    {#if dataRows.length > 0}
      <div class="wrap">
        <DataPanel rows={dataRows} bind:open={panelOpen} />
      </div>
    {/if}
  </div>
{/if}

{#if showStaleBanner}
  <div class="stale-banner">
    <div class="wrap mono">
      ⚠
      <span class="l-bg"
        >{t(staleCopy, "bg", { n: dataOverdueCount, date: fmtDate(dataOldestAsOf) })}
        {t(COPY.dataStaleHint, "bg")}</span
      >
      <span class="l-en"
        >{t(staleCopy, "en", { n: dataOverdueCount, date: fmtDate(dataOldestAsOf) })}
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
  /* The text is `--erode-ink` rather than `--erode` because it sits on the
     translucent band: `--erode` on that composite is 4.22:1 light and 4.45:1
     dark, under AA, and this is the sentence a reader gets on the day a
     payload stopped refreshing. The 1px rule below it is a border, which 1.4.11
     asks 3:1 of and `--erode` clears. */
  .stale-banner {
    background: var(--erode-soft);
    border-bottom: 1px solid var(--erode);
    padding: 7px 0;
    color: var(--erode-ink);
    font-size: var(--fs-small);
  }
  .stale-banner .wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
