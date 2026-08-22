<!--
  The line `/market/`, `/how/` and `/credit/` owe a reader when one of their
  figures is late — or when it never arrived at all.

  `DataBanner` puts this on the calculator and nowhere else, and the two pages
  built to be quoted had nothing: a payload whose workflow stops firing shows an
  old period caption and no sign that it is overdue — on the page that argues
  its numbers are checkable, and on the page a citing agent reads.

  **Two states, because a figure can be wrong in two ways and they are not the
  same news.** Late means the figure is real and old, and the last officially
  published one is still on the page. Absent means it is not on the page: a 404
  on `house_market.json` takes nine of `/market/`'s eighteen tables off it under
  headings that still promise them. `view/freshness.js#dataNotice` decides both
  and this takes the whole verdict, because taking one list is exactly what let
  every surface report the first and none report the second.

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
     * The whole verdict from `view/freshness.js#dataNotice` — `late` and `gone`
     * together, each row carrying the manifest's own `name` pair.
     *
     * **The object rather than one of its lists**, because taking `rows` is
     * what let three of the four surfaces pass `.overdue` and silently drop
     * `.missing`: a payload that never arrived warned nobody, on the pages
     * built to be quoted. A prop that cannot be handed half the verdict cannot
     * render half of it.
     *
     * Both empty is the ordinary case and draws nothing.
     */
    notice = { late: [], gone: [], count: 0, show: false },
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

  const late = $derived(notice?.late ?? []);
  const gone = $derived(notice?.gone ?? []);

  /**
   * The plural or the singular sentence, chosen by the count.
   *
   * One late payload out of five is the commonest shape of this, and both
   * languages break on it — Bulgarian needs the participle in the singular,
   * English needs "is". Picked here rather than inside the string because
   * neither language builds its singular by editing its plural.
   */
  const copy = $derived(late.length === 1 ? COPY.dataLateOne : COPY.dataLateSome);
  const named = (lang) =>
    late.map((r) => t(COPY.dataLateAge, lang, { name: r.name[lang], n: r.daysOld })).join(", ");

  /**
   * The same choice for the absent ones, and their names WITHOUT an age.
   *
   * A payload that never arrived carries no `as_of`, so `daysOld` is null and
   * `dataLateAge` would render «(преди null дни)» beside every name.
   */
  const goneCopy = $derived(gone.length === 1 ? COPY.dataGoneOne : COPY.dataGoneSome);
  // The hint refers back to the count in the sentence above it, so it is picked
  // by the same number: both languages carry a pronoun that has to agree.
  const goneHint = $derived(gone.length === 1 ? COPY.dataGoneHintOne : COPY.dataGoneHint);
  const goneNamed = (lang) => gone.map((r) => r.name[lang]).join(", ");
</script>

{#if late.length || gone.length}
  <!-- One band, not two. The states differ in what they say and not in how
       urgent they are, and a page with both would otherwise stack two identical
       warning strips above the thing the reader came for. The absent ones lead,
       because a figure that is not on the page outranks one that is old. -->
  <div class="late" class:inset>
    <div class="wrap mono">
      <span class="mark" aria-hidden="true">⚠</span>
      <span class="said">
        {#if gone.length}
          <span class="l-bg"
            >{t(goneCopy, "bg", { n: gone.length, names: goneNamed("bg") })}
            {t(goneHint, "bg")}</span
          >
          <span class="l-en"
            >{t(goneCopy, "en", { n: gone.length, names: goneNamed("en") })}
            {t(goneHint, "en")}</span
          >
        {/if}
        {#if late.length}
          <span class="l-bg"
            >{t(copy, "bg", { n: late.length, names: named("bg") })}
            {t(COPY.dataLateHint, "bg")}</span
          >
          <span class="l-en"
            >{t(copy, "en", { n: late.length, names: named("en") })}
            {t(COPY.dataLateHint, "en")}</span
          >
        {/if}
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
    gap: 9px;
    line-height: 1.5;
  }
  /* `DataBanner`'s mark, and the same two reasons: `⚠` comes from the system
     stack whatever else is loaded (no IBM Plex build carries it, `tokens.css`),
     so at the band's own 13px it is a speck; and `flex: none` keeps it from
     being the thing that shrinks when the names run long. */
  .mark {
    flex: none;
    font-size: var(--fs-strong);
    line-height: 1;
    color: var(--erode);
  }
  /* Capped for the full-bleed placement, where `.wrap` is 1120px and this
     sentence names every late payload: seven of them is four lines of
     200-character measure above a page whose own prose sets 66. The inset
     placement is already inside a 760px column and unaffected. */
  .said {
    max-width: var(--col);
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
