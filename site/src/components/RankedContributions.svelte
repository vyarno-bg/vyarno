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
  {@const { shown, restN, restPp } = rankedSplit(ranked)}
  {@const span = Math.max(...ranked.map((r) => Math.abs(r.contributionPp)), 0.1)}
  <div class="rank">
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
</style>
