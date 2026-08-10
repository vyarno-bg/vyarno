<!--
  Every payload the page depends on, one row each: how fresh it is, what it
  feeds, the period it describes, the day we fetched it, and a link to the
  publisher.

  The reader-facing side of P3 ("every number is sourced, dated and clickable").
  The method drawer's source line says which datasets feed the page; this says
  what each one produced, when, and whether it is current. `verify_wiring.mjs`
  holds the same rule from the other direction — no upstream is cited that feeds
  nothing.

  A single date cannot answer "how fresh is this page" honestly, because there
  are eight of them on three different release rhythms. So the answer is the
  eight, visible.

  Rows come from `view.js#dataAge`, computed from the manifest in `payloads.js`.
  This component picks words and colours and nothing else.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { dateShort, period, periodLong, httpUrl } from "$lib/format.js";

  let {
    /** Rows from `view.js#dataAge`. One per manifest payload, in panel order. */
    rows = [],
    /** Bound: the panel's own open state, which App persists like the drawer's. */
    open = $bindable(false),
  } = $props();

  /** The status word under a row's dot. `{n}` is only used by the overdue one. */
  const statusCopy = (row) =>
    ({
      fresh: t(COPY.dataRowFresh, $lang),
      due: t(COPY.dataRowDue, $lang),
      overdue: t(COPY.dataRowOverdue, $lang, { n: row.daysOld ?? 0 }),
      absent: t(COPY.dataRowAbsent, $lang),
    })[row.status];

  /**
   * A row's period, formatted for the language.
   *
   * Two shapes reach here, both normalised in `payloads.js`: a pipeline period
   * label ("2026-06", "2026-Q1", "2026") for a statistical series, and an ISO
   * day for `city_price`, a listings average whose reference is the page on the
   * day it was read. Both formatters constrain the shape and return an em dash
   * for anything else, so nothing from a payload reaches the DOM unchecked
   * (format.js, verify_template_safety.mjs).
   */
  const periodCopy = (row) =>
    row.refPeriod === null
      ? "—"
      : row.refPeriodIsDayDate
        ? dateShort(row.refPeriod, $lang)
        : periodLong(row.refPeriod, $lang);
</script>

<details class="datapanel" bind:open>
  <summary>
    <span>
      <span class="l-bg">{COPY.dataPanelToggle.bg}</span>
      <span class="l-en">{COPY.dataPanelToggle.en}</span>
    </span>
    <span class="plus mono">+</span>
  </summary>

  <h3 class="mono">
    <span class="l-bg">{COPY.dataPanelTitle.bg}</span>
    <span class="l-en">{COPY.dataPanelTitle.en}</span>
  </h3>

  <!-- A real table: eight rows of four parallel facts is tabular data, and a
       screen reader announcing "период, юни 2026" beats a bare string. The
       horizontal scroll sits on the wrapper so the page body never scrolls
       sideways on a phone. -->
  <div class="scroll">
    <table class="mono">
      <thead>
        <tr>
          <th scope="col" class="col-name">
            <span class="l-bg">{COPY.dataPanelHeadWhat.bg}</span>
            <span class="l-en">{COPY.dataPanelHeadWhat.en}</span>
          </th>
          <th scope="col">
            <span class="l-bg">{COPY.dataPanelHeadPeriod.bg}</span>
            <span class="l-en">{COPY.dataPanelHeadPeriod.en}</span>
          </th>
          <th scope="col">
            <span class="l-bg">{COPY.dataPanelHeadFetched.bg}</span>
            <span class="l-en">{COPY.dataPanelHeadFetched.en}</span>
          </th>
          <th scope="col">
            <span class="l-bg">{COPY.dataPanelHeadSource.bg}</span>
            <span class="l-en">{COPY.dataPanelHeadSource.en}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.key)}
          <tr class:absent={row.status === "absent"}>
            <th scope="row" class="col-name">
              <span class="dot dot-{row.status}" aria-hidden="true"></span>
              <span class="rowname">
                <span class="l-bg">{row.name.bg}</span>
                <span class="l-en">{row.name.en}</span>
              </span>
              <!-- What it produces on the page, and its freshness in words.
                   The words carry the status for anyone who cannot see the
                   dot's colour. -->
              <span class="feeds">
                <span class="l-bg">{row.feeds.bg}</span>
                <span class="l-en">{row.feeds.en}</span>
                <span class="status status-{row.status}"> · {statusCopy(row)}</span>
              </span>
            </th>
            <td>
              {periodCopy(row)}
              <!-- A payload blended from two vintages names both. Dating
                   `salary_dist` by its anchor quarter alone would present a
                   four-year-old survey's dispersion as this quarter's. -->
              {#if row.refPeriodSecondary}
                <span class="second">
                  <span class="l-bg"
                    >{row.refPeriodSecondary.label.bg}
                    {period(row.refPeriodSecondary.period)}</span
                  >
                  <span class="l-en"
                    >{row.refPeriodSecondary.label.en}
                    {period(row.refPeriodSecondary.period)}</span
                  >
                </span>
              {/if}
            </td>
            <td>{row.asOf ? dateShort(row.asOf, $lang) : "—"}</td>
            <td>
              {#if httpUrl(row.sourceUrl)}
                <a href={httpUrl(row.sourceUrl)} target="_blank" rel="noopener noreferrer"
                  >{row.source ?? "—"}</a
                >
              {:else}
                {row.source ?? "—"}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note">
    <span class="l-bg">{COPY.dataPanelNote.bg}</span>
    <span class="l-en">{COPY.dataPanelNote.en}</span>
  </p>
</details>

<style>
  .datapanel {
    border-top: 1px solid var(--line-2);
    padding: 8px 0 14px;
    /* The strip this sits inside is uppercase, letter-spaced small caps. That
       is right for one line of chrome and wrong for a table of prose, so the
       panel resets both and re-applies uppercase only to the labels that want
       it (the summary, the headings, the row names). Without the reset the
       note at the bottom rendered as three lines of shouting. */
    text-transform: none;
    letter-spacing: 0;
  }
  .datapanel summary {
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: var(--fs-fine);
    letter-spacing: 0.045em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .datapanel summary::-webkit-details-marker {
    display: none;
  }
  .datapanel[open] .plus {
    transform: rotate(45deg);
  }
  .plus {
    transition: transform 0.15s ease;
  }
  h3 {
    margin: 16px 0 8px;
    font-size: var(--fs-fine);
    letter-spacing: 0.045em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 400;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-fine);
  }
  th,
  td {
    text-align: left;
    padding: 8px 14px 8px 0;
    border-bottom: 1px solid var(--line-2);
    vertical-align: top;
    white-space: nowrap;
    color: var(--muted);
  }
  thead th {
    letter-spacing: 0.045em;
    text-transform: uppercase;
    font-weight: 400;
    border-bottom-color: var(--line);
  }
  tbody th {
    font-weight: 400;
  }
  /* The name column absorbs the slack so the three date/source columns sit at
     their content width instead of leaving a gutter between them. */
  .col-name {
    white-space: normal;
    width: 100%;
    min-width: 16rem;
    padding-right: 24px;
  }
  .rowname {
    color: var(--ink);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  /* The second line of the name cell: what the payload feeds, plus its
     freshness in words. Deliberately quieter than the row name — it is the
     answer to "why is this here", read once, not scanned. */
  .feeds {
    display: block;
    line-height: 1.5;
    margin-top: 3px;
    white-space: normal;
  }
  /* Two hues carry meaning in this palette and no more: accountant's green for
     healthy, brick red for loss (tokens.css). A fresh row is green, an overdue
     or missing one is red, and "due" is an outline — not a third hue, because a
     third hue would be a third meaning the palette does not have, and a payload
     the upstream may have refreshed is not yet a problem. The dot is never the
     only signal: `statusCopy` puts the same verdict in words, which is why the
     dot is aria-hidden. */
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: 0.08em;
    background: var(--muted);
  }
  .dot-fresh {
    background: var(--real);
  }
  .dot-due {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--muted);
  }
  .dot-overdue,
  .dot-absent {
    background: var(--erode);
  }
  .status-overdue,
  .status-absent {
    color: var(--erode);
  }
  tr.absent .rowname {
    text-decoration: line-through;
  }
  /* The second vintage line under a blended payload's period. Kept on one line
     so it sets the column's width rather than folding into four; the wrapper's
     horizontal scroll is what handles a narrow screen. */
  .second {
    display: block;
    margin-top: 3px;
  }
  .note {
    margin: 14px 0 0;
    color: var(--muted);
    font-size: var(--fs-fine);
    line-height: 1.55;
    max-width: 68ch;
  }
  a {
    color: inherit;
  }
  a:hover {
    color: var(--ink);
  }
</style>
