<!--
  "What is pushing your number up" — the exact decomposition of personal
  inflation into per-group percentage points.

  The rows come from $lib/mirror.js#contributions and sum to π by construction,
  which is what lets the copy say they add up to exactly the reader's number.
  Anything derived here rather than passed in would break that promise
  silently, so nothing is.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";

  const {
    /** Rows from mirror.js#contributions, already ordered by size. */
    ranked = [],
    /** The same rows split into shown/rest at RANK_ROWS_SHOWN. */
    rankedSplit = { shown: [], restN: 0, restPp: 0 },
    /** Sum of the basket entries; the list is hidden when nothing is entered. */
    enteredTotal = 0,
    /** Monthly take-home; without it the euro column has no basis. */
    salary = 0,
    /** Personal inflation, in percent — the total these rows add up to. */
    pi = 0,
    /** Builds a category's Eurostat verify link. */
    estatCatUrl,
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /**
   * How many rows to draw, and why it is not one number.
   *
   * Eight rows is around 1,000px, which on a 390px phone is a screen and a
   * half of table between the reader's headline figure and «в джоба» — the row
   * that answers whether their raise beat their prices, and the question the
   * page is named for. Five rows carry 3.9 of the default basket's 5.4 points
   * and cut that by a third; the rest stay one tap away.
   *
   * The cap is safe to move at all only because `rankedSplit` folds whatever
   * is not drawn into a remainder that keeps Σshown + restPp === π at ANY
   * limit. Capping a list that the lead sentence promises adds up, without
   * rendering the tail, is the defect that test exists to catch.
   *
   * Measured from the list's own width rather than a `matchMedia` on 820px,
   * which would put a second copy of the layout breakpoint in a file that
   * cannot see the first. What decides whether eight rows are readable is the
   * width this list actually got, and that is the thing being measured. Before
   * the first measurement `listW` is 0 and the desktop cap applies — erring
   * towards showing more, never towards a silent truncation.
   */
  const ROWS_NARROW = 5;
  let listW = $state(0);
  let expanded = $state(false);
  const limit = $derived(
    expanded ? ranked.length : listW > 0 && listW < 480 ? ROWS_NARROW : undefined
  );
</script>

<!-- WHAT'S PUSHING YOUR NUMBER UP
     The exact decomposition of `pi`: each row's contribution in
     percentage points, and Σ of them IS the user's number. That is
     why it can be stated as "they add up to exactly your number"
     without a caveat. The € figure on each row is per-row correct
     (spend × r / (100+r) — what the same goods cost a year ago) and
     is deliberately never summed on screen: the whole-basket €
     above answers a different question. See mirror.js#contributions. -->
{#if ranked.length > 0 && enteredTotal > 0}
  <!-- The list is capped so it stays readable, and the lead sentence
       says the rows add up to exactly the user's number — so the
       remainder has to be on screen. `view.js#rankedSplit` owns that
       arithmetic (Σshown + restPp === π, asserted in
       verify_view.mjs); the template only draws it. -->
  {@const { shown, restN, restPp } = rankedSplit(ranked, limit)}
  {@const span = Math.max(...ranked.map((r) => Math.abs(r.contributionPp)), 0.1)}
  <div class="rank" bind:clientWidth={listW}>
    <div class="bars-cap mono">
      <span class="l-bg">{COPY.rankHead.bg}</span>
      <span class="l-en">{COPY.rankHead.en}</span>
    </div>
    <p class="leg">
      <span class="l-bg">{t(COPY.rankLead, "bg", { pi: fmt(pi) })}</span>
      <span class="l-en">{t(COPY.rankLead, "en", { pi: fmt(pi) })}</span>
    </p>
    {#each shown as r (r.division.cp_code)}
      <div class="rankrow" class:down={r.contributionPp < 0}>
        <div class="rankhead">
          <span class="rk">
            <span class="l-bg">{r.division.bg_name}</span>
            <span class="l-en">{r.division.en_name}</span>
            <a
              class="vlink"
              href={estatCatUrl(r.division)}
              target="_blank"
              rel="noopener"
              title={`${r.division.cp_code} · ${r.division.eurostat_label ?? ""}`}
              >{r.division.cp_code} ↗</a
            >
          </span>
          <span class="rv mono">
            {r.contributionPp >= 0 ? "+" : "−"}{fmt(Math.abs(r.contributionPp))}
            <small
              ><span class="l-bg">{COPY.rankPp.bg}</span><span class="l-en">{COPY.rankPp.en}</span
              ></small
            >
          </span>
        </div>
        <div class="track">
          <div
            class="fill"
            style="width:{Math.max(2, (100 * Math.abs(r.contributionPp)) / span)}%"
          ></div>
        </div>
        <div class="rankwhy">
          {#if salary > 0}
            <span class="l-bg"
              >{@html t(COPY.rankRow, "bg", {
                s: fmt0(r.spendEur),
                r: fmt(r.rate),
                e: fmt0(Math.abs(r.eurPerMonth)),
              })}</span
            >
            <span class="l-en"
              >{@html t(COPY.rankRow, "en", {
                s: fmt0(r.spendEur),
                r: fmt(r.rate),
                e: fmt0(Math.abs(r.eurPerMonth)),
              })}</span
            >
          {:else}
            <span class="l-bg"
              >{@html t(COPY.rankRowNoPay, "bg", {
                r: fmt(r.rate),
                w: fmt0(100 * r.share),
              })}</span
            >
            <span class="l-en"
              >{@html t(COPY.rankRowNoPay, "en", {
                r: fmt(r.rate),
                w: fmt0(100 * r.share),
              })}</span
            >
          {/if}
          {#if r.rate < 0}
            · <span class="l-bg">{COPY.rankFalling.bg}</span><span class="l-en"
              >{COPY.rankFalling.en}</span
            >
          {/if}
        </div>
      </div>
    {/each}
    {#if restN > 0}
      <div class="rankrest">
        <span class="l-bg"
          >{t(COPY.rankRest, "bg", {
            n: restN,
            pp: (restPp >= 0 ? "+" : "−") + fmt(Math.abs(restPp)),
          })}</span
        >
        <span class="l-en"
          >{t(COPY.rankRest, "en", {
            n: restN,
            pp: (restPp >= 0 ? "+" : "−") + fmt(Math.abs(restPp)),
          })}</span
        >
      </div>
    {/if}
    <!-- Rendered only where rows are actually folded, so a full list on a wide
         screen carries no control that would do nothing. It is a link rather
         than a button to look at, for the same reason the footer's donate ask
         is: this is a way to read more of a table, not the thing to do next. -->
    {#if restN > 0 || expanded}
      <button type="button" class="rank-more" onclick={() => (expanded = !expanded)}>
        {#if expanded}
          <span class="l-bg">{COPY.rankShowFewer.bg}</span>
          <span class="l-en">{COPY.rankShowFewer.en}</span>
        {:else}
          <span class="l-bg">{t(COPY.rankShowAll, "bg", { n: ranked.length })}</span>
          <span class="l-en">{t(COPY.rankShowAll, "en", { n: ranked.length })}</span>
        {/if}
      </button>
    {/if}
    {#if salary <= 0}
      <p class="leg">
        <span class="l-bg">{COPY.rankNoSalary.bg}</span>
        <span class="l-en">{COPY.rankNoSalary.en}</span>
      </p>
    {/if}
  </div>
{/if}

<style>
  /* Ranked contribution list — the exact decomposition of the user's %. */
  .rank {
    margin: 14px 0 4px;
  }
  .rankrow {
    margin: 0 0 9px;
  }
  .rankhead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: var(--fs-meta);
    margin-bottom: 3px;
  }
  .rankhead .rk {
    color: var(--ink-2);
  }
  .rankhead .rv {
    font-family: var(--mono);
    font-size: var(--fs-meta);
    color: var(--ink);
    font-weight: 500;
    white-space: nowrap;
  }
  .rankhead .rv small {
    color: var(--muted);
    font-weight: 400;
    font-size: var(--fs-micro);
    margin-left: 2px;
  }
  .rank .track {
    height: 5px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
  }
  .rank .fill {
    height: 100%;
    background: var(--erode);
    border-radius: 3px;
  }
  .rankrow.down .fill {
    background: var(--real);
  }
  .rankwhy {
    font-size: var(--fs-small);
    color: var(--muted);
    line-height: 1.5;
    margin-top: 3px;
  }
  /* The remainder row. Deliberately plain — it is bookkeeping that makes the
     column add up, not a fourteenth finding competing for attention. */
  .rankrest {
    font-size: var(--fs-small);
    color: var(--muted);
    line-height: 1.5;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--line);
  }
  .rank-more {
    display: inline;
    margin-top: 8px;
    padding: 0;
    font-family: var(--sans);
    font-size: var(--fs-small);
    line-height: 1.5;
    color: var(--real-ink);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--real);
    cursor: pointer;
  }
  .rank-more:hover {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
</style>
