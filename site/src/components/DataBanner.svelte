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
    /**
     * True when the headline payload is itself one of the late ones, which
     * decides whether its figure is stamped or marked. See
     * calculator.svelte.js#headlineOverdue.
     */
    headlineOverdue = false,
    /**
     * The whole verdict from `view/freshness.js#dataNotice` — the overdue
     * payloads and the ones that never arrived, together.
     *
     * **The object rather than a flag and a count**, for the reason
     * `DataLate` gives: the pair that was here before could only describe the
     * late ones, so a payload that failed to fetch raised nothing at all. It
     * carries its own readiness gate, so this strip does not need a second one
     * — before `loadAll` resolves every payload reads as absent, which is the
     * alarm condition.
     */
    notice = { late: [], gone: [], count: 0, show: false },
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
  const late = $derived(notice?.late ?? []);
  const gone = $derived(notice?.gone ?? []);
  const staleCopy = $derived(late.length === 1 ? COPY.dataStaleOne : COPY.dataStale);
  /**
   * The same singular/plural choice for the absent ones.
   *
   * These COUNT rather than name, which is the split `DataLate` argues: the
   * panel directly below this lists every payload with its own state, so the
   * banner's job is to send a reader who never opens it there.
   */
  const goneCopy = $derived(gone.length === 1 ? COPY.dataGoneBannerOne : COPY.dataGoneBanner);
  // Picked by the same count as the sentence above it: the hint's pronoun has
  // to agree, in both languages.
  const goneHint = $derived(gone.length === 1 ? COPY.dataGoneHintOne : COPY.dataGoneHint);
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
        <span class="off-fig" class:off-late={headlineOverdue}>
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
    <!-- **Above the disclosure, because the disclosure is the answer to it.**
         Drawn after the panel, the reader met "7 of the figures are late" with
         the control that says WHICH seven already behind them, and opening it
         pushed the warning off a phone screen entirely — a thousand pixels of
         table between the alarm and the rows it is about. -->
    {#if gone.length}
      <!-- Above the late strip, because a figure that is not on the page at all
           outranks one that is merely old — and because the two can be up
           together, which is the shape a broken refresh actually has. -->
      <div class="stale-banner">
        <div class="wrap mono">
          <span class="mark" aria-hidden="true">⚠</span>
          <span class="said">
            <span class="l-bg"
              >{t(goneCopy, "bg", { n: gone.length })}
              {t(goneHint, "bg")}</span
            >
            <span class="l-en"
              >{t(goneCopy, "en", { n: gone.length })}
              {t(goneHint, "en")}</span
            >
          </span>
        </div>
      </div>
    {/if}

    {#if late.length}
      <div class="stale-banner">
        <div class="wrap mono">
          <span class="mark" aria-hidden="true">⚠</span>
          <span class="said">
            <span class="l-bg"
              >{t(staleCopy, "bg", { n: late.length, date: fmtDate(dataOldestAsOf) })}
              {t(COPY.dataStaleHint, "bg")}</span
            >
            <span class="l-en"
              >{t(staleCopy, "en", { n: late.length, date: fmtDate(dataOldestAsOf) })}
              {t(COPY.dataStaleHint, "en")}</span
            >
          </span>
        </div>
      </div>
    {/if}

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
  /* **A figure nobody has refreshed does not get the stamp.** The tick answers
     "is this the official number", and the rate here can be Eurostat's own AND
     400 days unfetched at once — so the stamp read as reassurance directly
     above a band saying the opposite. The warning below carries the words; this
     is the mark that stops the figure being taken at face value by a reader who
     never opens the panel (P4). */
  .off-fig.off-late::before {
    content: "\26A0\00a0";
    color: var(--erode);
  }
  .off-fig.off-late {
    color: var(--erode-ink);
  }
  /* The text is `--erode-ink` rather than `--erode` because it sits on the
     translucent band: `--erode` on that composite is 4.22:1 light and 4.45:1
     dark, under AA, and this is the sentence a reader gets on the day a
     payload stopped refreshing. The 1px rule is a border, which 1.4.11 asks
     3:1 of and `--erode` clears. Ruled on both edges because it now sits
     between the strip's own two rows rather than under all of them. */
  .stale-banner {
    background: var(--erode-soft);
    border-top: 1px solid var(--erode);
    border-bottom: 1px solid var(--erode);
    margin-top: 6px;
    padding: 8px 0;
    color: var(--erode-ink);
    font-size: var(--fs-small);
    /* The strip around it is uppercase, letter-spaced small caps, which is a
       register for one line of chrome and not for two sentences — the same
       reset `.datapanel` makes, and for the same reason. */
    text-transform: none;
    letter-spacing: 0;
  }
  .stale-banner .wrap {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }
  /* **The mark sits on the first line and keeps its size.** Centred across a
     flex row it landed between the two lines of the commonest wording, beside
     neither, and at the band's own 13px the glyph is a speck — it comes from
     the system stack whatever else is loaded, because `⚠` is in no IBM Plex
     build (`tokens.css`). `flex: none` so it is never the thing that shrinks. */
  .mark {
    flex: none;
    font-size: var(--fs-strong);
    line-height: 1;
    color: var(--erode);
  }
  /* Capped, because the band spans the window and the strip's own `--maxw` is a
     measure for a two-column calculator. With seven payloads late the sentence
     names all seven, and at 1120px that is one 200-character line a reader
     loses their place in. */
  .said {
    max-width: var(--col);
    line-height: 1.5;
  }
</style>
