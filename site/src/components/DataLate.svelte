<!--
  The line `/market/` and `/how/` owe a reader when one of their figures is late.

  `DataBanner` puts this on the calculator and nowhere else, and the two pages
  built to be quoted had nothing: a payload whose workflow stops firing shows an
  old period caption and no sign that it is overdue — on the page that argues
  its numbers are checkable, and on the page a citing agent reads.

  **It NAMES the late payloads, where the calculator's banner only counts
  them.** That difference is the whole reason this is a second component rather
  than the same one: on `/` the count sits above a disclosure listing every
  payload with its own date, so a reader who wants to know which is late opens
  it. Neither of these pages has a panel, and a warning that something here is
  overdue without saying what is a warning a reader can do nothing with.

  Each name carries its own age rather than the page carrying an oldest date,
  because that is the figure a reader needs per row and it dodges an agreement
  problem the aggregate does not: «Инфлация по групи, изтеглена преди 48 дни»
  needs the participle to agree with each payload's own name, and the shortest
  cadence on the site is a month — so «(преди {n} дни)» is never asked to print
  a singular, a payload being overdue only past 1.5× its cadence.

  It renders nothing at all while every payload is inside its own cadence, which
  is the ordinary state. The verdict is a function of the clock, so the caller
  computes it in the reader's own tab and never at build time — a page stamped
  fresh the day it was built goes on saying so for as long as it is served.
-->
<script>
  import { COPY, t } from "$lib/content.js";

  const {
    /**
     * The overdue rows from `view.js#dataAge`, each carrying the manifest's own
     * `name` pair and how many days old it is. Empty is the ordinary case and
     * draws nothing.
     */
    rows = [],
    /**
     * Whether the band spans the window or sits inside the page's own column.
     *
     * `/how/` puts it above `<main>`, where the calculator puts the same
     * warning, and it runs edge to edge. `/market/` cannot: measured at 360px
     * the four answer cards already end 710px down an 800px screen, and a band
     * above them takes 74px with one payload late and 113px with three — so the
     * summary a reader came for is what goes off the bottom, on exactly the day
     * the page most needs to be read. There it sits directly under the answer
     * row instead, inside the same column, which holds whatever the warning
     * grows to.
     */
    inset = false,
  } = $props();

  /**
   * The plural or the singular sentence, chosen by the count.
   *
   * One late payload out of five is the commonest shape of this, and both
   * languages break on it — Bulgarian needs the participle in the singular,
   * English needs "is". Picked here rather than inside the string because
   * neither language builds its singular by editing its plural.
   */
  const copy = $derived(rows.length === 1 ? COPY.dataLateOne : COPY.dataLateSome);
  const named = (lang) =>
    rows.map((r) => t(COPY.dataLateAge, lang, { name: r.name[lang], n: r.daysOld })).join(", ");
</script>

{#if rows.length}
  <div class="late" class:inset>
    <div class="wrap mono">
      ⚠
      <span>
        <span class="l-bg"
          >{t(copy, "bg", { n: rows.length, names: named("bg") })}
          {t(COPY.dataLateHint, "bg")}</span
        >
        <span class="l-en"
          >{t(copy, "en", { n: rows.length, names: named("en") })}
          {t(COPY.dataLateHint, "en")}</span
        >
      </span>
    </div>
  </div>
{/if}

<style>
  /* `DataBanner`'s stale strip, and deliberately drawn the same: a reader who
     has seen the calculator's warning should recognise this one rather than
     read it as a different kind of notice. The text is `--erode-ink` rather
     than `--erode` because on the translucent band `--erode` measures 4.22:1
     light and 4.45:1 dark, under AA, and this is the sentence a reader gets on
     the day a payload stopped refreshing. The rule below it is a border, which
     1.4.11 asks 3:1 of and `--erode` clears. */
  .late {
    background: var(--erode-soft);
    border-bottom: 1px solid var(--erode);
    padding: 7px 0;
    color: var(--erode-ink);
    font-size: var(--fs-small);
  }
  .late .wrap {
    display: flex;
    align-items: baseline;
    gap: 8px;
    line-height: 1.5;
  }
  /* Inside a page that has already opened its own column. `.wrap` centres to
     `--maxw`, which is wider than `/market/`'s 760px measure, so the band would
     otherwise start further left than the cards above it. */
  .late.inset {
    margin-top: 16px;
    border: 1px solid var(--erode);
    border-radius: 6px;
    padding: 8px 12px;
  }
  .late.inset .wrap {
    padding: 0;
    max-width: none;
  }
</style>
