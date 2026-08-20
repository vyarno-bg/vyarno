<script>
  /**
   * `/market/` — what is actually happening in Bulgarian property.
   *
   * The fifth route, built like `/how/`: prerendered in both languages, every
   * figure carrying its publisher, the period it describes and a link to the
   * table it came from. **No input on it, ever.** Every derived value takes
   * payloads rather than scalars (`view/market.js`), so a reader's own salary has no
   * signature to be threaded into and this page cannot drift into a calculator.
   *
   * THE PAGE TAKES NO VIEW ON THE MARKET, and that is a design constraint
   * rather than a tone. Some of these figures point one way and some the other
   * — prices rising while transactions fall, rent inflation running ahead of
   * the headline while the share of people over the housing-cost line sits near
   * its own low — and the page's job is to put them where a reader can see all
   * of them at once. It gives the figures and stops. `verify_copy.mjs` holds it
   * to that with a vocabulary rule, because "describe, do not advise" is easy
   * to agree with and easy to lose one adjective at a time.
   *
   * WHERE A NUMBER COMES FROM IS PART OF THE NUMBER. Under every digit: the
   * publisher, the period, and a link. Where the figure is ours rather than
   * read off a table, the arithmetic is stated in words and the queries that
   * reproduce it are linked — a reader who does not believe a figure should not
   * have to take our word for it, and the people most likely to doubt this page
   * are the ones it is most worth convincing.
   *
   * The words are here and the wiring is in `view/market.js`, which is the split the
   * rest of the SPA uses: a claim about which payload field feeds which figure
   * is one a test can hold, and an expression inside a `$derived` is not.
   */
  import { onMount } from "svelte";
  import { lang } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import SiteHeader from "./lib/SiteHeader.svelte";
  import DataLate from "./components/DataLate.svelte";
  import { COPY, t } from "./lib/content.js";
  import { loadAll } from "./lib/data.js";
  import { payloadsFor } from "./lib/payloads.js";
  import { dataAge } from "./lib/view/freshness.js";
  import {
    marketVolume,
    marketAverageDeal,
    marketPriceRate,
    marketStructure,
    marketDealInYearsOfPay,
    marketCities,
    marketNsiNationalRate,
    marketVolumeSeries,
    marketPriceIndexSeries,
    marketPriceRateSeries,
    marketVolumeAgainstPrices,
    marketAverageDealSeries,
    marketOverburdenSeries,
    marketPriceIndexRealSeries,
    marketIndexReading,
    marketRangeStrip,
    marketRent,
    marketBorrowedShare,
    statusLettersUsed,
  } from "./lib/view/market.js";
  import {
    number,
    integer,
    percentShare,
    percentSigned,
    periodLong,
    httpUrl,
  } from "./lib/format.js";
  import {
    plotY,
    plotX,
    columnX,
    columnW,
    tickAt,
    niceTicks,
    yearTicks,
    sparkY,
    pathOf,
  } from "./lib/plot.js";
  import { indexTimesBase } from "./lib/mirror.js";

  const { payloads = null, servedLang = null } = $props();

  if (servedLang) lang.set(servedLang);

  /**
   * The payloads, and the route they are fetched for.
   *
   * `"market"` rather than the whole manifest: the calculator's payroll table
   * and percentile ladder render nothing here, and `payloadsFor` is what stops
   * a reader of this page paying for them (`payloads.js`).
   */
  let data = $state(payloads ?? {});
  /**
   * Which of this page's payloads have fallen past their own cadence.
   *
   * **Set in `onMount` and never seeded from the prop, for the reason
   * `calculator.svelte.js`'s constructor gives.** The verdict is a function of
   * the clock, and the build's clock is not the reader's: computed at prerender
   * it would be frozen into the served HTML, so a page built the day a payload
   * was fresh goes on calling it fresh for as long as it is served — which is
   * the exact failure this line exists to report.
   */
  let late = $state([]);
  onMount(async () => {
    data = await loadAll("market");
    late = dataAge(data, payloadsFor("market")).overdue;
  });

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /**
   * A period as a `{bg, en}` pair, never picked by `$lang`.
   *
   * Both languages ship in the DOM at once and the prerender strips the half
   * the entry does not declare, so a caption assembled from the store reaches a
   * crawler in one language only — the same reason every paragraph below is a
   * pair rather than a `t(...)` call.
   */
  const when = (p) => ({ bg: periodLong(p, "bg"), en: periodLong(p, "en") });

  /**
   * The same period for a slot that is NOT a bilingual pair — a chart's
   * accessible name, which is one attribute and therefore one language.
   *
   * A series states its own window as the payload keys it — `2006-Q1`, `2011`
   * — and four of the six charts put those keys straight into their text
   * alternative while the two beside them read «Q1 2006». So one plot was
   * described to a screen reader in the notation the page uses and the next in
   * the one the pipeline uses, on the page whose smallest promise is that a
   * figure and its period are legible together. An annual series hides it:
   * `periodLong("2011")` is `"2011"`, so the same slip in the overburden
   * sentence changes nothing on screen today and changes it the day EU-SILC
   * publish a quarter.
   */
  const at = (p) => periodLong(p, $lang);

  /**
   * The period slot for a figure built from two publishers on two clocks.
   *
   * One quarter under a figure describing two is the caption error that needs
   * no wrong number to mislead, and it is the likelier state rather than the
   * exceptional one: Eurostat disseminate the transaction cubes about a week
   * behind НСИ publishing the wage table, so for the days between two releases
   * the years-of-pay figure is this quarter's deal over last quarter's pay.
   * Dated by one of them the card names half its own arithmetic, and the half
   * it names is the one a reader is least likely to go and check.
   *
   * Each period is spelled with the publisher it belongs to rather than left in
   * source order beside «Евростат и НСИ». Positional pairing is a convention a
   * reader has to already know, and the source line is the one thing on this
   * page that may not be guessable.
   */
  const whenPair = (a, sa, b, sb) =>
    a === b
      ? when(a)
      : {
          bg: `${sa.bg} ${periodLong(a, "bg")}, ${sb.bg} ${periodLong(b, "bg")}`,
          en: `${sa.en} ${periodLong(a, "en")}, ${sb.en} ${periodLong(b, "en")}`,
        };

  /**
   * A signed percentage, from the one implementation the whole site shares.
   *
   * Written out here it was six characters shorter than the import and wrong in
   * three ways at once, all of them invisible on a payload whose figures happen
   * to be comfortably positive: a magnitude that rounds to zero took a sign, so
   * a +0.04% quarter printed «+0,0%» — a direction the digits beside it do not
   * support — with «−0,0%» able to sit under it asking a reader to read a
   * difference out of two identical numbers; a fall took `toLocaleString`'s
   * hyphen rather than the U+2212 every other figure on the site is drawn with;
   * and a city НСИ has not published yet printed an empty cell rather than a
   * visibly missing one. `format.js#percentSigned` is where those three rules
   * live, and it exists because six templates each got a different one wrong.
   */
  const pct = (x) => percentSigned(x, 1, $lang);
  /**
   * The same, with no decimal, for an axis tick.
   *
   * A tick sits on a step this file chose to be round — 20, 5, 2.5 — and «+80,0%»
   * spends four characters saying the axis is exact about a number it invented
   * for its own convenience. It is also the widest label in the gutter, on a
   * page whose plots have 280px to divide at 360px. A FIGURE keeps its decimal:
   * a published rate rounded to the whole percent on screen is a different
   * number from the one the query returns.
   */
  const pctAxis = (x) => percentSigned(x, 0, $lang);
  /**
   * A SHARE, which takes no plus and still needs a real minus.
   *
   * `pct` would write «+55,7%» over the part of the money that was borrowed and
   * invent a movement; `number` would write the one year households repaid more
   * than they took out with `toLocaleString`'s hyphen, which reads as a dash.
   * `format.js#percentShare` is the pair's third rule and the only place it is
   * written.
   */
  const share = (x) => percentShare(x, 1, $lang);
  /** The same on an axis, whose steps this file chose to be round. */
  const shareAxis = (x) => percentShare(x, 0, $lang);

  const volume = $derived(marketVolume(data.houseMarket));
  const deal = $derived(marketAverageDeal(data.houseMarket));
  const priceRate = $derived(marketPriceRate(data.houseMarket));
  const structure = $derived(marketStructure(data.houseMarketStructure));
  const yearsOfPay = $derived(marketDealInYearsOfPay(data.houseMarket, data.sectorSalary));
  const cities = $derived(marketCities(data.nsiHousing));
  const nsiNational = $derived(marketNsiNationalRate(data.nsiHousing));
  const volumeSeries = $derived(marketVolumeSeries(data.houseMarket));
  /**
   * The count's movement and the price movement, on one row of quarters.
   *
   * The window is decided in `view/market.js`, not here: two panels drawn one
   * above the other claim their columns describe the same quarters, and the two
   * published records are of different lengths.
   */
  const pair = $derived(marketVolumeAgainstPrices(data.houseMarket));
  /**
   * Which quarter of the year the newest count belongs to.
   *
   * The sawtooth on the count chart is the loudest thing on this page and it is
   * the calendar: winter and summer are not traded alike, so a reader who takes
   * the shape for the market has learned the opposite of what the picture
   * shows. Marking the quarters that share the newest one's place in the year
   * makes the repetition visible AND marks the columns the year-on-year figure
   * beside it actually compares.
   *
   * Read off the data rather than written down as Q1. Which quarter is newest
   * moves four times a year, and a marked quarter that is not the one the
   * figures are about would be a second thing to decode rather than a key.
   */
  const sameQuarter = $derived(String(volumeSeries.to ?? "").slice(-2));
  const isSameQuarter = (period) => Boolean(sameQuarter) && String(period).endsWith(sameQuarter);

  /**
   * The plot box this page draws in. The mapping into it is `$lib/plot.js`,
   * which carries the constraints that hold whatever the box: why a scale is
   * never cropped, and why no axis text may be drawn inside the SVG.
   *
   * The numbers are here because they are this page's editorial decision and
   * nothing else's. 600 by 240 is a shape rather than a size — the SVG is
   * `width: 100%` and scales — so what these fix is the aspect a reader sees
   * every plot in, and a page that drew each chart to its own would be saying
   * something about them by their proportions.
   */
  /**
   * `CH_TALL` is the one plot on the page drawn bigger than the others, and
   * which one it is is an editorial decision the page is entitled to make.
   *
   * Six identically-sized plots say every figure here weighs the same, which is
   * a claim as much as any other arrangement would be — and it is not the one
   * this page would make if asked. The nominal line against the deflated one is
   * the reading nobody else in Bulgaria publishes with a source attached: the
   * same series, twice, answering "more money" and "dearer than everything
   * else" — and the second is the correction this whole site exists to apply,
   * withheld from property prices until it was drawn.
   *
   * **Size is not a verdict and may not become one.** A taller box says look
   * here; it says nothing about which direction the line should be read as good
   * news, and it is given to the plot that carries two lines rather than to
   * whichever one is currently falling. Nothing else about the chart differs —
   * same accent, same zero, same axis in multiples.
   */
  const CH_W = 600,
    CH_H = 240,
    CH_TALL = 320;
  /**
   * This page's box, bound to the geometry in `$lib/plot.js`.
   *
   * Each of these is a binding and not a calculation — the arithmetic is one
   * layer down, where `verify_plot.mjs` can reach it, and what is left here is
   * the one fact the module deliberately does not hold: how big this page draws
   * its plots. A caller writing `plotX(i, n, 600)` at a mark site would be
   * spelling the box out a seventh time.
   *
   * `yOf` keeps its height parameter, because one plot on the page is drawn
   * taller and every mark inside it has to be placed in ITS box.
   */
  const yOf = (value, s, h = CH_H) => plotY(value, s, h);
  const lineX = (i, n) => plotX(i, n, CH_W);
  const colX = (i, n) => columnX(i, n, CH_W);
  const colW = (n) => columnW(n, CH_W);
  const xTicks = (series) => yearTicks(series, CH_W);

  /** The sparkline box, and its own mapping. Small, and drawn 1:1 like the rest. */
  const SP_W = 108,
    SP_H = 26;
  const spY = (value, scale) => sparkY(value, scale, SP_H);

  const path = (s, h = CH_H, grid = undefined) => pathOf(s, CH_W, h, grid);

  /**
   * Every series the page draws, and the ones it draws a table of.
   *
   * **A page that renders only the newest reading of each throws the history
   * away**, and every one of these payloads carries decades of it. A single
   * reading of a figure that has swung by fifteen points twice tells a reader
   * almost nothing about it, and the swing is what they came to see.
   *
   * The four series are on four different windows and no two start in the same
   * year. Nothing here states a span in words: each carries its own `from` and
   * `to`, the source lines print them, and a count written into a comment is
   * one the next backfilled quarter makes wrong with nothing to catch it.
   */
  const indexSeries = $derived(marketPriceIndexSeries(data.houseMarket));
  const indexRealSeries = $derived(marketPriceIndexRealSeries(data.houseMarket));
  /**
   * Both index lines on ONE scale, which they are already on.
   *
   * Eurostat publish the deflated series on the same 2015 base as the nominal
   * one and the gate holds them to it, so nothing is rescaled here — the shared
   * maximum is the only thing the drawing needs, and the two lines mean the
   * same 100.
   */
  const indexScale = $derived({
    min: 0,
    max: Math.max(indexSeries.max, indexRealSeries.max),
    reference: 100,
  });
  /**
   * The index in words: how many times the base year, and where the deflated
   * line sits against its own highest reading.
   *
   * The chart, the axis and every sentence about the index are drawn from this
   * one object rather than from the raw level, so the page cannot print «272,63»
   * in one place and «×2,7» in another and leave a reader to work out that they
   * are the same figure.
   */
  const reading = $derived(marketIndexReading(data.houseMarket));
  /**
   * An index level as the multiple of its base the reader is shown.
   *
   * `decimals` exists for the base itself, which is exactly ×1 and reads as a
   * measurement rather than as a definition when it is printed «×1,0» — and
   * the caption beside the plot says «×1 = колкото през {year} г.», so the
   * axis has to agree with it.
   */
  const times = (value, decimals = 1) =>
    `×${number(indexTimesBase(value, indexScale.reference), decimals, $lang)}`;
  const flagKey = $derived(statusLettersUsed([indexSeries.flags, indexRealSeries.flags]));
  const rateSeries = $derived(marketPriceRateSeries(data.houseMarket));
  const dealNewSeries = $derived(marketAverageDealSeries(data.houseMarket, "new"));
  const dealExistingSeries = $derived(marketAverageDealSeries(data.houseMarket, "existing"));
  const overburdenSeries = $derived(marketOverburdenSeries(data.houseMarketStructure));

  /**
   * Both average-deal lines on ONE scale, so the gap between them is the gap.
   *
   * Drawn against their own maxima the two lines would sit on top of each other
   * and a new build would look the same price as an existing dwelling — which
   * is the single thing this pair exists to show is not so.
   */
  const dealScale = $derived({
    min: 0,
    max: Math.max(dealNewSeries.max, dealExistingSeries.max),
  });

  /** A series' own window, as the `{bg, en}` period a source line prints. */
  const spanned = (series) => ({
    bg: `${periodLong(series.from, "bg")} – ${periodLong(series.to, "bg")}`,
    en: `${periodLong(series.from, "en")} – ${periodLong(series.to, "en")}`,
  });

  /** A disclosure label with its own row count in it, never a written figure. */
  const countLabel = (key, n) => ({
    bg: t(key, "bg", { n: fmt0(n) }),
    en: t(key, "en", { n: fmt0(n) }),
  });

  /** The rent line the calculator already publishes, read here rather than refetched. */
  const rent = $derived(marketRent(data.hicpCategories));
  /**
   * How much of what households paid for homes was borrowed, counted two ways.
   *
   * Four payloads meet in this one call and the joining is `view/market.js`'s,
   * not a `$derived`'s: three of them are in millions of euro and the fourth in
   * euro, one leg of the lending is in leva, and each of those is a wrong number
   * rather than a wrong picture. `payroll` is here for `bgn_per_eur` alone.
   */
  const borrowed = $derived(
    marketBorrowedShare(data.houseMarket, data.credit, data.mortgage, data.payroll)
  );
  /**
   * The scale the six city rows are drawn against, rounded out to round numbers.
   *
   * One scale across the six is what makes the rows comparable at all, and the
   * rounding is what lets the column head label the ends: an axis running to
   * «−30,5%» is the deepest fall a city happens to have this quarter, and it
   * reads as a figure about that city rather than as the edge of the picture.
   */
  const cityNowAxis = $derived(niceTicks(cities.changeScale.min, cities.changeScale.max, 3));

  /**
   * Where the newest reading of each series sits inside that series' own range.
   *
   * The arithmetic is `mirror.js#rangePosition` and the wiring is
   * `view/market.js#marketRangeStrip`; what is here is the box it is drawn in, the
   * same split every plot on this page follows.
   */
  const rangeStrip = $derived(marketRangeStrip(data.houseMarket, data.houseMarketStructure));
  const RG_W = 100,
    RG_H = 14;
  /**
   * Where a position lands on the track, in the track's own coordinates.
   *
   * Inset by the marker's own radius at each end, because a reading AT its
   * series' record is drawn at 0 or at 1 — and a dot centred on the end of the
   * line has half of itself outside the box. `overflow: visible` would paint it
   * and it would still be the only mark on the strip whose centre is not on the
   * track it belongs to.
   */
  const RG_R = 3.5;
  const rangeX = (at) => RG_R + at * (RG_W - 2 * RG_R);

  /**
   * The city column's own box, and it is drawn in a different unit from the
   * strip's on purpose.
   *
   * The range strip places ONE reading inside a record and needs room for a
   * marker centred on the end of a line; this draws TWO bars from a shared zero
   * and needs no inset at all — a bar at the extreme of the scale is meant to
   * reach the edge, which is what a length read from a baseline means.
   */
  const NOW_W = 100,
    NOW_H = 18;

  /** A strip row's figure, written the way the section it links to writes it. */
  const rangeValue = (row, value) => {
    if (!Number.isFinite(value)) return "—";
    if (row.format === "count") return fmt0(value);
    if (row.format === "times") return `×${fmt(value)}`;
    if (row.format === "signedPct") return pct(value);
    if (row.format === "pct") return `${fmt(value)}%`;
    return fmt(value);
  };

  /** A strip row's label. Words, so they live in the component's copy file. */
  const RANGE_LABEL = {
    dealsChange: COPY.mktRangeDealsChange,
    index: COPY.mktRangeIndex,
    indexReal: COPY.mktRangeIndexReal,
    rate: COPY.mktRangeRate,
    overburden: COPY.mktRangeOverburden,
  };

  /**
   * The rows of a numbers table: one period, one value per column.
   *
   * **Matched on the PERIOD, never on position.** Two series drawn together need
   * not be of one length: §borrowed's second line starts five years into the
   * first, and read by index its earliest reading would be filed against the
   * first line's earliest year — every digit published and every row wrong.
   */
  const rowsOf = (series, extra = []) => {
    const byPeriod = extra.map((e) => new Map(e.points.map((p) => [p.period, p.value])));
    return series.points.map((p) => ({
      period: p.period,
      values: [p.value, ...byPeriod.map((m) => m.get(p.period) ?? null)],
      flag: series.flags?.[p.period] ?? null,
    }));
  };

  /** Eurostat's own key, for the letters this page's series actually carry. */
  const FLAG_COPY = {
    b: COPY.mktFlagB,
    e: COPY.mktFlagE,
    p: COPY.mktFlagP,
    d: COPY.mktFlagD,
  };
</script>

<svelte:head>
  <title>{t(COPY.marketTitle, $lang)}</title>
</svelte:head>

<SiteHeader page="/market/" tagline={COPY.taglineMarket} />

<!--
  One figure, with everything that has to travel under it.

  `label`, `source` and `period` arrive as `{bg, en}` pairs and both languages
  render into the DOM, hidden by the rule in `tokens.css` — the served HTML is
  what a crawler and a citing agent read, so a caption picked by `$lang` would
  reach them in one language.

  `period` is what the figure DESCRIBES, never the day it was fetched. On a
  page that may be served for longer than its data is current, that is also the
  mitigation: a figure that has fallen behind is visibly behind rather than
  silently wrong.
-->
{#snippet figure(value, label, source, href, period, apiHref = null)}
  <div class="stat">
    <div class="sv mono">{value}</div>
    <div class="sl">
      <span class="l-bg">{label.bg}</span>
      <span class="l-en">{label.en}</span>
    </div>
    <div class="ss">
      {@render srcLine(source, href, period, apiHref)}
    </div>
  </div>
{/snippet}

<!--
  The publisher, the period and the two links, under a figure or under a table.

  THE SECOND LINK IS NOT A CONVENIENCE. Eurostat's table view opens a dataset
  with every unit it carries at once, and `prc_hpi_hsnq` carries a count, two
  indices and three rates — so a reader following «16 227 · Евростат» arrives
  at a table reading −19.8 for the same country and the same quarter, which is
  the quarter-on-quarter rate of change. One click from the page's argument to
  a figure that appears to contradict it, on the page whose entire claim is
  that a sceptic can check it.

  Fixing that by deep-linking the unit would mean pinning a URL shape nobody
  documents and this container cannot reach a browser to verify against. So
  both links are here and each says what it is: the publisher's own table to
  browse, and the query that returns this number and nothing else.
-->
{#snippet srcLine(source, href, period, apiHref = null)}
  <a href={httpUrl(href)} target="_blank" rel="noopener">
    <span class="l-bg">{t(COPY.howSrc, "bg", { s: source.bg, p: period.bg })}</span>
    <span class="l-en">{t(COPY.howSrc, "en", { s: source.en, p: period.en })}</span>
  </a>
  {#if apiHref}
    <a class="q-link" href={httpUrl(apiHref)} target="_blank" rel="noopener">
      <span class="l-bg">{COPY.mktSrcQuery.bg} ↗</span>
      <span class="l-en">{COPY.mktSrcQuery.en} ↗</span>
    </a>
  {/if}
{/snippet}

<!--
  How a figure of ours was worked out, and the queries that reproduce it.

  Two obligations meet here and one block discharges both. Eurostat's terms
  permit derivation on condition it is stated clearly to the end user, with
  their non-responsibility clause; and a reader who thinks a number is invented
  needs to be able to get it back themselves. The link is the answer to both,
  so it is the raw query rather than a page about the dataset — open it and the
  digits are there.

  `explain` is a bilingual pair written here rather than read from the payload.
  The payload's own `method` string is English and machine-facing; words a
  reader sees belong to the component that renders them (`site/AGENTS.md`).
-->
{#snippet ourSum(explain, urls)}
  <!-- **The number is a list marker, so a list of one does not get one.** Half
       these derivations divide one published series by another and need both
       queries — «провери 1» and «провери 2» are different cubes, and a division
       is not reproducible from one of them. The other half are computed from a
       single series, and there the «1» announces a second link that does not
       exist: a reader looks for it, and what they find nearby is the same URL
       again under the card's own «точно това число ↗».

       The link itself stays either way, duplicate or not. Eurostat permit
       derivation on condition it is stated to the end user, and the disclosure
       has to carry its own way to re-run the sum — a query one paragraph up
       discharges the licence but not the sceptic, which is the split
       `verify_render_market.mjs` §"every figure of ours says so" holds. -->
  {@const queries = urls ?? []}
  <p class="ours">
    <span class="l-bg"
      >{explain.bg}
      {#each queries as url, i (url)}
        <a href={httpUrl(url)} target="_blank" rel="noopener"
          >провери{queries.length > 1 ? ` ${i + 1}` : ""}</a
        >&nbsp;
      {/each}
      <a href="/legal/#sources">{COPY.oursMoreK.bg} →</a></span
    >
    <span class="l-en"
      >{explain.en}
      {#each queries as url, i (url)}
        <a href={httpUrl(url)} target="_blank" rel="noopener"
          >check{queries.length > 1 ? ` ${i + 1}` : ""}</a
        >&nbsp;
      {/each}
      <a href="/legal/#sources">{COPY.oursMoreK.en} →</a></span
    >
  </p>
{/snippet}

<!--
  Method, one interaction away — and the line that decides what may go in here.

  A CAVEAT changes how the figure above it should be read: an asking price that
  is not a paid price, a mean that is not a middle, a smaller rise that is not a
  fall. A reader who never sees one draws a wrong conclusion from a number on
  their screen, so it stays beside that number whatever it costs in length.
  METHOD is how the figure was produced — which cube divided by which, why the
  quarter rather than the month. Skipping it costs a reader no conclusion.

  **Never between a table or a chart and its source line.**
  `verify_render_market.mjs` finds a table's citation by walking to the element
  beside it, so a disclosure dropped in between leaves that table reading as
  uncited — every digit still sourced, and the check that says so gone.
-->
{#snippet howMade(explain, label = COPY.mktHowMade)}
  <details class="method">
    <summary>
      <span class="l-bg">{label.bg}</span>
      <span class="l-en">{label.en}</span>
    </summary>
    <p class="cap">
      <span class="l-bg">{explain.bg}</span>
      <span class="l-en">{explain.en}</span>
    </p>
  </details>
{/snippet}

<!--
  A plot, and the two things that make it readable rather than decorative.

  EVERY MARK CARRIES A `<title>`. It is the browser's own tooltip, it costs one
  element per point, it needs no script and no CSP exception, and it is the
  answer to "what is that bar" for anyone with a pointer. It is NOT the whole
  answer: a `<title>` is unreachable by touch and by keyboard, which is why
  every chart on this page is also published as a table.

  THE TABLE IS THE CHART. `numbersTable` below renders the same series as rows,
  inside a `<details>` a reader opens — the WCAG text alternative, the way to
  read an exact figure off a 85-quarter plot, and the thing that makes the page
  quotable. A `<details>` is a disclosure, not an input: it takes nothing from
  the reader and there is nothing in it a figure of theirs could be threaded
  into, so the rule that this page has no input control is untouched.

  The scale comes from `plotSeries`, which clamps its own minimum at or below
  zero. Nothing here can crop an axis because nothing here is handed a floor.
-->
{#snippet columns(series, label, scale = null, marked = null)}
  {@const s = scale ?? series}
  {@const n = series.points.length}
  {#each series.points as p, i (p.period)}
    <rect
      class="plot-bar {marked?.(p.period) ? 'season' : ''}"
      x={colX(i, n)}
      y={Math.min(yOf(p.value, s), yOf(0, s))}
      width={colW(n)}
      height={Math.max(0.8, Math.abs(yOf(p.value, s) - yOf(0, s)))}
    >
      <title>{p.period}: {label(p.value)}</title>
    </rect>
  {/each}
{/snippet}

<!--
  The y axis, as HTML beside the plot rather than as text inside it.

  Each tick carries its own height as a percentage, which the grid cell it sits
  in can honour because the browser stretches that cell to exactly the height
  the SVG next to it resolved to. So the label lands on its own gridline at
  every viewport, and it is set in the page's type rather than in the plot's
  coordinate system — which is what stops it shrinking to 6px on a phone.

  `aria-hidden`, because the SVG is `role="img"` with a text alternative that
  already names the extremes and the latest reading. Read out as well, these
  become a run of loose digits after the description of the same chart.
-->
{#snippet yAxis(ticks)}
  <div class="yaxis" aria-hidden="true">
    {#each ticks as tick (tick.label)}
      <span class="plot-tick" style="top:{tick.at.toFixed(2)}%">{tick.label}</span>
    {/each}
  </div>
{/snippet}

<!--
  The gridlines a y label needs in order to be a scale rather than a caption.

  Drawn for every tick EXCEPT the two that already have a rule of their own:
  zero, which the axis line marks, and the base the payload declares, which is
  dashed. Two rules on one height paint a heavier line at exactly the place the
  page means something quieter.

  Before the data in document order, so a column sits on top of its gridline.
-->
{#snippet gridlines(axis, reference = null, h = CH_H)}
  {#each axis.values as value (value)}
    {#if value !== 0 && value !== reference}
      <line class="plot-grid" x1="0" y1={yOf(value, axis, h)} x2={CH_W} y2={yOf(value, axis, h)} />
    {/if}
  {/each}
{/snippet}

<!--
  The time axis: a year at the position of its own first point.

  **Two end labels are a caption, not an axis.** «Q1 2005» at one end and
  «Q1 2026» at the other tell a reader what a plot spans and nothing about where
  they are inside it, so the rise in the middle of a twenty-one-year index had no
  date on it at all — and on the two panels drawn together the whole point is
  that a column can be carried down onto the line below, which no reader can do
  against an unmarked box.

  The labels are HTML positioned as percentages of the plot, the device the y
  axis uses and for the same measured reason: text inside the box renders at
  6.2px on a 360px screen, and this is the page's own 11px at every width. The
  same years are drawn as rules inside both panels, which is what makes an
  alignment visible rather than merely true.

  The exact window stays under every chart in the source line, in quarters, which
  is where a reader who needs the precise ends already looks.
-->
{#snippet xYears(ticks)}
  <div class="xyears" aria-hidden="true">
    {#each ticks as tick (tick.year)}
      <!-- Centred on its own rule, except near the ends, where half a label
           would hang off the plot — and off the PAGE, since the plot runs to the
           measure. A label overhanging the right edge scrolls the whole document
           sideways at 360px, taking the sticky header and every paragraph with
           it, which `verify_render_market.mjs` fails the page for.

           Decided by WHERE the tick lands rather than by which one it is: with
           the step counted back from the newest year the first tick is usually
           not at the left edge, and anchoring it there by its index would put
           its text beside a rule it is supposed to sit on. -->
      <span
        class="plot-tick"
        style="left:{tick.at.toFixed(2)}%; transform: translateX({tick.at <= 3
          ? '0'
          : tick.at >= 90
            ? '-100%'
            : '-50%'})">{tick.year}</span
      >
    {/each}
  </div>
{/snippet}

<!-- The same years as rules inside the box. Quiet, and behind the data: a
     gridline is furniture, and this page's only emphatic rules are zero and the
     base a payload declares. The first tick is skipped where it sits on the
     left edge, which the plot's own border already marks. -->
{#snippet yearRules(ticks, h = CH_H)}
  {#each ticks as tick (tick.year)}
    {#if tick.at > 0.5}
      <line
        class="plot-year"
        x1={(tick.at / 100) * CH_W}
        y1="0"
        x2={(tick.at / 100) * CH_W}
        y2={h}
      />
    {/if}
  {/each}
{/snippet}

{#snippet dots(series, label, h = CH_H)}
  {@const n = series.points.length}
  {#each series.points as p, i (p.period)}
    <!-- An invisible target over each point of a line. A line has no mark to
         put a `<title>` on, and a reader hunting for one quarter out of decades
         needs a box wide enough to hit rather than a stroke one pixel wide.

         The height is the box's, so a target covers its own column of the plot
         it is drawn in — handed the default in the tall chart it would leave
         the bottom quarter of the picture with nothing to point at. -->
    <rect class="plot-hit" x={lineX(i, n) - CH_W / n / 2} y="0" width={CH_W / n} height={h}>
      <title>{p.period}: {label(p.value)}</title>
    </rect>
  {/each}
{/snippet}

<!--
  The newest reading, marked.

  Every figure on this page is the last point of some series, and on a plot 85
  quarters wide that point is a seven-pixel stub at the right edge with nothing
  to say it is the one the prose above just quoted. The mark takes the ground as
  its stroke so it reads as a point rather than as the line getting thicker —
  `chart.css#.plot-last` carries the rest.
-->
{#snippet lastPoint(series, axis, h = CH_H, second = false)}
  {@const p = series.points[series.points.length - 1]}
  {#if p}
    <circle
      class="plot-last {second ? 'second' : ''}"
      cx={CH_W}
      cy={yOf(p.value, axis, h)}
      aria-hidden="true"
    />
  {/if}
{/snippet}

<!--
  The series names, in a gutter to the right of the plot at the height each
  line ends on.

  **A key under a plot is a lookup and a label on the line is not.** Holding a
  swatch in mind, carrying it up into the picture and finding the matching stroke
  is work a reader does once per series per glance, and on the index chart — two
  lines that cross twice — it is the whole reading. Written where the line ends,
  there is nothing to carry.

  Positioned exactly as the y ticks are, because it is the same problem: a
  percentage `top` against a cell the grid has stretched to the plot's height.
  `chart.css` closes the column below 760px, where the key under the figure does
  the naming instead, so both are kept rather than one replacing the other.
-->
{#snippet sLabels(items)}
  <div class="slabels" aria-hidden="true">
    <!-- Keyed by position, not by text: two series can read the same multiple
         in the same quarter, and a duplicate key is a runtime failure on a
         chart that was drawing correctly the day before the figures converged. -->
    {#each items as item, i (i)}
      <span class="slabel" style="top:{item.at.toFixed(2)}%">{item.label}</span>
    {/each}
  </div>
{/snippet}

<!--
  A city's own history, drawn small enough to sit in a table cell.

  Six of them share one scale (`cities.priceScale`) because six sparklines each
  drawn to its own range are six pictures of the same shape — and comparing rows
  is the only reason to put a chart in a column. The zero rule is drawn, because
  on a series of year-on-year changes the sign is the whole reading.
-->
{#snippet spark(series, scale, label)}
  {#if series.points.length > 2}
    <svg class="spark" viewBox="0 0 {SP_W} {SP_H}" role="img" aria-label={label}>
      <line class="plot-base" x1="0" y1={spY(0, scale)} x2={SP_W} y2={spY(0, scale)} />
      <path
        class="plot-line"
        d={series.points
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${((SP_W * i) / (series.points.length - 1)).toFixed(2)} ${spY(p.value, scale).toFixed(2)}`
          )
          .join(" ")}
      />
    </svg>
  {/if}
{/snippet}

<!--
  One city's quarter, as two bars from a common zero.

  **Length from a shared baseline is the comparison a reader makes without being
  taught it**, which is why this is two bars rather than two dots on a line: a
  dot pair says where two figures are and leaves the reader to measure the gap
  between them by eye, and the gap is a quantity nobody published. Each bar here
  is one published cell drawn from zero, and the six rows are drawn on ONE scale
  (`cities.changeScale`, rounded out to `niceTicks`), so the only comparison the
  picture invites — this city against the next one — is the one it supports.

  The two tones are the page's two series tones, the pair every chart key already
  uses, and the column head names them. Zero is a rule through the full height
  rather than a mark on a line, because on a column of signed changes the side of
  it a bar falls on is the whole reading; the ticks either side of it are drawn
  at the same values the head labels, so the bars sit against a scale rather than
  against nothing.
-->
{#snippet cityNow(city, axis)}
  {@const span = axis.max - axis.min || 1}
  {@const xOf = (v) => ((v - axis.min) / span) * NOW_W}
  {@const bar = (v) => ({
    x: Math.min(xOf(0), xOf(v)),
    // A change that rounds to nothing still gets a mark, for the reason the
    // column charts floor their own height: a bar of zero width is a row that
    // looks like missing data rather than like a city that did not move.
    width: Math.max(0.8, Math.abs(xOf(v) - xOf(0))),
  })}
  {@const price = bar(city.pricePct)}
  {@const deals = bar(city.dealsPct)}
  <svg
    class="now"
    viewBox="0 0 {NOW_W} {NOW_H}"
    preserveAspectRatio="none"
    role="img"
    aria-label={t(COPY.mktChartCityNow, $lang, {
      city: $lang === "bg" ? city.nameBg : city.nameEn,
      price: pct(city.pricePct),
      deals: pct(city.dealsPct),
      at: at(city.pricePeriod),
    })}
  >
    {#each axis.values as value (value)}
      {#if value !== 0}
        <line class="now-grid" x1={xOf(value)} y1="0" x2={xOf(value)} y2={NOW_H} />
      {/if}
    {/each}
    <rect class="now-price" x={price.x} y="1" width={price.width} height={NOW_H / 2 - 2} />
    <rect
      class="now-deals"
      x={deals.x}
      y={NOW_H / 2 + 1}
      width={deals.width}
      height={NOW_H / 2 - 2}
    />
    <line class="now-zero" x1={xOf(0)} y1="0" x2={xOf(0)} y2={NOW_H} />
  </svg>
{/snippet}

<!--
  The same series as a table a reader can read a figure off.

  Closed by default, because it is the long form and the plot above it is the
  short one — and open on a `#`-linked visit is not something a `<details>` can
  do without script. `cols` are `{bg, en}` pairs; `rows` come from `rowsOf`.

  `note` is for what a reader needs IN ORDER TO READ THIS TABLE and nowhere
  else — the notation its cells are in, the publisher's key to the flag column.
  Set beside the disclosure it belongs to two quiet paragraphs on every reader's
  screen to serve the ones who opened it; inside, it is on screen exactly when
  the column it explains is.
-->
{#snippet numbersTable(open, caption, cols, rows, format, flagged = false, note = null)}
  <details class="numbers">
    <summary>
      <span class="l-bg">{open.bg}</span>
      <span class="l-en">{open.en}</span>
    </summary>
    <div class="scroll" role="region" tabindex="0" aria-label={t(caption, $lang)}>
      <table class="fig-table">
        <thead>
          <tr>
            <th scope="col">
              <span class="l-bg">{COPY.mktColPeriod.bg}</span>
              <span class="l-en">{COPY.mktColPeriod.en}</span>
            </th>
            {#each cols as c (c.bg)}
              <th scope="col" class="num">
                <span class="l-bg">{c.bg}</span>
                <span class="l-en">{c.en}</span>
              </th>
            {/each}
            {#if flagged}
              <th scope="col">
                <span class="l-bg">{COPY.mktColFlag.bg}</span>
                <span class="l-en">{COPY.mktColFlag.en}</span>
              </th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.period)}
            <tr>
              <th scope="row" class="mono">{periodLong(r.period, $lang)}</th>
              {#each r.values as v, i (i)}
                <td class="num mono">{format(v)}</td>
              {/each}
              {#if flagged}
                <td class="mono flag">{r.flag ?? ""}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if note}
      <p class="cap">
        <span class="l-bg">{note.bg}</span>
        <span class="l-en">{note.en}</span>
      </p>
    {/if}
  </details>
{/snippet}

<!-- A column head with the quarter its own workbook or cube is at. Two
     publishers on four release calendars reach this page, and the period is
     what tells two adjacent columns apart when one of them falls behind. -->
{#snippet colHead(label, period)}
  <span class="l-bg">{label.bg}</span>
  <span class="l-en">{label.en}</span>
  {#if period}
    <small class="q">
      <span class="l-bg">{periodLong(period, "bg")}</span>
      <span class="l-en">{periodLong(period, "en")}</span>
    </small>
  {/if}
{/snippet}

<main id="main" class="wrap market">
  <h1>
    <span class="l-bg">Пазарът на жилища, с числата на институциите</span>
    <span class="l-en">The property market, in the institutions' own figures</span>
  </h1>

  <!-- Two sentences, because the four answers under them are what a reader came
       for. At 360px anything longer here pushes the last two cards past the
       fold, on a page whose first job is to answer four questions. -->
  <p class="lead">
    <span class="l-bg">Официалните числа за жилищата в България.</span>
    <span class="l-en">The official figures for housing in Bulgaria.</span>
  </p>
  <!--
    The four answers, before anything else on the page.

    A reader arriving here wants to know four things: is it dearer than it used
    to be, by how much really, what does one cost in something I can picture,
    and are people buying. Every one of them is answered by a chart in a section
    below, and a summary that made a reader read the working to reach it is a
    summary that arrives after the reader has left.

    So the summary is at the top and the working is below it, and every card
    still carries its publisher, the period it describes and the query that
    returns it. Nothing here is a figure the page does not go on to show whole,
    and a card's LABEL is a statement rather than the name of a measure.
  -->
  <div class="stats answers">
    {#if reading.times != null}
      {@render figure(
        `×${fmt(reading.times)}`,
        {
          bg: t(COPY.mktKTimesNominal, "bg", { year: reading.baseYear }),
          en: t(COPY.mktKTimesNominal, "en", { year: reading.baseYear }),
        },
        COPY.srcEurostat,
        reading.sourceUrl,
        when(reading.period),
        reading.apiUrl
      )}
    {/if}
    {#if reading.realTimes != null}
      {@render figure(
        `×${fmt(reading.realTimes)}`,
        {
          bg: t(COPY.mktKTimesReal, "bg", { year: reading.baseYear }),
          en: t(COPY.mktKTimesReal, "en", { year: reading.baseYear }),
        },
        COPY.srcEurostat,
        reading.realSourceUrl,
        when(reading.period),
        reading.realApiUrl
      )}
    {/if}
    {#if volume.deals.value}
      {@render figure(
        fmt0(volume.deals.value),
        COPY.mktKDeals,
        COPY.srcEurostat,
        volume.deals.sourceUrl,
        when(volume.period),
        volume.deals.apiUrl
      )}
    {/if}
    {#if yearsOfPay.value != null}
      {@render figure(
        fmt(yearsOfPay.value),
        COPY.mktKYearsOfPay,
        COPY.srcEurostatNsi,
        yearsOfPay.wageUrl,
        whenPair(yearsOfPay.dealPeriod, COPY.srcEurostat, yearsOfPay.wagePeriod, COPY.srcNsi)
      )}
    {/if}
  </div>

  <!-- Under the four answers rather than above the page, and measured rather
       than chosen: at 360px the cards already end 710px down an 800px screen,
       and a full-bleed band above them costs 74px with one payload late and
       113px with three — so the summary a reader came for is what would go off
       the bottom on exactly the day the page most needs reading. Here it is the
       first thing after the row, in the erode accent, and it qualifies
       everything below it. Each card carries its own period either way. -->
  <DataLate rows={late} inset />

  <!--
    Directly under the cards it discloses. Three of the four are ours rather
    than read off a table, and Eurostat permit that on condition it is stated
    clearly to the end user — a statement further down the page than a reader
    goes is one that is stated to nobody.

    What stays on screen is what changes the READING: the wage is gross, so a
    reader taking it for take-home has the answer wrong by the whole tax wedge,
    and both halves are country-wide averages, so this is not one buyer's
    arithmetic in one city. The divisions, the two publishers' clocks and НСИ's
    coverage are how it was made and sit behind the disclosure.
  -->
  {#if yearsOfPay.value != null}
    {@render ourSum(
      {
        bg:
          `Числата с «×» и това в години са наша сметка от публикувани числа. Заплатата в тях е ` +
          `брутната, както я публикува НСИ, а не парите на ръка, а жилището и заплатата са ` +
          `средни за цялата страна, а не сметката на конкретен купувач в конкретен град.`,
        en:
          `The multiples and the years figure are our arithmetic, both from published numbers. ` +
          `The wage in them is the one before tax and contributions, as NSI publish it, and both ` +
          `it and the dwelling are country-wide averages rather than any particular buyer's ` +
          `arithmetic in any particular city.`,
      },
      yearsOfPay.derivedFrom
    )}
    {@render howMade({
      bg:
        `«Колко пъти» е индексът на Евростат, разделен на нивото от ${reading.baseYear} г. ` +
        `«Колко години заплата» е средната сделка на Евростат, разделена на дванадесет средни ` +
        `месечни заплати на НСИ за всички дейности. Двата файла се срещат едва тук, в браузъра ` +
        `ти, така че във всеки от тях стоят числата само на един публикуващ орган. Таблицата на ` +
        `НСИ мери наетите по трудово правоотношение, така че работещите на свободна практика и ` +
        `собствениците на фирми не влизат в тази средна заплата. Парите на ръка зависят от ` +
        `данъчната таблица на годината, в която са сметнати, а това би вкарало трети закон в ` +
        `сметка между две институции.`,
      en:
        `The multiple is Eurostat's index divided by its ${reading.baseYear} level. The years ` +
        `figure is Eurostat's average transaction divided by twelve of NSI's published average ` +
        `monthly wages across all activities. The two files meet only here, in your browser, ` +
        `which is what keeps each of them one publisher's data. NSI's table measures employees ` +
        `under a labour contract, so the self-employed and company owners are not in that ` +
        `average. Take-home pay depends on the payroll table of the year that computed it, ` +
        `which would put a third body's law inside a two-publisher ratio.`,
    })}
  {/if}

  <!--
    Where today sits inside each series' own record — the whole page, on one
    screen, without a verdict in it.

    THE ANSWER TO "why not one market-health score". A section and a chart per
    measure give a reader no way to see everything at once, which is the real
    complaint, and a single composite would answer it by deciding on their
    behalf which of these is the bad news: whose fall counts as good news
    depends on whether they own or are buying, and any weighting of prices,
    volume, rates and cost burden makes that call using credibility that
    belongs to Eurostat. It would also be the one figure on this site nobody can
    check against anything. So every row is one publisher's one series, placed
    against its own extremes and against nothing else, and each links the
    section that shows the working.

    ONE HUE, and it is `--real` — the accent every data mark on this page is
    already drawn in. Not red-to-green and not a two-ended scale: `--erode`
    means "money leaving you" and `--real` its opposite everywhere else on the
    site, so painting a position in either says which end is the bad end. Drawn
    identically on every row, the accent says "this is the reading" and
    nothing more.

    BELOW the answer cards rather than above them. At 360px the four cards
    already end 710px down an 800px screen, so there is no room above them for
    anything at all — and pushing the summary a reader came for off their screen
    to make space for a second one is the trade this strip exists to avoid.
  -->
  {#if rangeStrip.rows.length}
    <!-- The refusal to score is stated HERE and nowhere else on the page. Six
         positions on six tracks are the one thing on it a reader could take for
         a composite waiting to be totalled, so the sentence declining to total
         them belongs against the picture. -->
    <p class="lead">
      <span class="l-bg"
        >Точката показва къде стои последното измерване в своята история: вляво е най-ниското, което
        Евростат е публикувал, а вдясно най-високото. Числата мерят различни неща и не сочат в една
        посока: не заемаме страна и не ги събираме в обща оценка.</span
      >
      <span class="l-en"
        >The dot is where the newest reading sits in its own record: the left end is the lowest
        Eurostat have published and the right end the highest. The figures measure different things
        and do not point one way: we take no side, and nothing here adds up to a single score.</span
      >
    </p>

    <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblRange, $lang)}>
      <table class="fig-table range">
        <thead>
          <tr>
            <th scope="col">{@render colHead(COPY.mktColRangeWhat, null)}</th>
            <th scope="col">{@render colHead(COPY.mktColRangeWhere, null)}</th>
            <th scope="col" class="num">{@render colHead(COPY.mktColRangeNow, null)}</th>
          </tr>
        </thead>
        <tbody>
          {#each rangeStrip.rows as row (row.key)}
            {@const label = RANGE_LABEL[row.key]}
            <tr>
              <th scope="row">
                <a href={row.href}>
                  <span class="l-bg">{label.bg}</span>
                  <span class="l-en">{label.en}</span>
                </a>
                <!-- The row's own provenance, on the row. The publisher is the
                     same across the strip and the WINDOW is not: these six
                     records start in four different years, and a position means
                     nothing without the span it is a position inside. -->
                <span class="ss">
                  {@render srcLine(COPY.srcEurostat, row.sourceUrl, spanned(row), row.apiUrl)}
                </span>
              </th>
              <td class="track">
                <svg
                  class="rng"
                  viewBox="0 0 {RG_W} {RG_H}"
                  role="img"
                  aria-label={t(COPY.mktRangeMark, $lang, {
                    what: t(label, $lang),
                    low: rangeValue(row, row.low),
                    lowAt: at(row.lowPeriod),
                    high: rangeValue(row, row.high),
                    highAt: at(row.highPeriod),
                    now: rangeValue(row, row.value),
                    nowAt: at(row.latestPeriod),
                  })}
                >
                  <line
                    class="rng-track"
                    x1={rangeX(0)}
                    y1={RG_H / 2}
                    x2={rangeX(1)}
                    y2={RG_H / 2}
                  />
                  <circle class="rng-dot" cx={rangeX(row.at)} cy={RG_H / 2} r={RG_R} />
                </svg>
                <!-- Each end's figure under the end it belongs to. Written as
                     one «low … high» string the pair is a second thing to
                     decode: a reader has to work out that the left number
                     belongs to the left of the track, and at 360px the string
                     is centred under a 108px line so neither number is under
                     anything. Split and pushed apart, the picture states its
                     own scale and the paragraph above it has one less job. -->
                <small class="q mono ends">
                  <span>{rangeValue(row, row.low)}</span>
                  <span>{rangeValue(row, row.high)}</span>
                </small>
              </td>
              <td class="num mono">{rangeValue(row, row.value)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <!-- One sentence, and it is the one the picture cannot make: a rising
         series sits at its right end whatever it is doing this quarter, and a
         reader who takes the position for news reads a record as a quarter.
         Why prices take two rows is on the two rows — the labels are «цените на
         сделките» and the same with the rise in everything else taken out — and
         what the base year IS belongs to §prices, where the ×1 rule is drawn. -->
    <p class="cap">
      <span class="l-bg"
        >Число, което само расте, винаги стои в десния си край, и това е свойство на самата редица,
        а не знак, че точно сега се случва нещо.</span
      >
      <span class="l-en"
        >A figure that only ever rises always sits at the right-hand end, and that is a property of
        the series itself, not a sign that something is happening now.</span
      >
    </p>
  {/if}

  <!-- Interface documentation for a pattern the page uses two dozen times. It
       serves the reader who follows a link and finds six measures where they
       expected one, and every other reader pays for it in the flow — so it sits
       one interaction from the source lines it is about, which is where that
       reader is already looking. -->
  {@render howMade(
    {
      bg:
        `Първата отваря таблицата на публикуващия. Там до нашето число стоят и всички останали ` +
        `мерки от същия набор: брой, индекс, месечна и годишна промяна, затова за същата ` +
        `държава и същото тримесечие там се вижда повече от едно число. Втората, ` +
        `«${COPY.mktSrcQuery.bg}», връща точно това, което пише тук, и нищо друго.`,
      en:
        `The first opens the publisher's own table. Our figure sits there beside every other ` +
        `measure in the same dataset (a count, an index, a quarterly and an annual rate), so ` +
        `the same country and quarter shows more than one number there. The second, ` +
        `"${COPY.mktSrcQuery.en}", returns exactly what is printed here and nothing else.`,
    },
    COPY.mktHowLinks
  )}

  <!-- The order the sections are in, and the order is an editorial decision
       rather than an inheritance. A reader arrives asking what a home costs, so
       the page answers that first — in the published rate and the index, then
       in euros — and turns to how many changed hands after. The two questions
       meet in the pair of panels at the foot of §volume, which is why that pair
       is drawn there and not sooner: it needs a reader who has already met both
       of its halves. -->
  <nav class="toc" aria-label="contents">
    <a href="#prices"
      ><span class="l-bg">колко струва</span><span class="l-en">what it costs</span></a
    >
    <a href="#deal"
      ><span class="l-bg">средната сделка</span><span class="l-en">the average deal</span></a
    >
    <a href="#volume"
      ><span class="l-bg">колко се търгува</span><span class="l-en">how much changes hands</span></a
    >
    <a href="#cities"><span class="l-bg">по градове</span><span class="l-en">by city</span></a>
    <a href="#credit"
      ><span class="l-bg">кой купува с кредит</span><span class="l-en">who borrows</span></a
    >
    <a href="#borrowed"
      ><span class="l-bg">колко от парите са кредит</span><span class="l-en"
        >how much is borrowed</span
      ></a
    >
    <a href="#stock"
      ><span class="l-bg">колко жилища преброиха</span><span class="l-en"
        >what the census counted</span
      ></a
    >
    <a href="#ratio"
      ><span class="l-bg">скъпо ли е спрямо доходите</span><span class="l-en"
        >expensive against incomes?</span
      ></a
    >
  </nav>

  <!-- 1 ------------------------------------------------------------------ -->
  <section id="prices">
    <h2>
      <span class="l-bg">Колко струва</span>
      <span class="l-en">What it costs</span>
    </h2>
    <p>
      <span class="l-bg"
        >Първо най-простото: с колко са се променили цените на сделките за една година. Числото е на
        Евростат, а не наша сметка.</span
      >
      <span class="l-en"
        >The simplest figure first: how much transaction prices moved in a year. It is Eurostat's
        number rather than one we worked out.</span
      >
    </p>

    {#if priceRate.total.value != null}
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblPrices, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">{@render colHead(COPY.mktColKind, null)}</th>
              <th scope="col" class="num"
                >{@render colHead(COPY.mktColEurostat, priceRate.period)}</th
              >
              <th scope="col" class="num"
                >{@render colHead(COPY.mktColNsi, nsiNational.refPeriod)}</th
              >
            </tr>
          </thead>
          <tbody>
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowTotal, null)}</th>
              <td class="num mono">{pct(priceRate.total.value)}</td>
              <td class="num mono">{pct(nsiNational.value)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowNew, null)}</th>
              <td class="num mono">{pct(priceRate.newBuild)}</td>
              <td class="num mono">{pct(nsiNational.newBuild)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowExisting, null)}</th>
              <td class="num mono">{pct(priceRate.existing)}</td>
              <td class="num mono">{pct(nsiNational.existing)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          priceRate.total.sourceUrl,
          when(priceRate.period),
          priceRate.total.apiUrl
        )}
        {#if nsiNational.value != null}
          <span class="sep">·</span>
          {@render srcLine(COPY.srcNsi, nsiNational.sourceUrl, when(nsiNational.refPeriod))}
        {/if}
      </p>
      <!-- Why there are two columns, and why neither of them is worked out here
           from the index this section draws twice. Both are commitments rather
           than details, and both are answers to a question a reader has only
           once they are already checking one column against the other. After
           the source line, never between it and the table. -->
      {@render howMade({
        bg:
          `Едно и също число стига дотук по два пътя: НСИ го изчислява, Евростат го ` +
          `разпространява, затова таблицата има две колони, за да се види, че съвпадат. Нито ` +
          `едната не е наша сметка от индекса. НСИ са сменяли базата му (годината, приравнена ` +
          `на 100), и процент, пресметнат наново през старата и през новата, може да се ` +
          `разминава с публикувания в последния знак.`,
        en:
          `One figure reaches this page by two routes: NSI compile it and Eurostat disseminate ` +
          `it, so the table has two columns and a reader can see they agree. Neither is worked ` +
          `out here from the index. NSI have changed its base (the year set to 100), and a rate ` +
          `recomputed across the old base and the new one can differ from the published one in ` +
          `the last decimal.`,
      })}
    {/if}

    <!-- The index, and the one thing the base year may not be called.

         `base_year` is the year Eurostat SET TO 100. It is not where the record
         begins: the series runs from long before it, and its early quarters are
         under the reference rule. Call it the start and the sentence contradicts
         the picture beside it — every digit stays correct, the axis stays
         correct, and a reader concludes we hold no data before that year and
         cannot read a point drawn below ×1. `verify_copy.mjs` §"the index's base
         year is never called the start of the series" is the guard.

         The base is also an ANNUAL average and no single quarter equals it, so
         the ×1 rule passes between the base year's own points rather than
         through one of them. A reader who goes looking for the quarter where
         the line touches ×1 does not find it. -->
    {#if indexSeries.points.length > 8}
      <!-- One paragraph, and the join is what makes it one: the chart's unit is
           a multiple of a year, and the same sentence has to say which year and
           what it is not. The base is an ANNUAL average and the chart's key
           says so («×1 = средното за {year} г.»), so nothing here repeats that
           no quarter sits exactly on the rule. What no key can carry is why
           there are points UNDER the rule at all. -->
      <p>
        <span class="l-bg"
          >Процентът отгоре е за една година. Картинката отдолу мери друго: колко пъти са по-високи
          цените от една година, взета за мерило. Тази година е {reading.baseYear} и на картинката е линията
          ×1. Тя е мерилото, а не началото на редицата, затова вляво от нея има точки под ×1: тогава жилищата
          са стрували по-малко.</span
        >
        <span class="l-en"
          >The percentage above is one year's. The chart below measures something else: how many
          times higher prices are than one year taken as the yardstick. That year is {reading.baseYear},
          and on the chart it is the ×1 line. It is the yardstick rather than the start of the
          record, which is why there are points below ×1 to the left of it: homes cost less then.</span
        >
      </p>

      <p>
        <span class="l-bg"
          >Двата реда мерят едно и също по два начина. Плътният брои пари, колко пъти повече пари се
          дават за жилище. Но парите междувременно купуват по-малко от всичко; пунктираният маха
          точно това и отговаря на другия въпрос: поскъпнали ли са жилищата повече от всичко друго,
          което купуваме. Евростат публикува и двата.</span
        >
        <span class="l-en"
          >The two lines measure the same thing two ways. The solid one counts money: how many times
          more of it changes hands for a home. But money buys less of everything than it did; the
          dashed one takes exactly that out and answers the other question: have homes got dearer
          than everything else we buy. Eurostat publish both.</span
        >
      </p>
      <!-- The two readings said out loud, from the payload. A chart answers
           «how much dearer» only for a reader who can read a line off an axis;
           this is the same two numbers in a sentence, and the second sentence
           is the one comparison on the page nobody else in Bulgaria publishes
           with a source attached. Both are slots — the years, the multiples and
           the shortfall all come out of the series' own extremes, so a quarter
           that moves any of them moves the sentence too. -->
      {#if reading.times != null && reading.realTimes != null}
        <p class="reading">
          <span class="l-bg"
            >Днес за жилище се плащат <b>×{fmt(reading.times)}</b> повече пари, отколкото през {reading.baseYear}
            г. Но и всичко останало поскъпна, а спрямо него жилищата са
            <b>×{fmt(reading.realTimes)}</b> по-скъпи.
            {#if reading.realBelowPeakPct != null && reading.realPeakPeriod}
              Така мерено, нивото днес е с {fmt(reading.realBelowPeakPct)}% под най-високото, което
              Евростат е отчитал, през {periodLong(reading.realPeakPeriod, "bg")}.{/if}</span
          >
          <!-- «×N» is a RATIO and the English has to keep it one. "takes ×2.7
               as much money" is missing the word the construction needs — "as
               much as" governs "times", not a multiplication sign — and "homes
               are ×1.6 dearer" turns the ratio into a difference, which is a
               different figure: ×1,6 is sixty per cent dearer, not a hundred
               and sixty. Both halves say what the level IS a multiple of, which
               is what the axis beside them is labelled in. -->
          <span class="l-en"
            >The money paid for a home today is <b>×{fmt(reading.times)}</b> what it was in {reading.baseYear}.
            But everything else got dearer too, and measured against that a home is
            <b>×{fmt(reading.realTimes)}</b> what it was.
            {#if reading.realBelowPeakPct != null && reading.realPeakPeriod}
              On that measure today's level is {fmt(reading.realBelowPeakPct)}% below the highest
              Eurostat have recorded, in {periodLong(reading.realPeakPeriod, "en")}.{/if}</span
          >
        </p>
        <p class="ss tsrc">
          {@render srcLine(
            COPY.srcEurostat,
            reading.sourceUrl,
            spanned(indexSeries),
            reading.apiUrl
          )}
          <span class="sep">·</span>
          {@render srcLine(
            COPY.srcEurostat,
            reading.realSourceUrl,
            spanned(indexRealSeries),
            reading.realApiUrl
          )}
        </p>
      {/if}

      <!-- **The ticks are chosen in MULTIPLES and then converted back to index
           levels, never the other way round.** This is the one axis on the page
           whose labels are not the unit its data is in: the series is an index
           on the base the payload declares and the axis reads «×1», «×2». Round
           steps found over the levels are 50s and 100s, which come out as ×0,5
           and ×1,5 — round in a unit nobody sees. Found over the multiples they
           are round in the unit on screen, and the level they correspond to is
           whatever it has to be.

           Six intervals rather than five, because this plot is the tall one and
           the extra room is what it was given for. -->
      {@const indexMultiples = niceTicks(
        indexScale.min / indexScale.reference,
        indexScale.max / indexScale.reference,
        6
      )}
      {@const indexAxis = {
        min: indexMultiples.min * indexScale.reference,
        max: indexMultiples.max * indexScale.reference,
        reference: indexScale.reference,
      }}
      <figure class="chart">
        <div class="plot labelled">
          <!-- The axis is in multiples, which is what makes it readable at all.
               «272,63» names no unit, is anchored to a year somebody picked, and
               connects to nothing a reader has ever paid; «×2,7» is the same
               cell divided by the base the payload declares. The numbers table
               under the chart keeps the published index, because that is the
               figure a sceptic checks against Eurostat. -->
          {@render yAxis(
            indexMultiples.values.map((m) => ({
              at: tickAt(m * indexScale.reference, indexAxis),
              // «×1,0» reads as a measurement where «×1» is a definition, and
              // the key beside the chart says «×1 = средното за {year} г.» — so
              // a whole multiple is written whole and a half keeps its decimal.
              label: m === 0 ? "0" : times(m * indexScale.reference, Number.isInteger(m) ? 0 : 1),
            }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_TALL}"
            role="img"
            aria-label={t(COPY.mktChartIndex, $lang, {
              from: periodLong(indexSeries.from, $lang),
              to: periodLong(indexSeries.to, $lang),
              base: reading.baseYear,
              low: fmt(indexTimesBase(indexSeries.trough?.value, indexScale.reference)),
              lowAt: periodLong(indexSeries.trough?.period, $lang),
              peak: fmt(indexTimesBase(indexSeries.peak?.value, indexScale.reference)),
              peakAt: periodLong(indexSeries.peak?.period, $lang),
              last: fmt(reading.times),
              realPeak: fmt(indexTimesBase(indexRealSeries.peak?.value, indexScale.reference)),
              realPeakAt: periodLong(indexRealSeries.peak?.period, $lang),
              realLast: fmt(reading.realTimes),
            })}
          >
            {@render gridlines(indexAxis, indexScale.reference, CH_TALL)}
            {@render yearRules(xTicks(indexSeries), CH_TALL)}
            <line
              class="plot-base"
              x1="0"
              y1={yOf(indexScale.reference, indexAxis, CH_TALL)}
              x2={CH_W}
              y2={yOf(indexScale.reference, indexAxis, CH_TALL)}
            />
            <!-- A quarter Eurostat marked as a break in their own series. Drawn as
                 a rule rather than smoothed over: the line either side of it is
                 not one continuous measurement, and joining them without saying
                 so is a claim the publisher declined to make. -->
            {#each Object.entries(indexSeries.flags) as [period, letter] (period)}
              {#if letter.includes("b")}
                {@const i = indexSeries.points.findIndex((p) => p.period === period)}
                {#if i >= 0}
                  <line
                    class="plot-break"
                    x1={lineX(i, indexSeries.points.length)}
                    y1="0"
                    x2={lineX(i, indexSeries.points.length)}
                    y2={CH_TALL}
                  >
                    <title>{period}: {t(COPY.mktFlagB, $lang)}</title>
                  </line>
                {/if}
              {/if}
            {/each}
            <path
              class="plot-line second"
              d={path({ ...indexRealSeries, ...indexAxis }, CH_TALL)}
            />
            <path class="plot-line" d={path({ ...indexSeries, ...indexAxis }, CH_TALL)} />
            <!-- The quarter the paragraph above this chart names, marked on the
                 chart. «нивото днес е с 4,3% под най-високото, което Евростат е
                 отчитал — през Q3 2008» is a sentence about a point a reader
                 then has to find by eye across eighty-five columns; a ring puts
                 the sentence and the picture in the same place. Only the
                 deflated line has an interior peak — the nominal one is still
                 rising, so its highest reading IS its last point and already
                 carries the newest-reading mark. -->
            {#if indexRealSeries.peak && indexRealSeries.peak !== indexRealSeries.points.at(-1)}
              {@const i = indexRealSeries.points.indexOf(indexRealSeries.peak)}
              <circle
                class="plot-peak"
                cx={lineX(i, indexRealSeries.points.length)}
                cy={yOf(indexRealSeries.peak.value, indexAxis, CH_TALL)}
                aria-hidden="true"
              />
            {/if}
            {@render lastPoint({ ...indexRealSeries, ...indexAxis }, indexAxis, CH_TALL, true)}
            {@render lastPoint({ ...indexSeries, ...indexAxis }, indexAxis, CH_TALL)}
            {@render dots({ ...indexSeries, ...indexAxis }, times, CH_TALL)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, indexAxis, CH_TALL)}
              x2={CH_W}
              y2={yOf(0, indexAxis, CH_TALL)}
            />
          </svg>
          <!-- The two series' own current multiples, which is what a reader
               came for and what an axis eleven ticks long makes them estimate.
               Read off the last POINT rather than out of `reading`, so the digits
               and the mark beside them cannot come from two different quarters. -->
          {@render sLabels(
            [indexSeries, indexRealSeries]
              .map((s) => s.points.at(-1))
              .filter(Boolean)
              .map((p) => ({ at: tickAt(p.value, indexAxis), label: times(p.value) }))
          )}
          {@render xYears(xTicks(indexSeries))}
        </div>
        <figcaption>
          <span class="key one"
            ><span class="l-bg">{COPY.mktKeyNominal.bg}</span><span class="l-en"
              >{COPY.mktKeyNominal.en}</span
            ></span
          >
          <span class="key two"
            ><span class="l-bg">{COPY.mktKeyReal.bg}</span><span class="l-en"
              >{COPY.mktKeyReal.en}</span
            ></span
          >
          <span
            ><span class="l-bg">{t(COPY.mktRefIndexBase, "bg", { year: reading.baseYear })}</span
            ><span class="l-en">{t(COPY.mktRefIndexBase, "en", { year: reading.baseYear })}</span
            ></span
          >
          <!-- Named only where one is drawn. The rules come out of the
               payload's own flags, so a quarter Eurostat stops flagging takes
               its key with it rather than leaving a legend entry for a mark
               that is no longer on the picture. A mark with no key is a mark a
               reader cannot account for, and these two are the only ones on the
               plot with nothing in the caption to look them up in. -->
          {#if indexRealSeries.peak && indexRealSeries.peak !== indexRealSeries.points.at(-1)}
            <span class="key peak"
              ><span class="l-bg">{COPY.mktKeyPeak.bg}</span><span class="l-en"
                >{COPY.mktKeyPeak.en}</span
              ></span
            >
          {/if}
          {#if Object.values(indexSeries.flags).some((f) => f.includes("b"))}
            <span class="key brk"
              ><span class="l-bg">{COPY.mktKeyBreak.bg}</span><span class="l-en"
                >{COPY.mktKeyBreak.en}</span
              ></span
            >
          {/if}
        </figcaption>
      </figure>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          indexSeries.sourceUrl,
          spanned(indexSeries),
          indexSeries.apiUrl
        )}
      </p>
      {@render numbersTable(
        countLabel(COPY.mktOpenQuarters, indexSeries.points.length),
        COPY.mktTblIndexNumbers,
        [COPY.mktColIndex, COPY.mktColIndexReal],
        rowsOf(indexSeries, [indexRealSeries]),
        (v) => fmt(v),
        true,
        // The bridge between the two forms, and it has to be written or one
        // cell reads «×2,7» on the chart and «272,63» in the table with nothing
        // saying they are the same figure. The table keeps the published form on
        // purpose: an index level is what a sceptic checks against Eurostat's
        // own table, and the multiple is what a reader understands. Eurostat's
        // key travels with it, because the letters it decodes are in a column of
        // this table and on nothing else the page draws.
        //
        // WHICH price rise the second column takes out, in the one place the
        // question can be asked: this table is where both columns are on screen
        // at once. The headline figure the calculator is built on is the HICP,
        // so «без поскъпването на всичко останало» reads as "without THAT" —
        // and Eurostat deflate by the national accounts deflator for household
        // final consumption instead, a near neighbour of the HICP and not the
        // same series. Somebody reconciling this column against our published
        // inflation gets figures that nearly agree, which is the worst way to
        // find out they are two measurements.
        {
          bg:
            `Числата са както ги публикува Евростат: индекс, в който средното за ` +
            `${reading.baseYear} г. е 100; картинката отгоре показва същите числа, разделени на ` +
            `това 100. Втората колона е разделена и на дефлатора за крайното потребление на ` +
            `домакинствата, роднина на инфлацията, която този сайт показва, но не същият ред.` +
            (flagKey.length
              ? ` ${COPY.mktFlagsLead.bg} ${flagKey.map((l) => FLAG_COPY[l].bg).join(" · ")}`
              : ""),
          en:
            `The figures are as Eurostat publish them: an index with the average for ` +
            `${reading.baseYear} written as 100; the chart above shows the same figures divided ` +
            `by that 100. The second column is divided by the national accounts deflator for ` +
            `household final consumption as well, a near relative of the inflation figure this ` +
            `site publishes rather than the same series.` +
            (flagKey.length
              ? ` ${COPY.mktFlagsLead.en} ${flagKey.map((l) => FLAG_COPY[l].en).join(" · ")}`
              : ""),
        }
      )}

      <!-- The published rate, every quarter there is one ----------------- -->
      {#if rateSeries.points.length > 8}
        <p>
          <!-- `mktRefZero` states what the rule at zero means. What it cannot
               state is the misreading: a shorter column above the line is a
               smaller rise, and it is read as a fall. -->
          <span class="l-bg"
            >Същото, но като годишна промяна: числото, което Евростат публикува всяко тримесечие.
            По-ниско стълбче над нулата значи по-малко поскъпване, а не поевтиняване: цените падат
            само в тримесечията със стълбче под линията.</span
          >
          <span class="l-en"
            >The same thing as an annual change: the figure Eurostat publish each quarter. A shorter
            column above the zero line is a smaller rise, not a fall: prices fell only in the
            quarters whose column is below it.</span
          >
        </p>
        {@const rateAxis = niceTicks(rateSeries.min, rateSeries.max)}
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              rateAxis.values.map((v) => ({
                at: tickAt(v, rateAxis),
                label: v === 0 ? "0" : pctAxis(v),
              }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.mktChartRate, $lang, {
                from: at(rateSeries.from),
                to: at(rateSeries.to),
                low: pct(rateSeries.trough?.value),
                lowAt: at(rateSeries.trough?.period),
                peak: pct(rateSeries.peak?.value),
                peakAt: at(rateSeries.peak?.period),
                last: pct(rateSeries.latest?.value),
              })}
            >
              {@render gridlines(rateAxis)}
              {@render yearRules(xTicks(rateSeries))}
              {@render columns(rateSeries, (v) => pct(v), rateAxis)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, rateAxis)}
                x2={CH_W}
                y2={yOf(0, rateAxis)}
              />
            </svg>
            {@render xYears(xTicks(rateSeries))}
          </div>
          <figcaption>
            <span class="l-bg">{COPY.mktRefZero.bg}</span>
            <span class="l-en">{COPY.mktRefZero.en}</span>
          </figcaption>
        </figure>
        <p class="ss tsrc">
          {@render srcLine(
            COPY.srcEurostat,
            rateSeries.sourceUrl,
            spanned(rateSeries),
            rateSeries.apiUrl
          )}
        </p>
        {@render numbersTable(
          countLabel(COPY.mktOpenQuarters, rateSeries.points.length),
          COPY.mktTblRateNumbers,
          [COPY.mktColChange],
          rowsOf(rateSeries),
          (v) => pct(v)
        )}
      {/if}
    {/if}
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
  <section id="deal">
    <h2>
      <span class="l-bg">Средната сделка</span>
      <span class="l-en">The average deal</span>
    </h2>
    <p>
      <span class="l-bg"
        >Евростат публикува колко жилища са купени и колко е платено общо за тях, за един и същ
        обхват и едно и също тримесечие. «Платено общо» е цената на самите жилища заедно с земята
        под тях, с ДДС при новото строителство; нотариусът, комисионата и банковите такси стоят
        извън нея, така че средната сделка е цената на жилището, а не цената на купуването му.</span
      >
      <span class="l-en"
        >Eurostat publish how many dwellings were bought and how much was paid for them in total,
        over the same scope and the same quarter. "Total paid" is the price of the dwellings
        themselves together with the land under them, VAT included on new builds; the notary, the
        agency commission and the bank fees sit outside it, so the average deal is what a home costs
        rather than what buying one costs.</span
      >
    </p>

    {#if deal.avg.value}
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblDeal, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">{@render colHead(COPY.mktColKind, null)}</th>
              <th scope="col" class="num">{@render colHead(COPY.mktColAvgPaid, deal.period)}</th>
              <th scope="col" class="num">{@render colHead(COPY.mktColTotalPaid, deal.period)}</th>
              <th scope="col" class="num">{@render colHead(COPY.mktColCount, deal.period)}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowTotal, null)}</th>
              <td class="num mono">{fmt0(deal.avg.value)} €</td>
              <td class="num mono">{fmt0(deal.totalValue)} €</td>
              <td class="num mono">{fmt0(deal.deals)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowNew, null)}</th>
              <td class="num mono">{fmt0(deal.newBuild)} €</td>
              <td class="num mono">{fmt0(deal.newValue)} €</td>
              <td class="num mono">{fmt0(deal.newDeals)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowExisting, null)}</th>
              <td class="num mono">{fmt0(deal.existing)} €</td>
              <td class="num mono">{fmt0(deal.existingValue)} €</td>
              <td class="num mono">{fmt0(deal.existingDeals)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ss tsrc">
        {@render srcLine(COPY.srcEurostat, deal.avg.sourceUrl, when(deal.period), deal.avg.apiUrl)}
      </p>

      <!--
        The section's figure, said out loud, and the chart's introduction — one
        paragraph doing both jobs because they are the same sentence.

        THE PAGE'S SIGNATURE FIGURE WAS ONLY EVER A TABLE CELL. It is the one
        number here a reader can picture — every other price on the page is an
        index, a multiple or a percentage — and a cell in the second column of a
        four-column table is not where a reader takes a figure away from. The
        section states it the way §prices states its own, in the marked
        paragraph, so the two sections that answer "what does a home cost" both
        answer it in words.

        And it is the one chart on the page a reader met with nothing: every
        other plot has a sentence above it saying what it draws.

        **The gap between the two lines is not stated as a ratio, and that is a
        decision rather than an omission.** «×1,55» over these two would be our
        arithmetic over two figures that are already our division, and it reads
        as a claim about one dwelling against another — while each is a mean
        over a different mix, new builds weighted to the cities and existing
        dwellings sweeping in the whole country. The two figures are here and
        the subtraction is the reader's.
      -->
      <p class="reading">
        <span class="l-bg"
          >За едно жилище са платени средно <b>{fmt0(deal.avg.value)} €</b> през тримесечието:
          {fmt0(deal.newBuild)} € за новото строителство и {fmt0(deal.existing)} € за съществуващото.
          Двата реда отдолу са на един мащаб.</span
        >
        <span class="l-en"
          >A dwelling changed hands for <b>{fmt0(deal.avg.value)} €</b> on average in the quarter:
          {fmt0(deal.newBuild)} € for a new build and {fmt0(deal.existing)} € for an existing dwelling.
          The two lines below are drawn on one scale.</span
        >
      </p>

      <!-- The two lines apart, never one line for the total ---------------
           The average deal is a mean over whatever sold that quarter, so a
           TOTAL line moves with the mix of new builds and existing dwellings as
           much as with prices — and a line chart invites exactly the reading
           that mix will not support. Within one purchase type the mix is far
           narrower, and the two drawn on one scale show the gap between them,
           which is what the mix caveat is about. -->
      {#if dealNewSeries.points.length > 4}
        {@const dealAxis = niceTicks(dealScale.min, dealScale.max, 4)}
        <figure class="chart">
          <div class="plot labelled">
            {@render yAxis(
              dealAxis.values.map((v) => ({
                at: tickAt(v, dealAxis),
                label: v === 0 ? "0" : `${fmt0(v)} €`,
              }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.mktChartDeal, $lang, {
                from: at(dealNewSeries.from),
                to: at(dealNewSeries.to),
                new: fmt0(dealNewSeries.latest?.value),
                existing: fmt0(dealExistingSeries.latest?.value),
              })}
            >
              {@render gridlines(dealAxis)}
              {@render yearRules(xTicks(dealNewSeries))}
              <path class="plot-line" d={path({ ...dealNewSeries, ...dealAxis })} />
              <path class="plot-line second" d={path({ ...dealExistingSeries, ...dealAxis })} />
              {@render lastPoint({ ...dealExistingSeries, ...dealAxis }, dealAxis, CH_H, true)}
              {@render lastPoint({ ...dealNewSeries, ...dealAxis }, dealAxis, CH_H)}
              {@render dots({ ...dealNewSeries, ...dealAxis }, (v) => `${fmt0(v)} €`)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, dealAxis)}
                x2={CH_W}
                y2={yOf(0, dealAxis)}
              />
            </svg>
            {@render sLabels(
              [dealNewSeries, dealExistingSeries]
                .map((s) => s.points.at(-1))
                .filter(Boolean)
                .map((p) => ({ at: tickAt(p.value, dealAxis), label: `${fmt0(p.value)} €` }))
            )}
            {@render xYears(xTicks(dealNewSeries))}
          </div>
          <figcaption>
            <span class="key one"
              ><span class="l-bg">{COPY.mktKeyNew.bg}</span><span class="l-en"
                >{COPY.mktKeyNew.en}</span
              ></span
            >
            <span class="key two"
              ><span class="l-bg">{COPY.mktKeyExisting.bg}</span><span class="l-en"
                >{COPY.mktKeyExisting.en}</span
              ></span
            >
          </figcaption>
        </figure>
        <p class="ss tsrc">
          {@render srcLine(
            COPY.srcEurostat,
            deal.avg.sourceUrl,
            spanned(dealNewSeries),
            deal.avg.apiUrl
          )}
        </p>
        {@render numbersTable(
          countLabel(COPY.mktOpenQuarters, dealNewSeries.points.length),
          COPY.mktTblDealNumbers,
          [COPY.mktColAvgNew, COPY.mktColAvgExisting],
          rowsOf(dealNewSeries, [dealExistingSeries]),
          (v) => (v == null ? "—" : `${fmt0(v)} €`)
        )}
      {/if}

      {@render ourSum(
        {
          bg:
            `Средната сделка е наша сметка: платеното общо, разделено на броя сделки, ` +
            `${fmt0(deal.totalValue)} € върху ${fmt0(deal.deals)} жилища. Това е средна сума за ` +
            `едно жилище, не цена на квадратен метър и не цената по средата на сделките; какво се ` +
            `е продавало, къщи или апартаменти, я движи. Евростат не отговаря за делението, нито ` +
            `за изводите от него.`,
          en:
            `The average deal is our arithmetic: the total paid divided by the number of deals, ` +
            `€${fmt0(deal.totalValue)} over ${fmt0(deal.deals)} dwellings. It is a mean amount ` +
            `paid for a dwelling, not a price per square metre and not the middle price of the ` +
            `quarter's deals; the mix of flats and houses sold moves it. Eurostat are not ` +
            `responsible for the division or for conclusions drawn from it.`,
        },
        deal.avg.derivedFrom
      )}

      <!-- «Колко години заплата струва едно жилище» is the card at the top of
           the page rather than a second one here. It is built from this
           section's own figure and НСИ's wage, and it belongs with the other
           three answers rather than under the working: a reader who has to
           reach the fourth section to learn how many years a home costs has
           been made to earn an answer the page could have given them at the
           top. -->
    {/if}
  </section>

  <!-- 3 ------------------------------------------------------------------ -->
  <section id="volume">
    <h2>
      <span class="l-bg">Колко се търгува</span>
      <span class="l-en">How much changes hands</span>
    </h2>
    <p>
      <span class="l-bg"
        >Евростат брои жилищата (апартаменти и къщи), които домакинствата са купили през
        тримесечието на пазарна цена. Дарения, наследства, продажбите между роднини на занижена цена
        и построеното за себе си остават извън броя.</span
      >
      <span class="l-en"
        >Eurostat count the dwellings households bought during the quarter, flats and houses, bought
        at a market price. Gifts, inheritances, discounted sales between relatives and anything
        built for oneself stay outside the count.</span
      >
    </p>

    {#if volume.deals.value}
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblVolume, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">{@render colHead(COPY.mktColKind, null)}</th>
              <th scope="col" class="num">{@render colHead(COPY.mktColCount, volume.period)}</th>
              <th scope="col" class="num">{@render colHead(COPY.mktColYoy, volume.period)}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowTotal, null)}</th>
              <td class="num mono">{fmt0(volume.deals.value)}</td>
              <td class="num mono">{pct(volume.changePct.value)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowNew, null)}</th>
              <td class="num mono">{fmt0(volume.newBuild)}</td>
              <td class="num mono">{pct(volume.changeNewPct)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowExisting, null)}</th>
              <td class="num mono">{fmt0(volume.existing)}</td>
              <td class="num mono">{pct(volume.changeExistingPct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          volume.deals.sourceUrl,
          when(volume.period),
          volume.deals.apiUrl
        )}
      </p>

      <!-- The volume series, which IS this section's finding. One quarter and a
           percentage state it; the whole series shows the shape it sits in, and
           the shape is what the year-on-year figure is a single reading of.

           Columns start at zero and there is no axis minimum to set: a count
           chart cropped to its own range makes any series look like a cliff,
           and on this subject that is the one distortion the page cannot
           afford. `marketVolumeSeries` offers no `min` for the same reason. -->
      {#if volumeSeries.points.length > 4}
        <!-- The key to the shape, ABOVE the plot it is about.
             The explanation existed and it was underneath, inside the note on
             how the percentage is worked out — so the loudest picture on the
             page was met with nothing, read as a market lurching about twice a
             year, and corrected two paragraphs later for a reader who got that
             far. What the sentence may not do is name a quarter or claim which
             one is weakest: the tint is drawn from the newest reading's own
             place in the year, and it moves with the data. -->
        <p>
          <span class="l-bg"
            >Стълбчетата се редуват високо-ниско всяка година, защото зимата и лятото не се търгуват
            еднакво. Оцветените са едно и също тримесечие всяка година, и точно те се сравняват в
            числото «спрямо година по-рано» отгоре.</span
          >
          <span class="l-en"
            >The columns alternate high and low every year because winter and summer are not traded
            alike. The tinted ones are the same quarter each year, and those are the ones the
            "against a year earlier" figure above compares.</span
          >
        </p>
        {@const volumeAxis = niceTicks(volumeSeries.min, volumeSeries.max)}
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              volumeAxis.values.map((v) => ({
                at: tickAt(v, volumeAxis),
                label: v === 0 ? "0" : fmt0(v),
              }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.mktChartVolume, $lang, {
                from: periodLong(volumeSeries.from, $lang),
                to: periodLong(volumeSeries.to, $lang),
                peak: fmt0(volumeSeries.peak?.value),
                peakAt: periodLong(volumeSeries.peak?.period, $lang),
                last: fmt0(volumeSeries.latest?.value),
              })}
            >
              {@render gridlines(volumeAxis)}
              {@render yearRules(xTicks(volumeSeries))}
              {@render columns(volumeSeries, (v) => `${fmt0(v)}`, volumeAxis, isSameQuarter)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, volumeAxis)}
                x2={CH_W}
                y2={yOf(0, volumeAxis)}
              />
            </svg>
            {@render xYears(xTicks(volumeSeries))}
          </div>
          <figcaption>
            <span class="key season"
              ><span class="l-bg">{COPY.mktKeySeason.bg}</span><span class="l-en"
                >{COPY.mktKeySeason.en}</span
              ></span
            >
          </figcaption>
        </figure>
        <p class="ss tsrc">
          {@render srcLine(
            COPY.srcEurostat,
            volume.deals.sourceUrl,
            spanned(volumeSeries),
            volume.deals.apiUrl
          )}
        </p>
        {@render numbersTable(
          countLabel(COPY.mktOpenQuarters, volumeSeries.points.length),
          COPY.mktTblVolumeNumbers,
          [COPY.mktColSold],
          rowsOf(volumeSeries),
          fmt0
        )}
      {/if}

      {#if volume.changePct.value != null}
        {@render ourSum(
          {
            bg:
              "Промяната спрямо година по-рано е наша сметка: броят за това тримесечие срещу броя " +
              "за същото тримесечие година по-рано. Сравняват се едни и същи тримесечия, а не " +
              "съседни: спадът от лято към зима мери календара, а не пазара.",
            en:
              "The year-on-year change is our arithmetic: this quarter's count against the same " +
              "quarter a year earlier. Like quarters are compared rather than neighbouring ones: " +
              "a summer-to-winter fall measures the calendar rather than the market.",
          },
          volume.changePct.derivedFrom
        )}
      {/if}
    {/if}

    <!-- Both qualifications in one paragraph. They are two readings a figure
         here invites and neither is the other's subject, but four lines of
         quiet type in two blocks read as two things to skip rather than one to
         read — and the register comparison is the one that decides whether a
         reader trusts the rest of the page. -->
    <p class="cap">
      <span class="l-bg"
        >Първата точка на редицата е начало на запис, а не дъно на пазара: преди нея е имало сделки,
        просто не в тази таблица. И това не е броят на всички сделки с имоти: имотният регистър
        вписва и земя, гаражи, магазини и офиси и затова брои чувствително повече за същото
        тримесечие. Двете мерят различни неща и нито едното не е сгрешено.</span
      >
      <span class="l-en"
        >The series' first point is the start of a record rather than a floor in the market: there
        were sales before it, just not in this table. Nor is this a count of all property sales: the
        land register also records land, garages, shops and offices, and so counts considerably more
        for the same quarter. The two measure different things and neither is wrong.</span
      >
    </p>

    <!--
      The two figures a reader has to hold at once, on one row of quarters.

      What people actually argue about is what prices and volume are doing at
      the SAME time, and the two are two sections apart on a page that is
      thousands of pixels tall at 360px. Assembling the answer from two charts
      means carrying a percentage between them, which is a job this page should
      not be leaving to a reader on the one question it is most often asked.

      **It is drawn last, after both its halves have been met.** The lower panel
      is the same series §prices draws whole, over the window the count series
      allows — so a reader arrives here already knowing what that line measures,
      and the pair is one new idea rather than two.

      **ONE ROW OF QUARTERS, TWO SCALES, AND NO SENTENCE JOINING THEM.** The
      window is the intersection of the two records (`marketVolumeAgainstPrices`),
      because two panels stacked claim their columns describe the same quarters.
      The scales stay apart because the two measure different things and one axis
      would flatten the price line against swings four times its size — that is
      a picture of the arrangement rather than of the data. And nothing here says
      one moved the other: the page draws both and stops, which is the same
      refusal the range strip states out loud. A reader with the two in front of
      them can see what they do together and decide what it means.
    -->
    {#if pair.volume.points.length > 4}
      <!-- The lower panel names where it came from, and that is the whole
           repair. It is the series §prices draws over its own full window, cut
           to the quarters the count reaches — so a reader who has already read
           that section meets it twice, and without this clause the second
           meeting is a new chart they have to place. -->
      <p>
        <span class="l-bg"
          >Двете картинки отдолу са за едни и същи тримесечия: горната брои сделките, долната мери
          цените, същата редица, показана цялата в <a href="#prices">«колко струва»</a>, тук само за
          тримесечията, за които има и брой сделки. И двете са промяна спрямо същото тримесечие
          година по-рано, а не ниво, и всяка е със собствена мярка, така че числата им са различни
          по големина.</span
        >
        <span class="l-en"
          >The two charts below are for the same quarters: the top one counts the sales and the
          bottom one measures the prices, the same series drawn in full under
          <a href="#prices">what it costs</a>, here only over the quarters that also have a count.
          Both are a change on the same quarter a year earlier rather than a level, and each keeps
          its own scale, so the two move by very different amounts.</span
        >
      </p>

      {@const volumeChangeAxis = niceTicks(pair.volume.min, pair.volume.max)}
      {@const priceChangeAxis = niceTicks(pair.price.min, pair.price.max)}
      <div class="pair">
        <p class="panel">
          <span class="l-bg">{COPY.mktPanelDeals.bg}</span>
          <span class="l-en">{COPY.mktPanelDeals.en}</span>
        </p>
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              volumeChangeAxis.values.map((v) => ({
                at: tickAt(v, volumeChangeAxis),
                label: v === 0 ? "0" : pctAxis(v),
              }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.mktChartVolumeChange, $lang, {
                from: at(pair.volume.from),
                to: at(pair.volume.to),
                low: pct(pair.volume.trough?.value),
                lowAt: at(pair.volume.trough?.period),
                peak: pct(pair.volume.peak?.value),
                peakAt: at(pair.volume.peak?.period),
                last: pct(pair.volume.latest?.value),
              })}
            >
              {@render gridlines(volumeChangeAxis)}
              {@render yearRules(xTicks(pair.volume))}
              {@render columns(pair.volume, (v) => pct(v), volumeChangeAxis)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, volumeChangeAxis)}
                x2={CH_W}
                y2={yOf(0, volumeChangeAxis)}
              />
            </svg>
          </div>
        </figure>

        <p class="panel">
          <span class="l-bg">{COPY.mktPanelPrices.bg}</span>
          <span class="l-en">{COPY.mktPanelPrices.en}</span>
        </p>
        <!-- The x-axis is drawn once, under the lower panel, because there is
             one row of quarters and two pictures of it. Repeated under the
             upper one it reads as two windows that happen to agree.

             **COLUMNS FROM ZERO, THE MARK THE PANEL ABOVE USES, AND THE SIGN IS
             WHY.** Both panels draw a signed change, and on a signed series the
             reading is which side of zero a quarter falls: a bar states that by
             the side it is on, before a reader has been taught anything, which
             is the argument the city column is drawn on. A line states it only
             by crossing, and this line does not cross today — the record
             Eurostat have published over the count's own window is positive
             throughout, so zero sits on the floor of the box and reads as a
             floor rather than as a line with a far side. The quarter prices
             fall, a line dips and columns turn over.

             It also stops the same series being two kinds of picture: §prices
             draws these quarters as columns, and a reader who meets them again
             here as a line has no way to see that they are the same figures. -->
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              priceChangeAxis.values.map((v) => ({
                at: tickAt(v, priceChangeAxis),
                label: v === 0 ? "0" : pctAxis(v),
              }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.mktChartRate, $lang, {
                from: at(pair.price.from),
                to: at(pair.price.to),
                low: pct(pair.price.trough?.value),
                lowAt: at(pair.price.trough?.period),
                peak: pct(pair.price.peak?.value),
                peakAt: at(pair.price.peak?.period),
                last: pct(pair.price.latest?.value),
              })}
            >
              {@render gridlines(priceChangeAxis)}
              {@render yearRules(xTicks(pair.price))}
              {@render columns(pair.price, (v) => pct(v), priceChangeAxis)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, priceChangeAxis)}
                x2={CH_W}
                y2={yOf(0, priceChangeAxis)}
              />
            </svg>
            {@render xYears(xTicks(pair.price))}
          </div>
          <!-- The key to the rule both panels are drawn against, once, at the
               foot of the pair. Once and not per panel: the paragraph above
               says both are the same kind of change, the two boxes sit in one
               block, and a second copy of it lands between the upper plot and
               the lower panel's own label — two lines of mono, three words
               apart, saying the same thing about two pictures a reader is
               being asked to read as one. -->
          <figcaption>
            <span class="l-bg">{COPY.mktRefZero.bg}</span>
            <span class="l-en">{COPY.mktRefZero.en}</span>
          </figcaption>
        </figure>
      </div>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          pair.volume.sourceUrl,
          spanned(pair.volume),
          pair.volume.apiUrl
        )}
        <span class="sep">·</span>
        {@render srcLine(
          COPY.srcEurostat,
          pair.price.sourceUrl,
          spanned(pair.price),
          pair.price.apiUrl
        )}
      </p>
      {@render numbersTable(
        countLabel(COPY.mktOpenQuarters, pair.volume.points.length),
        COPY.mktTblPairNumbers,
        [COPY.mktColSoldChange, COPY.mktColPriceChange],
        rowsOf(pair.volume, [pair.price]),
        (v) => pct(v)
      )}
      {@render ourSum(
        {
          bg:
            `Горният ред е наша сметка от броя сделки: всяко тримесечие срещу същото тримесечие ` +
            `година по-рано. Долният е числото, което Евростат публикува и не е сметнато тук. ` +
            `Двете редици мерят различни неща и стоят една до друга, за да се видят заедно; ` +
            `нищо на тази страница не твърди, че едното движи другото.`,
          en:
            `The top series is our arithmetic from the counts: each quarter against the same ` +
            `quarter a year earlier. The bottom one is the figure Eurostat publish and is not ` +
            `worked out here. The two measure different things and are drawn together so they ` +
            `can be seen together; nothing on this page claims that either one moves the other.`,
        },
        pair.volume.derivedFrom
      )}
    {/if}
  </section>

  <!-- 4 -----------------------------------------------------------------
       ITS OWN SECTION, AND ITS OWN ENTRY IN THE CONTENTS, because a reader
       looking for their own city needs somewhere to jump to. Folded into the
       section above it, the city table arrives behind that section's charts and
       its disclosures, and the only way to it is to scroll past all of them.

       It is a different subject and a different publisher besides: everything
       above is a national series Eurostat disseminate, and every cell below is
       a cell НСИ published for one city. -->
  <section id="cities">
    <h2>
      <span class="l-bg">Цените и сделките по градове</span>
      <span class="l-en">Prices and sales by city</span>
    </h2>

    {#if cities.cities.length}
      <p>
        <!-- The sparkline column's own head says what it draws. The pair a
             reader gets wrong without a sentence: every cell is a change rather
             than a level, and the left column is a movement in prices rather
             than a price. -->
        <span class="l-bg"
          >НСИ публикува същото движение и за шестте града с над 120 000 жители, а до него и с колко
          се е променил броят на сделките там. Всяко число е промяна спрямо същото тримесечие година
          по-рано, а не ниво: лявата колона казва с колко са се променили цените на сделките, а не
          колко струва едно жилище.</span
        >
        <span class="l-en"
          >NSI publish the same movement for the six cities over 120,000 people, and beside it how
          much the number of sales there changed. Every figure is a change on the same quarter a
          year earlier rather than a level: the left column is how much transaction prices moved,
          not what a home costs.</span
        >
      </p>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The role and the name
           are the other half — a tab stop that announces nothing is worse than
           no tab stop. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblCities, $lang)}>
        <table class="fig-table cities">
          <thead>
            <tr>
              <th scope="col">{@render colHead(COPY.mktColCity, null)}</th>
              <!-- The period belongs to the COLUMN, not to the table. HPI_2.6
                   and HSI_2.4.5 are two files on НСИ's portal and either can be
                   republished first, so a caption naming one quarter for both
                   is a claim about the data rather than a description of it —
                   and it is wrong in the direction nothing catches, because
                   every digit under it stays a digit НСИ published. -->
              <th scope="col" class="num"
                >{@render colHead(COPY.mktColPrice, cities.pricePeriod)}</th
              >
              <th scope="col" class="spark-col">
                <span class="l-bg"
                  >{t(COPY.mktColCityTrend, "bg", {
                    from: periodLong(cities.cities[0]?.priceSeries.from, "bg"),
                  })}</span
                >
                <span class="l-en"
                  >{t(COPY.mktColCityTrend, "en", {
                    from: periodLong(cities.cities[0]?.priceSeries.from, "en"),
                  })}</span
                >
              </th>
              <th scope="col" class="num"
                >{@render colHead(COPY.mktColDeals, cities.dealsPeriod)}</th
              >
              <!-- NOT `.num`: this column holds a drawing rather than a figure,
                   and the two figure columns are found by that class — they are
                   the ones that have to carry a quarter in their head, because
                   they come from two workbooks that are released separately. -->
              <!-- The key lives IN the head, which is the only place it can:
                   below the table it would sit between the table and its source
                   line, and a citation that is not the next element leaves the
                   table reading as uncited. It is also where the reader who
                   needs it is already looking — two dots on a track name
                   nothing on their own. -->
              <th scope="col" class="now-col">
                {@render colHead(COPY.mktColCityNow, null)}
                <!-- The scale, once, in the head — the six rows share it, so it
                     is a property of the column rather than of a row. Both ends
                     and the zero between them: three labels is what 108px holds,
                     and the exact figure for every row is in the two columns
                     either side. -->
                <span class="nowaxis" aria-hidden="true">
                  <span>{pctAxis(cityNowAxis.min)}</span>
                  <span>0</span>
                  <span>{pctAxis(cityNowAxis.max)}</span>
                </span>
                <span class="keys">
                  <span class="key one"
                    ><span class="l-bg">{COPY.mktKeyCityPrice.bg}</span><span class="l-en"
                      >{COPY.mktKeyCityPrice.en}</span
                    ></span
                  >
                  <span class="key two"
                    ><span class="l-bg">{COPY.mktKeyCityDeals.bg}</span><span class="l-en"
                      >{COPY.mktKeyCityDeals.en}</span
                    ></span
                  >
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each cities.cities as c (c.code)}
              <tr>
                <th scope="row">
                  <span class="l-bg">{c.nameBg}</span>
                  <span class="l-en">{c.nameEn}</span>
                </th>
                <!-- And a cell whose own quarter is not its column's carries
                     it. `build_nsi_housing_payload` dates each city row by the
                     newest quarter THAT city has, so a city missing from the
                     latest release keeps the one it was last published in —
                     which is the right thing for the payload to do and a
                     silently mixed column here without this. -->
                <td class="num mono">
                  {pct(c.pricePct)}
                  {#if c.pricePeriod && c.pricePeriod !== cities.pricePeriod}
                    <small class="q">
                      <span class="l-bg">{periodLong(c.pricePeriod, "bg")}</span>
                      <span class="l-en">{periodLong(c.pricePeriod, "en")}</span>
                    </small>
                  {/if}
                </td>
                <td class="spark-col">
                  {@render spark(
                    c.priceSeries,
                    cities.priceScale,
                    t(COPY.mktChartCity, $lang, {
                      city: $lang === "bg" ? c.nameBg : c.nameEn,
                      from: at(c.priceSeries.from),
                      to: at(c.priceSeries.to),
                      last: fmt(c.priceSeries.latest?.value),
                    })
                  )}
                </td>
                <td class="num mono">
                  {pct(c.dealsPct)}
                  {#if c.dealsPeriod && c.dealsPeriod !== cities.dealsPeriod}
                    <small class="q">
                      <span class="l-bg">{periodLong(c.dealsPeriod, "bg")}</span>
                      <span class="l-en">{periodLong(c.dealsPeriod, "en")}</span>
                    </small>
                  {/if}
                </td>
                <!-- The two figures already in the row, drawn on one track.
                     What the numbers cannot do is let a reader compare six
                     cities at a glance — and the thing worth comparing here is
                     the GAP between the two marks, which is the same divergence
                     §volume draws for the country and the only place on the page
                     it exists city by city.

                     **A row whose two cells are not from the same quarter draws
                     nothing.** Two marks on one track assert they describe one
                     quarter; the columns either side may disagree and say so in
                     their own cells, and a picture has nowhere to put that. An
                     em dash is the honest cell — `view/market.js` decides,
                     because a template comparing the periods itself is a claim
                     no test would reach. -->
                <td class="now-col">
                  {#if c.comparable}
                    {@render cityNow(c, cityNowAxis)}
                  {:else}
                    <span class="mono">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          >Промените в цените са от {COPY.srcNsi.bg}, от
          <a href={httpUrl(cities.priceUrl)} target="_blank" rel="noopener"
            >индексът на цените на жилищата по градове</a
          >; броят сделки е от
          <a href={httpUrl(cities.dealsUrl)} target="_blank" rel="noopener"
            >продажбите на жилища по градове</a
          >. Всяка стойност е клетка, която НСИ е публикувал; нищо в тази таблица не е сметнато от
          нас.</span
        >
        <span class="l-en"
          >The price changes are {COPY.srcNsi.en}'s, from
          <a href={httpUrl(cities.priceUrl)} target="_blank" rel="noopener"
            >the house price index by city</a
          >; the sales counts come from
          <a href={httpUrl(cities.dealsUrl)} target="_blank" rel="noopener"
            >dwelling sales by city</a
          >. Every value is a cell NSI published; nothing in this table is computed by us.</span
        >
      </p>
      {@render numbersTable(
        countLabel(COPY.mktOpenCityPrices, cities.cities[0]?.priceSeries.points.length ?? 0),
        COPY.mktTblCityNumbers,
        cities.cities.map((c) => ({ bg: c.nameBg, en: c.nameEn })),
        rowsOf(
          cities.cities[0].priceSeries,
          cities.cities.slice(1).map((c) => c.priceSeries)
        ),
        (v) => pct(v)
      )}
      <!-- The sales history, which НСИ publish per city and the page carried
           without drawing. It has no sparkline column of its own on purpose:
           a fifth column puts the six-city table past a phone's width for a
           second picture of a shorter series, and HSI_2.4.5 starts years after
           the price workbook — so a row of two sparklines would invite a
           comparison across two different windows. The table has room to say
           where each one starts. -->
      {#if cities.cities[0]?.dealsSeries.points.length > 2}
        {@render numbersTable(
          countLabel(COPY.mktOpenCityDeals, cities.cities[0].dealsSeries.points.length),
          COPY.mktTblCityDealNumbers,
          cities.cities.map((c) => ({ bg: c.nameBg, en: c.nameEn })),
          rowsOf(
            cities.cities[0].dealsSeries,
            cities.cities.slice(1).map((c) => c.dealsSeries)
          ),
          (v) => pct(v)
        )}
      {/if}
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Обявената цена и платената цена са различни неща. Обявените цени на кв. м по градове са в
        калкулатора и идват от имот.bg; числата тук са за сделки и идват от Евростат. Цена на
        квадратен метър по сделки за отделен български град не публикува никой, затова тук няма
        такава таблица.</span
      >
      <span class="l-en"
        >An asking price and a paid price are different things. Asking prices per m² by city are in
        the calculator and come from imot.bg; the figures here are transaction figures and come from
        Eurostat. Nobody publishes a transaction price per square metre for an individual Bulgarian
        city, which is why there is no such table here.</span
      >
    </p>
  </section>

  <!-- 5 ------------------------------------------------------------------ -->
  <section id="credit">
    <h2>
      <span class="l-bg">Кой купува с кредит</span>
      <span class="l-en">Who borrows</span>
    </h2>
    <p>
      <span class="l-bg"
        >Числата са дял от хората, а не от домакинствата, и са на една и съща основа: собствениците
        и наемателите правят сто.</span
      >
      <span class="l-en"
        >The figures are shares of people rather than of households, and they are on one and the
        same base: owners and renters make a hundred.</span
      >
    </p>
    <!-- The three tenure states stay ONE sentence: split, they stop reading as
         one set, which is the worked example docs/writing-style.md gives for a
         sentence that has earned its length. -->
    {@render howMade({
      bg:
        `Всяка година част от домакинствата в страната отговарят на едно и също изследване. Наред ` +
        `с останалото ги питат и какво е жилището, в което са: тяхно и изплатено, тяхно, но с ` +
        `кредит по него, или под наем. Евростат публикува резултата. Дяловете са от хората, ` +
        `живеещи в частни домакинства: изследването не стига до домовете за стари хора, ` +
        `общежитията и другите колективни домакинства.`,
      en:
        `Every year a part of the country's households answer the same survey. Among the rest ` +
        `they are asked what the home they are in is: theirs and paid off, theirs but with a loan ` +
        `on it, or rented. Eurostat publish the result. The shares are of the people living in ` +
        `private households: the survey does not reach care homes, halls of residence and other ` +
        `collective households.`,
    })}

    {#if structure.owner.value != null}
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblTenure, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">{@render colHead(COPY.mktColHowLive, null)}</th>
              <th scope="col" class="num"
                >{@render colHead(COPY.mktColShareOfPeople, structure.owner.refPeriod)}</th
              >
            </tr>
          </thead>
          <tbody>
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowOwn, null)}</th>
              <td class="num mono">{fmt(structure.owner.value)}%</td>
            </tr>
            <tr>
              <th scope="row" class="sub">{@render colHead(COPY.mktRowOwnLoan, null)}</th>
              <td class="num mono">{fmt(structure.ownerWithMortgage.value)}%</td>
            </tr>
            <tr>
              <th scope="row" class="sub">{@render colHead(COPY.mktRowOwnNoLoan, null)}</th>
              <td class="num mono">{fmt(structure.ownerNoMortgage.value)}%</td>
            </tr>
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowRent, null)}</th>
              <td class="num mono">{fmt(structure.renter.value)}%</td>
            </tr>
            <tr>
              <th scope="row" class="sub">{@render colHead(COPY.mktRowRentMarket, null)}</th>
              <td class="num mono">{fmt(structure.renterAtMarketPrice.value)}%</td>
            </tr>
            <tr>
              <th scope="row" class="sub">{@render colHead(COPY.mktRowRentReduced, null)}</th>
              <td class="num mono">{fmt(structure.renterReducedOrFree.value)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          structure.owner.sourceUrl,
          when(structure.owner.refPeriod),
          structure.owner.apiUrl
        )}
      </p>

      <!--
        The figure on this page a reader is likeliest to take for a mistake, and
        it is the same repair §volume makes for the land register — «Двете мерят
        различни неща и нито едното не е сгрешено», held in place by
        verify_copy.mjs. A figure that READS as wrong and is right costs the
        page as much as two figures that disagree, and it costs it silently:
        somebody who follows the mortgage market knows how many loans are
        signed, reads a share of the population in the low single digits, and
        concludes the page cannot be trusted about anything else on it.

        BODY COPY rather than a `.cap`, which is the whole point of where it
        sits. The reader who has to be caught here is not the sceptic reading
        11px mono for the method — it is the one who read the row, believed
        their own knowledge over it, and is about to leave. What the sentences
        say is what the figure MEANS, which is what body copy is for.

        WHAT THE ROW MEASURES, and never why the level is what it is. How the
        housing stock came to be owned is a claim no series on this page
        carries and a reader cannot check against anything on it.
      -->
      <p>
        <span class="l-bg"
          >Този ред изглежда невъзможно малък, а не е сгрешен. Той брои хора, а не сделки: колко от
          живеещите в страната имат кредит по жилището си, децата и пенсионерите включително. Новите
          кредити са друго нещо, поток от това колко договора се подписват през годината, и двете
          могат да вървят в различни посоки с години.</span
        >
        <span class="l-en"
          >That row looks impossibly small and it is not wrong. It counts people rather than
          purchases: how many of those living in the country have a loan on their home, children and
          pensioners included. New lending is a different thing, a flow of how many contracts are
          signed in a year, and the two can move in opposite directions for years.</span
        >
      </p>

      <!--
        The renters' own figure, beside the rows that say how many of them there
        are.

        It was the third paragraph from the bottom of §ratio, under two
        indicators that section itself describes as mostly about owners — so the
        one number on the page addressed to the people who pay rent arrived after
        everything addressed to the people who do not, and a reader who stopped
        earlier never met it. Here the share and the price sit together: the
        table says how many rent, and the sentence says what renting did.

        BODY COPY, and the tenure table is why. Every figure around it is a share
        of the population measured once a year by a survey; this one is a price
        measured every month, from a different cube on a different clock. A
        reader who takes it for another row of the table has a monthly index
        filed as an annual share.
      -->
      {#if rent}
        <p>
          <span class="l-bg"
            >За хората от последните три реда цената на жилището е наемът. Той се мери всеки месец,
            а не всяко тримесечие: за {periodLong(rent.refPeriod, "bg")} наемите са {pct(
              rent.value
            )} спрямо същия месец година по-рано. Това е цената на наема, а не цената на жилището, и е
            за всички плащани наеми в страната.</span
          >
          <span class="l-en"
            >For the people in the last three rows the price of housing is the rent. It is measured
            every month rather than every quarter: for {periodLong(rent.refPeriod, "en")} rents are
            {pct(rent.value)} against the same month a year earlier. That is the price of renting rather
            than the price of a home, and it covers every rent actually paid in the country.</span
          >
        </p>
        <p class="ss tsrc">
          {@render srcLine(COPY.srcEurostat, rent.sourceUrl, when(rent.refPeriod), rent.apiUrl)}
        </p>
      {/if}
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Лихвата по нови жилищни кредити, размерът на жилищните кредити в банките и лимитите на БНБ
        са в калкулатора, до ипотечната сметка.</span
      >
      <span class="l-en"
        >The rate on new home loans, the size of the banks' book and the BNB limits are in the
        calculator, next to the mortgage panel.</span
      >
    </p>
  </section>

  <!-- 6 -----------------------------------------------------------------
       ITS OWN SECTION, for the reason §cities has one: a different subject and
       different publishers. Everything in §credit is one survey's shares of the
       population; this is a flow of money, from БНБ's loan book and ЕЦБ's
       monthly lending against Eurostat's transaction value.

       AFTER §credit rather than inside it. That section counts PEOPLE living
       with a loan and says so out loud, ending on «новите кредити са друго
       нещо, поток» — and that sentence has somewhere to lead now. Under one
       heading the two would read as one measurement, which is the failure the
       paragraph there exists to prevent.

       NOTHING HERE SAYS ONE MOVED THE OTHER. The share is drawn and the
       fixation split is linked at the foot; what the pair of them means is the
       reader's (docs/principles.md P6), which is the same refusal the paired
       panels at the end of §volume make.
  -->
  <section id="borrowed">
    <h2>
      <span class="l-bg">Колко от парите са кредит</span>
      <span class="l-en">How much of the money is borrowed</span>
    </h2>
    <!-- The two lines, explained ABOVE the plot. A reader who meets two lines
         with no idea why there are two reads the gap between them as a finding;
         it is the width of the answer, which is a different thing and the one
         the section is honest about.

         IT OPENS ON THE MEASUREMENT, and the heading is what «това» points at.
         A sentence characterising the market before the chart is a claim of
         ours standing where a reader expects one of the publishers'. -->
    <p>
      <span class="l-bg"
        >Това се мери по два начина и те не дават едно число. Едната линия е ръстът на жилищните
        кредити в банките: отпуснатото минус погасеното. Другата е само отпуснатото по нови жилищни
        кредити, без предоговорените стари. Истинското число е между двете.</span
      >
      <span class="l-en"
        >It is measured two ways and the two do not give one figure. One line is the growth in the
        banks' housing loans: what was lent less what was repaid. The other is only what was lent on
        new home loans, with the repriced old ones taken out. The true figure is between the two.</span
      >
    </p>
    {@render howMade({
      bg:
        `Всяко число е за цяла година и за цялата страна. И двете линии се делят на едно и също: ` +
        `платеното от домакинствата за жилища през четирите тримесечия на годината. Линията за ` +
        `ръста дели разликата между жилищните кредити в банките в края на годината и в края на ` +
        `предишната; линията за отпуснатото дели сумата по нови жилищни кредити през годината. ` +
        `Незапълнена година не се показва: плащания за три тримесечия срещу кредити за дванадесет ` +
        `месеца дават число, сгрешено точно с липсващото тримесечие. Текущата година влиза, ` +
        `когато и трите институции я публикуват докрай.`,
      en:
        `Every figure is for a whole year and the whole country. Both lines are divided by the ` +
        `same thing: what households paid for dwellings over the four quarters of that year. The ` +
        `growth line divides the difference between the banks' housing loans at the end of the ` +
        `year and at the end of the one before; the lending line divides what was lent on new ` +
        `home loans during the year. A year that is not full yet is not shown: payments for three ` +
        `quarters against lending for twelve months give a figure wrong by exactly the missing ` +
        `quarter. The current year goes in once all three institutions have published it in full.`,
    })}

    {#if borrowed.net.points.length > 4}
      <!-- ABOVE the plot, the way §volume's tint key is: a mark a reader takes
           wrongly is not repaired by a paragraph they meet after they have taken
           it. Drawn from the data rather than written down, so a record with no
           year below zero carries no sentence about a mark nobody can see. -->
      {#if borrowed.net.min < 0}
        <p>
          <span class="l-bg"
            >Под нулата жилищните кредити в банките са намалели за годината: погасено е повече,
            отколкото е отпуснато.</span
          >
          <span class="l-en"
            >Below zero the banks' housing loans shrank over the year: more was repaid than was
            lent.</span
          >
        </p>
      {/if}
      <!-- ONE scale for the two lines, because they are one quantity counted
           two ways and the gap between them is the reading. Drawn against their
           own maxima the strict count and the broad one would occupy the same
           box and the picture would say they agree. -->
      {@const borrowedScale = {
        min: Math.min(borrowed.net.min, borrowed.gross.min),
        max: Math.max(borrowed.net.max, borrowed.gross.max),
      }}
      {@const borrowedAxis = niceTicks(borrowedScale.min, borrowedScale.max)}
      {@const grid = { n: borrowed.net.span, offset: borrowed.gross.offset }}
      {@const grossFrom = borrowed.gross.points[0]}
      <p class="panel">
        <span class="l-bg">{COPY.mktPanelBorrowed.bg}</span>
        <span class="l-en">{COPY.mktPanelBorrowed.en}</span>
      </p>
      <figure class="chart">
        <div class="plot labelled">
          {@render yAxis(
            borrowedAxis.values.map((v) => ({
              at: tickAt(v, borrowedAxis),
              label: v === 0 ? "0" : shareAxis(v),
            }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
            role="img"
            aria-label={t(COPY.mktChartBorrowed, $lang, {
              from: at(borrowed.net.from),
              to: at(borrowed.net.to),
              low: share(borrowed.net.trough?.value),
              lowAt: at(borrowed.net.trough?.period),
              last: share(borrowed.net.latest?.value),
              grossFrom: at(borrowed.gross.from),
              grossLast: share(borrowed.gross.latest?.value),
            })}
          >
            {@render gridlines(borrowedAxis)}
            {@render yearRules(xTicks(borrowed.net))}
            <path
              class="plot-line second"
              d={path({ ...borrowed.gross, ...borrowedAxis }, CH_H, grid)}
            />
            <path class="plot-line" d={path({ ...borrowed.net, ...borrowedAxis })} />
            <!-- Where the second line's record BEGINS, in the mark `lastPoint`
                 uses for where one ends. A stroke that simply appears in the
                 middle of the box reads as a line the picture cut off; a point
                 says the publisher's own split starts there, which the source
                 line under the plot then dates. -->
            {#if grossFrom}
              <circle
                class="plot-last second"
                cx={lineX(grid.offset, grid.n)}
                cy={yOf(grossFrom.value, borrowedAxis)}
                aria-hidden="true"
              />
            {/if}
            {@render lastPoint({ ...borrowed.gross, ...borrowedAxis }, borrowedAxis, CH_H, true)}
            {@render lastPoint({ ...borrowed.net, ...borrowedAxis }, borrowedAxis, CH_H)}
            {@render dots({ ...borrowed.net, ...borrowedAxis }, share)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, borrowedAxis)}
              x2={CH_W}
              y2={yOf(0, borrowedAxis)}
            />
          </svg>
          {@render sLabels(
            [borrowed.net, borrowed.gross]
              .map((s) => s.points.at(-1))
              .filter(Boolean)
              .map((p) => ({ at: tickAt(p.value, borrowedAxis), label: share(p.value) }))
          )}
          {@render xYears(xTicks(borrowed.net))}
        </div>
        <figcaption>
          <span class="key one"
            ><span class="l-bg">{COPY.mktKeyBorrowedNet.bg}</span><span class="l-en"
              >{COPY.mktKeyBorrowedNet.en}</span
            ></span
          >
          <span class="key two"
            ><span class="l-bg">{COPY.mktKeyBorrowedGross.bg}</span><span class="l-en"
              >{COPY.mktKeyBorrowedGross.en}</span
            ></span
          >
          <span
            ><span class="l-bg">{COPY.mktRefBorrowedZero.bg}</span><span class="l-en"
              >{COPY.mktRefBorrowedZero.en}</span
            ></span
          >
        </figcaption>
      </figure>
      <!-- Three publishers, three source lines, each with its own link. One
           line reading «Евростат, БНБ и ЕЦБ» would offer a reader one URL for a
           figure none of them published. -->
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          borrowed.net.sourceUrl,
          spanned(borrowed.net),
          borrowed.net.apiUrl
        )}
        <span class="sep">·</span>
        {@render srcLine(COPY.srcBnb, borrowed.lenderUrls.net, spanned(borrowed.net))}
        <span class="sep">·</span>
        {@render srcLine(COPY.srcEcbMir, borrowed.lenderUrls.gross, spanned(borrowed.gross))}
      </p>
      {@render numbersTable(
        countLabel(COPY.mktOpenYears, borrowed.net.points.length),
        COPY.mktTblBorrowedNumbers,
        [COPY.mktColBorrowed, COPY.mktColBorrowedGross],
        rowsOf(borrowed.net, [borrowed.gross]),
        share
      )}
      {@render ourSum(
        {
          bg:
            `Двете линии са наша сметка: кредитите са на БНБ и на ЕЦБ, а платеното за жилища, на ` +
            `което ги делим, е на Евростат. Сумите на ЕЦБ преди ` +
            `${periodLong(borrowed.convertedBefore, "bg")} са в лева и се превалутират по ` +
            `официалния курс, преди делението. Евростат не отговаря за делението, нито за ` +
            `изводите от него.`,
          en:
            `Both lines are our arithmetic: the lending is the BNB's and the ECB's, and what was ` +
            `paid for dwellings, which we divide it by, is Eurostat's. The ECB amounts before ` +
            `${periodLong(borrowed.convertedBefore, "en")} are in leva and are converted at the ` +
            `official rate before the division. Eurostat are not responsible for the division or ` +
            `for conclusions drawn from it.`,
        },
        borrowed.derivedFrom
      )}
      <!-- The caveat, beside the figure it changes the reading of: the two sides
           of the division are not two cuts of one population. A reader who takes
           this for a part of a whole has a share that cannot pass 100 and a
           residual that is all savings, and neither is what the digits say. Said
           in what a loan pays for rather than in «двете страни на делението»,
           because the reader who draws that conclusion is the one who has not
           been thinking about the division at all. -->
      <p class="cap">
        <span class="l-bg"
          >Жилищен кредит се тегли и за ремонт, за парцел или за строеж на собствена къща, а
          Евростат брои само купените жилища.</span
        >
        <span class="l-en"
          >A housing loan is also taken out for a renovation, for a plot or to build a house of
          one's own, and Eurostat count only the dwellings that were bought.</span
        >
      </p>
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Каква част от тези кредити са с плаваща лихва пише на
        <a href="/credit/#fixation">страницата за кредитите</a>.</span
      >
      <span class="l-en"
        >What part of those loans carry a floating rate is on
        <a href="/credit/#fixation">the borrowing page</a>.</span
      >
    </p>
  </section>

  <!-- 7 ------------------------------------------------------------------ -->
  <section id="stock">
    <h2>
      <span class="l-bg">Колко жилища преброи преброяването</span>
      <span class="l-en">What the census counted</span>
    </h2>
    <!-- The examples are НСИ's own, from the enumerator's instruction: «Сграда
         за колективно домакинство — интернати, пансиони, манастири, домове за
         отглеждане на деца, домове за стари хора, затвори и други подобни». The
         cube behind the table counts CONVENTIONAL dwellings, so the category
         that sits outside it has to be named the way the publisher names it —
         an example list assembled from the international definition instead
         puts institutions on the page that this census does not enumerate, and
         nothing in the payload can contradict a wrong example. -->
    <!-- TWO KINDS OF TIME ON ONE PAGE, and this is the section where they meet.
         Everything above is a series: a quarter, then the next quarter, each
         one replacing the last. This is a single count, taken once, and it does
         not update — so a reader who has been reading quarters arrives at a
         figure that looks like the newest one and is not. The date is under
         every number here already; what was missing is what KIND of number it
         is, which no date beside a digit can say. The period is rendered from
         the payload rather than written, like every other one on the page. -->
    <p>
      <span class="l-bg"
        >Останалите числа на страницата се мерят всяко тримесечие или всяка година и се сменят с
        новото издание. Това е броене: прави се веднъж и не се обновява, докато не дойде следващото
        преброяване{#if structure.dwellings.refPeriod}; последното е от {periodLong(
            structure.dwellings.refPeriod,
            "bg"
          )} г{/if}. Дотогава никой не брои всички жилища.</span
      >
      <span class="l-en"
        >The other figures on this page are measured every quarter or every year and are replaced by
        the next edition. This is a count: taken once, and not updated until the next census{#if structure.dwellings.refPeriod},
          the last of which was {periodLong(structure.dwellings.refPeriod, "en")}{/if}. Until then
        nobody counts every dwelling there is.</span
      >
    </p>
    <p>
      <span class="l-bg"
        >«Необитавано» значи, че към момента на преброяването жилището не е било постоянен дом на
        никого. Не се пита кой е нощувал там, така че вътре влизат и вилите, и вторите жилища, и
        жилищата на хора в чужбина, а не само наистина празните.</span
      >
      <span class="l-en"
        >"Unoccupied" means the dwelling was nobody's permanent home at the time of the census. Who
        slept there is not the test, so holiday homes, second homes and the homes of people abroad
        are all inside it, not only the genuinely empty ones.</span
      >
    </p>
    {@render howMade({
      bg:
        `Преброяването е единственият път, когато някой брои всички жилища. «Жилище» тук е ` +
        `апартамент или къща със собствен вход; домовете за стари хора, интернатите, манастирите ` +
        `и затворите се описват отделно като «колективни жилища» и в тази таблица ги няма.`,
      en:
        `The census is the only time anybody counts every dwelling there is. "Dwelling" here is a ` +
        `flat or a house with its own entrance; care homes for the elderly, boarding schools, ` +
        `monasteries and prisons are described separately as "collective dwellings" and are not ` +
        `in this table.`,
    })}
    <!-- The heading names the CENSUS rather than the housing stock, because the
         page has no current stock figure and «Колко жилища има» invites a reader
         to take a count from one night years ago as one. The date is under every
         figure; the heading is what a reader skimming the contents reads. -->

    {#if structure.dwellings.value}
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.mktTblStock, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">{@render colHead(COPY.mktColDwelling, null)}</th>
              <th scope="col" class="num"
                >{@render colHead(COPY.mktColHowMany, structure.dwellings.refPeriod)}</th
              >
            </tr>
          </thead>
          <tbody>
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowAllDwellings, null)}</th>
              <td class="num mono">{fmt0(structure.dwellings.value)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowOccupied, null)}</th>
              <td class="num mono">{fmt0(structure.occupied.value)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowUnoccupied, null)}</th>
              <td class="num mono">{fmt0(structure.unoccupied.value)}</td>
            </tr>
            <tr>
              <th scope="row">{@render colHead(COPY.mktRowUnoccupiedShare, null)}</th>
              <td class="num mono">{fmt(structure.unoccupiedPct.value)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          structure.dwellings.sourceUrl,
          when(structure.dwellings.refPeriod),
          structure.dwellings.apiUrl
        )}
      </p>

      <!--
        The share as one bar, under the table it is the fourth row of.

        Two counts and a percentage are three numbers a reader adds up in their
        head to get one picture, and this is the picture: how much of the
        country's dwelling stock was nobody's home. It is drawn from the SHARE
        the wiring computed, not from the two counts again — a bar that did its
        own division could disagree with the row above it.

        AFTER the source line and never between it and the table. The render
        suite finds a table's citation by walking to the element beside it, so a
        drawing dropped in between leaves the table reading as uncited.

        It is deliberately not a `figure.chart`: it draws one reading rather than
        a series, so there is no window to caption, no axis to contain zero and
        no numbers table to publish under it. The table above IS its numbers.
      -->
      {#if structure.unoccupiedPct.value != null}
        <div class="stock">
          <svg
            class="stockbar"
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            role="img"
            aria-label={t(COPY.mktChartStock, $lang, {
              occupied: fmt0(structure.occupied.value),
              unoccupied: fmt0(structure.unoccupied.value),
              share: fmt(structure.unoccupiedPct.value),
            })}
          >
            <rect
              class="stock-occupied"
              x="0"
              y="0"
              width={100 - structure.unoccupiedPct.value}
              height="8"
            >
              <title>{t(COPY.mktStockOccupied, $lang)}: {fmt0(structure.occupied.value)}</title>
            </rect>
            <rect
              class="stock-unoccupied"
              x={100 - structure.unoccupiedPct.value}
              y="0"
              width={structure.unoccupiedPct.value}
              height="8"
            >
              <title>{t(COPY.mktStockUnoccupied, $lang)}: {fmt0(structure.unoccupied.value)}</title>
            </rect>
          </svg>
          <p class="ends cap">
            <span>
              <span class="l-bg">{COPY.mktStockOccupied.bg}</span>
              <span class="l-en">{COPY.mktStockOccupied.en}</span>
              <span class="mono">{fmt0(structure.occupied.value)}</span>
            </span>
            <span>
              <span class="l-bg">{COPY.mktStockUnoccupied.bg}</span>
              <span class="l-en">{COPY.mktStockUnoccupied.en}</span>
              <span class="mono">{fmt0(structure.unoccupied.value)}</span>
            </span>
          </p>
        </div>
      {/if}

      {@render ourSum(
        {
          bg:
            `Делът е наша сметка: необитаваните жилища върху всички жилища от същото ` +
            `преброяване: ${fmt0(structure.unoccupied.value)} върху ` +
            `${fmt0(structure.dwellings.value)}. И двете числа са в таблицата отгоре.`,
          en:
            `The share is our arithmetic: unoccupied dwellings over all the dwellings from ` +
            `the same census: ${fmt0(structure.unoccupied.value)} over ` +
            `${fmt0(structure.dwellings.value)}. Both counts are in the table above.`,
        },
        structure.unoccupiedPct.derivedFrom
      )}
    {/if}
  </section>

  <!-- 8 ------------------------------------------------------------------ -->
  <section id="ratio">
    <h2>
      <span class="l-bg">Скъпо ли е спрямо доходите</span>
      <span class="l-en">Expensive against incomes?</span>
    </h2>
    <!-- The section answers its own heading with ONE indicator, and which one
         is a judgement about what a reader can use. Eurostat also publish a
         price-to-income ratio for Bulgaria and this page drew it: a line, a rule
         at 100, and three paragraphs saying why none of the obvious readings of
         it hold — it stops two years behind everything else here, its
         denominator is a per-head income falling with the population throughout,
         and the 100 it is measured against is recomputed with every edition, so
         every earlier point moves without its year changing. A figure that needs
         all three said before it may be used is one a reader cannot take away,
         and it sat under a heading promising an answer. The cube is still
         published and still gated; nothing on the page reads it. -->
    <p>
      <span class="l-bg"
        >Цената сама по себе си не казва много: тя зависи и от това колко печелят хората. Числото
        отдолу не мери какво струва едно жилище: то брои хората, които дават за жилище над 40% от
        разполагаемия доход на домакинството си.</span
      >
      <span class="l-en"
        >A price on its own says little: it depends on what people earn as well. The figure below
        does not measure what one home costs: it counts the people who spend more than 40% of their
        household's disposable income on housing.</span
      >
    </p>

    <!-- Twenty years of the overburden share, which was one number ------- -->
    {#if overburdenSeries.points.length > 4}
      <!-- The arithmetic before the definition: this is the one plot here
           drawing a ratio, and it fell while the bills in its own numerator
           rose. That the ratio CAN fall while they rise is a property of
           division; that income has outrun them here is a claim about Bulgaria,
           which §ratio does not make (P6). -->
      <p>
        <span class="l-bg"
          >В това число се делят две неща едно на друго: разходите за жилище и разполагаемият доход
          на домакинството. Стълбчето пада, когато разходите заемат по-малка част от дохода, а това
          става и докато самите сметки растат, стига доходът да расте по-бързо от тях. Височината на
          стълбчето не е размерът на сметките.</span
        >
        <span class="l-en"
          >The figure divides one thing by another: what housing costs, and the household's
          disposable income. A bar falls when housing takes a smaller share of that income, and that
          happens while the bills themselves are going up, so long as income goes up faster than
          they do. The height of a bar is not the size of the bills.</span
        >
      </p>
      <!-- **Two denominators, and both have to be named in the same breath.**
           The figure counts PEOPLE — everyone in a household over the line, not
           the households — while the 40% is a share of that HOUSEHOLD's
           disposable income. A label short enough for a card («плащат над 40% от
           дохода си за жилище») can carry at most one of them, and a reader who
           takes the percentage for a share of households has the wrong number by
           a household's worth. So this is a sentence, and the chart beside it is
           the same series a card would have repeated. -->
      <p>
        <span class="l-bg"
          >«Разходи за жилище» тук е всичко около него: ток, парно, вода, поддръжка, застраховка и
          данък; наем за наемателите, а за собствениците с кредит само лихвата, не и главницата.
          Процентът е дял от хората, а не от домакинствата: брои всички, които живеят в домакинство
          над чертата, от хората в частни домакинства{#if overburdenSeries.value != null}, а за
            {periodLong(overburdenSeries.refPeriod, "bg")} те са {fmt(
              overburdenSeries.value
            )}%{/if}. Огромната част от хората живеят в собствено жилище без кредит, така че този
          ред се движи от тези сметки, а не от цените на сделките.</span
        >
        <span class="l-en"
          >"Housing costs" here is everything around the home: electricity, heating, water,
          maintenance, insurance and tax; rent for tenants, and for owners with a loan the interest
          alone, never the capital. The percentage is a share of people rather than of households:
          it counts everyone living in a household over the line, out of the people in private
          households{#if overburdenSeries.value != null}, and for {periodLong(
              overburdenSeries.refPeriod,
              "en"
            )} that is {fmt(overburdenSeries.value)}%{/if}. Most people here live in a home they own
          outright, so this series moves with those bills rather than with transaction prices.</span
        >
      </p>
      {@const overburdenAxis = niceTicks(overburdenSeries.min, overburdenSeries.max, 4)}
      <!-- Subject above the box and direction under it, because a reader who
           scrolled to this chart sees a percentage falling under a heading
           about incomes and reads a cost. Neither may be reachable only
           through the paragraphs. -->
      <p class="panel">
        <span class="l-bg">{COPY.mktPanelOverburden.bg}</span>
        <span class="l-en">{COPY.mktPanelOverburden.en}</span>
      </p>
      <figure class="chart">
        <div class="plot">
          {@render yAxis(
            overburdenAxis.values.map((v) => ({
              at: tickAt(v, overburdenAxis),
              label: v === 0 ? "0" : `${fmt0(v)}%`,
            }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
            role="img"
            aria-label={t(COPY.mktChartOverburden, $lang, {
              from: at(overburdenSeries.from),
              to: at(overburdenSeries.to),
              peak: fmt(overburdenSeries.peak?.value),
              peakAt: at(overburdenSeries.peak?.period),
              low: fmt(overburdenSeries.trough?.value),
              lowAt: at(overburdenSeries.trough?.period),
              last: fmt(overburdenSeries.latest?.value),
            })}
          >
            {@render gridlines(overburdenAxis)}
            {@render yearRules(xTicks(overburdenSeries))}
            {@render columns(overburdenSeries, (v) => `${fmt(v)}%`, overburdenAxis)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, overburdenAxis)}
              x2={CH_W}
              y2={yOf(0, overburdenAxis)}
            />
          </svg>
          {@render xYears(xTicks(overburdenSeries))}
        </div>
        <figcaption>
          <span class="l-bg">{COPY.mktRefOverburdenDown.bg}</span>
          <span class="l-en">{COPY.mktRefOverburdenDown.en}</span>
        </figcaption>
      </figure>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          overburdenSeries.sourceUrl,
          spanned(overburdenSeries),
          overburdenSeries.apiUrl
        )}
      </p>
      {@render numbersTable(
        countLabel(COPY.mktOpenYears, overburdenSeries.points.length),
        COPY.mktTblOverburdenNumbers,
        [COPY.mktColShare],
        rowsOf(overburdenSeries),
        (v) => `${fmt(v)}%`
      )}
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Наемите са при <a href="#credit">таблицата кой как живее</a>, а цените на самите жилища са
        при <a href="#prices">колко струва</a>.</span
      >
      <span class="l-en"
        >Rents are beside <a href="#credit">the table of how people live</a>, and the price of the
        homes themselves is under <a href="#prices">what it costs</a>.</span
      >
    </p>
  </section>

  <p class="onward">
    <span class="l-bg"
      >Как е сметнато всичко останало на сайта е на <a href="/how/">страницата с числата</a>, а
      твоята собствена сметка е в <a href="/">калкулатора</a>.</span
    >
    <span class="l-en"
      >How everything else on the site is worked out is on <a href="/how/">the numbers page</a>, and
      your own arithmetic is in <a href="/">the calculator</a>.</span
    >
  </p>
</main>

<SiteFooter page="market" />

<style>
  /* `.wrap` centres itself and stops at `--maxw`, which is 1120px — a measure
     for the calculator's two-column grid and far too wide for a document. The
     column was capped per SECTION instead, so every heading and every table sat
     against the left edge of a container twice their width and the page read as
     though it had slipped. One column on the main element and the sections
     inherit it.

     **The column is what a FIGURE gets; a sentence gets `--measure` and is
     narrower.** The two were one number, which set every paragraph here 85
     characters wide — a line a reader loses on the way back to the left margin.
     Charts and tables keep the full column, which is the whole point of having
     two. */
  main.market {
    padding: 30px 0 10px;
    max-width: var(--col);
    /* The skip link's target, offset by the same amount the sections are: a
       bare `#main` jump parks the h1 under the 54px sticky header. */
    scroll-margin-top: 64px;
  }
  h1 {
    font-family: var(--serif);
    font-size: var(--fs-title);
    line-height: 1.12;
    letter-spacing: -0.018em;
    margin: 0;
  }
  h2 {
    font-family: var(--serif);
    font-size: var(--fs-h2);
    line-height: 1.2;
    letter-spacing: -0.012em;
    margin: 0 0 10px;
    color: var(--ink);
  }
  section {
    margin-top: 38px;
    padding-top: 20px;
    border-top: 1px solid var(--line);
    scroll-margin-top: 64px;
  }
  p {
    margin: 12px 0 0;
    max-width: var(--measure);
    font-size: var(--fs-lead);
    line-height: 1.62;
    color: var(--ink-2);
  }
  /* A source line is not prose: it is one string of mono at the 11px floor, and
     holding it to the reading measure wraps a period away from the publisher it
     belongs to. It takes the figure's width, because that is what it dates. */
  p.ss {
    max-width: none;
  }
  .lead {
    margin-top: 12px;
  }
  /* The two readings of the index, in words. Marked as the paragraph carrying
     the figures rather than the one explaining them — a reader who takes one
     sentence off this section takes this one. */
  .reading {
    margin-top: 14px;
    padding-left: 12px;
    border-left: 2px solid var(--real);
    color: var(--ink);
  }
  .reading b {
    font-weight: 600;
    white-space: nowrap;
  }
  /* TWO QUIET REGISTERS ON THE PAGE, not four. A qualification is prose a
     reader has to actually read — it is what stops them drawing the wrong
     conclusion from the figure above it — so it is set in the page's own face
     at `--fs-meta`, and only the provenance line under a figure is mono at the
     11px floor. A third quiet size, smaller again, buys room for more words at
     the price of the words being read, and on this page that trade is what
     produced a wall of 11px mono under every figure. */
  .cap,
  .ours {
    margin-top: 8px;
    font-size: var(--fs-meta);
    line-height: 1.55;
    color: var(--muted);
  }
  /* The disclosure that a figure is ours. Marked, not buried: it sits directly
     under the number it is about, in the erode accent the app already uses for
     "this one costs you something to believe". */
  .ours {
    margin-top: 10px;
    padding-left: 10px;
    border-left: 2px solid var(--erode);
  }
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 18px;
    font-family: var(--mono);
    font-size: var(--fs-small);
  }
  /* Every in-text link on the page, in one rule. `section p a` covers body copy
     as well as the quiet registers, because a cross-reference between two
     sections belongs in the sentence that makes it — and an unstyled anchor in
     body copy is the one link on the page a reader cannot tell goes anywhere.
     The `.cap` and `.ours` paragraphs inside a section match both selectors and
     take the same declarations either way. */
  .toc a,
  section p a,
  .cap a,
  .ours a,
  .onward a {
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
  }
  .toc a:hover,
  section p a:hover,
  .cap a:hover,
  .ours a:hover,
  .onward a:hover {
    border-bottom-color: var(--real);
  }
  .onward {
    margin: 34px 0 0;
    font-family: var(--mono);
    font-size: var(--fs-small);
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    /* Wide enough that two tiles' labels do not read as one paragraph now that
       nothing but the gap separates them. */
    gap: 22px;
    align-items: stretch;
    margin-top: 16px;
  }
  .stats:empty {
    display: none;
  }
  /* The answer row. Four cards on one line at the page's own measure and two
     by two at 360px, which is what a 150px basis buys — the summary a reader
     is meant to take in at once has to fit on the screen they are holding, and
     four stacked 190px cards ran to more than a phone shows. */
  .answers {
    margin-top: 20px;
  }
  /* Hung from a rule rather than drawn as a box — `docs/site.md` §"A figure is
     hung from a rule, not drawn in a box" is the argument, and it covers the
     same tile on `/credit/` and in the calculator's strip. */
  .stat {
    flex: 1 1 150px;
    min-width: 0;
    border-top: 2px solid var(--ink);
    padding-top: 11px;
    display: flex;
    flex-direction: column;
  }
  /* `--fs-figure` and not `--fs-h2`: a card's number has to outrank the heading
     of a section carrying four of them, so the two are separate steps. */
  .stat .sv {
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .stat .sl {
    font-size: var(--fs-meta);
    color: var(--ink-2);
    margin-top: 8px;
    line-height: 1.35;
  }
  /* Pinned to the foot, so the source captions line up across a row whatever
     the labels above them wrapped to. */
  .stat .ss {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
  }
  /* The source line is the smallest thing on the page and the one that makes
     the figure above it usable. It stays legible: a provenance caption nobody
     can read is the same as none. */
  .ss {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    line-height: 1.5;
    color: var(--muted);
  }
  .ss a {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px dotted var(--muted);
  }
  .ss a:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
  /* The source line under a table or a chart, rather than inside a card. */
  .tsrc {
    margin-top: 8px;
  }
  .tsrc .sep {
    margin: 0 6px;
  }
  .q-link {
    margin-left: 8px;
    white-space: nowrap;
  }

  /* **The head is separated from the data by a real rule, not by the same
     hairline every row carries.** `--rule` is a ledger line at 5% ink and it
     divides row from row; used for the head as well it made a column label and
     the first cell under it one continuous list, and the place that showed
     worst is where the cell below is a PICTURE — «всяко тримесечие от Q1 2015»
     sat directly on the first sparkline with nothing between them, so the
     caption read as part of the drawing. `--line` is the border the site's own
     cards and header are drawn with, and two pixels of it at the foot of the
     head says where the table's data starts. */
  .fig-table thead th {
    font-weight: 600;
    color: var(--muted);
    font-size: var(--fs-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--line);
  }
  /* …and a column of pictures is a panel rather than a column of cells. The
     rule down its left edge is what makes a sparkline or a bar chart read as
     something drawn INSIDE a cell — without it the marks float between two
     columns of figures and belong to neither. Padded either side so nothing is
     drawn against the border. */
  .fig-table .spark-col,
  .fig-table .now-col {
    border-left: 1px solid var(--rule);
    padding-left: 12px;
  }
  .fig-table thead .spark-col,
  .fig-table thead .now-col {
    border-left: 1px solid var(--line);
  }
  /* The indent is the ONLY thing saying these four rows are parts of the row
     above them, and «от тях» in the label is not enough on its own: a reader
     scanning the column meets four percentages that do not sum to 100 and has
     to work out why. Weight and colour separate a child from a parent; the
     step is what makes it a child of THAT parent. */
  .fig-table tbody th.sub {
    font-weight: 400;
    color: var(--muted);
    padding-left: 20px;
  }
  /* A COLUMN HEAD MAY WRAP; A FIGURE MAY NOT. «Спрямо година по-рано» held on
     one line pushed the three-column volume table 19px past a 360px screen, so
     a table that fits was scrolled sideways to read three numbers — and the
     heading is the one thing in the column with somewhere to go. The cells keep
     `nowrap`: «1 343 368 578 €» broken across two lines is a figure a reader
     has to reassemble. */
  .fig-table thead th.num {
    white-space: normal;
  }
  /* The row a section's headline figure is on. The same `--real-soft` wash
     `/how/` marks the reader's own row with: one row per table, or the mark
  /* A period that belongs to one column, or to one cell that is behind its
     column. Set small and quiet on purpose — it is a qualifier on the figure
     beside it, not a second figure. */
  .q {
    display: block;
    font-family: var(--mono);
    font-size: var(--fs-micro);
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--muted);
  }

  /* A series key is a painted swatch with real area, for the reason the tax
     wedge's is: a zero-height box carrying a border names a series a reader
     cannot match to the plot. */
  .key::before {
    content: "";
    display: inline-block;
    width: 14px;
    height: 3px;
    margin-right: 5px;
    vertical-align: middle;
  }
  .key.one::before {
    background: var(--real);
  }
  /* The token the second line is actually stroked with. A swatch that names a
     colour nowhere on the plot is worse than no swatch: it sends a reader
     looking for a stroke that is not there. */
  .key.two::before {
    background: var(--series-2);
  }
  /* The marked quarters' swatch, drawn at the tint the columns are drawn at, or
     the key names a colour that is nowhere on the plot. Taller than a line
     swatch because what it stands for is a bar. */
  /* The ring on the deflated line's own highest reading. Hollow, in that line's
     colour, with the ground as its stroke so it reads as a ring on the line
     rather than as a third series' marker — the same device `.plot-last` uses
     for the newest point, filled there and open here because one is a value and
     the other is a record. */
  :global(.plot-peak) {
    r: 4.2;
    fill: none;
    stroke: var(--series-2);
    stroke-width: 2;
  }
  .key.peak::before {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: none;
    border: 2px solid var(--series-2);
    vertical-align: -1px;
  }
  /* The break's own swatch: a vertical dotted rule, because that is what the
     mark is. A 14x3 block like the line keys above would name a horizontal
     stroke nowhere on this plot. */
  .key.brk::before {
    width: 0;
    height: 11px;
    border-left: 1px dashed var(--muted);
    vertical-align: -2px;
  }
  .key.season::before {
    background: var(--real);
    opacity: 0.42;
    height: 9px;
  }

  /* The two panels on one row of quarters. The gap between them is small on
     purpose — far enough apart they read as two charts that happen to be near
     each other, which is the reading the shared window exists to prevent. The
     label sits above its own plot rather than under it, so a reader meets the
     name before the picture and the pair is not two unlabelled boxes and two
     captions to match up. */
  .pair {
    margin-top: 12px;
  }
  .pair .chart {
    margin-top: 4px;
  }
  /* THE ONE PLACE ON THIS PAGE WHERE THE GUTTER IS NOT `auto`, and the pair is
     why. Every other plot sizes its label column to its own longest tick, which
     is right for a chart standing alone and wrong for two stacked: two grids
     cannot share an `auto` column, so «−28,3%» over «0» sets one panel's plot
     8px narrower than the other's and the two windows no longer line up. A
     quarter drawn above a different quarter is the one thing the shared window
     exists to prevent, and it would be a CSS accident rather than a wiring one.

     5.5ch holds a whole signed percentage with its sign and its unit — «−100%»
     — which is the widest label either of these axes can produce, since an axis
     tick here is written without a decimal.
     `verify_render_market.mjs` measures the two plot boxes against each other,
     so a label that outgrows this is a red test rather than a picture that has
     quietly stopped being one. */
  .pair .plot {
    grid-template-columns: 5.5ch minmax(0, 1fr);
  }
  /* The panel label is separated from its own plot the same way the table's
     head is separated from its cells: a rule, so the words read as a caption
     ABOUT the box rather than as the top line of it. It runs the full measure
     rather than stopping at the plot's left edge, because the label belongs to
     the whole panel — the axis in the gutter included. Unscoped from `.pair`:
     §ratio's plot is drawn alone and needs the label most. */
  .panel {
    margin-top: 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
    line-height: 1.4;
  }

  /* The census stock as one bar. `preserveAspectRatio="none"` is safe here and
     nowhere else on the page: this draws two widths and no line, no stroke and
     no diagonal, so stretching the box distorts nothing that carries meaning —
     and a bar whose height came from its own aspect ratio would be 8px tall at
     360px and 30px at the full measure. */
  .stock {
    margin-top: 14px;
  }
  .stockbar {
    width: 100%;
    height: 14px;
    display: block;
    border-radius: 3px;
    overflow: hidden;
  }
  .stock-occupied {
    fill: var(--real);
  }
  /* The other side of the same total, in the same hue at less weight — the
     tint the season marks use. NOT `--erode`: that accent means "money leaving
     you" everywhere on this site, and an unoccupied dwelling is a count rather
     than a loss. Which of the two shares is the bad news is exactly the
     question this page does not answer. */
  .stock-unoccupied {
    fill: var(--real);
    opacity: 0.42;
  }
  .stock .ends {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
  }
  .stock .ends .mono {
    font-family: var(--mono);
  }

  /* The numbers under a chart, and the method behind a figure. Both closed,
     both the long form of something short that is already on the page; the
     numbers are a real <table>, because that one is also the WCAG text
     alternative and the only way to read an exact quarter off decades of line.
     ONE affordance for "there is more here" rather than two — a page with two
     kinds of toggle asks a reader to learn which is which before opening one. */
  .numbers,
  .method {
    margin-top: 8px;
  }
  .numbers > summary,
  .method > summary {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--real-ink);
    cursor: pointer;
    padding: 2px 0;
  }
  .numbers > summary:hover,
  .method > summary:hover {
    color: var(--ink);
  }
  .numbers .scroll {
    max-height: 22rem;
    overflow-y: auto;
    margin-top: 6px;
  }
  /* Every chart mark is `.plot-*`, and the prefix is a namespace rather than
     tidiness. Scoped styles reach every element in THIS component, and this
     file also carries the page's furniture — `.cap`, `.num`, `.scroll`,
     `.stat`. A mark that shared one of those names would take its rule and
     draw a chart that renders, looks plausible and is not the data. */
  .plot-bar {
    fill: var(--real);
  }
  /* The quarters that share the newest reading's place in the year. Marked in
     the SAME hue at less weight, never in a second colour: a different colour
     on this page means a different series, and these are the same one. What the
     tint says is "these are the comparable ones", which is a statement about
     the calendar and not about the market. */
  .plot-bar.season {
    fill: var(--real);
    opacity: 0.42;
  }
  /* A break the publisher declared, drawn as a rule through the plot. Quiet on
     purpose: it qualifies the line, it is not a second series. */
  .plot-break {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .fig-table .flag {
    color: var(--muted);
    font-size: var(--fs-micro);
  }
  /* The range strip. A row is a label, a track and a figure, and the track cell
     is what has to hold its width — at 360px the label column takes what it
     needs and the figure column is `nowrap`, so a track with no floor of its
     own is the cell that collapses. 96px is the narrowest a six-position line
     is still readable at, measured at 360. */
  .fig-table.range td.track {
    width: 108px;
    padding-right: 12px;
  }
  .fig-table.range tbody th {
    font-weight: 400;
    padding-right: 12px;
  }
  /* The label is the route to the working. Drawn as the page's other in-text
     links are, so a reader can tell it goes somewhere. */
  .fig-table.range tbody th > a {
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
    font-weight: 500;
  }
  .fig-table.range tbody th > a:hover {
    border-bottom-color: var(--real);
  }
  .fig-table.range .ss {
    display: block;
    margin-top: 3px;
  }
  .fig-table.range .q {
    margin-top: 2px;
  }
  /* The two ends, each under its own end of the track. `width: 108px` is the
     track's own, so the row cannot drift wider than the line it labels. */
  .fig-table.range .ends {
    display: flex;
    justify-content: space-between;
    width: 108px;
    gap: 4px;
  }
  .rng {
    width: 108px;
    height: auto;
    display: block;
    overflow: visible;
  }
  .rng-track {
    stroke: var(--rule);
    stroke-width: 3;
    stroke-linecap: round;
  }
  /* ONE HUE, and the same one on every row. `--real` is the accent every data
     mark on this page is drawn in; `--erode` beside it would mean "this one
     costs you", which is a reading of the position rather than the position. */
  .rng-dot {
    fill: var(--real);
  }

  /* A city's history, in a table cell. `height: auto` keeps the box 1:1 rather
     than stretching to the row — a sparkline drawn with one axis scaled and the
     other not is the distortion `verify_render_strip.mjs` fails a chart for. */
  .spark {
    width: 108px;
    height: auto;
    display: block;
  }
  .spark .plot-line {
    stroke-width: 1.5;
  }
  .spark .plot-base {
    stroke-width: 1;
  }
  .fig-table .spark-col,
  .fig-table .now-col {
    width: 108px;
    padding-right: 12px;
  }
  /* The two marks of one city's quarter. Round, the size the range strip's are,
     and in the page's two series tones — the same pair the chart keys name, so
     a reader meeting a solid accent dot has already been told what it is. */
  .now-price {
    fill: var(--real);
  }
  .now-deals {
    fill: var(--series-2);
  }
  /* Zero, on a column whose whole reading is which side of it a bar falls. Drawn
     LAST, so it sits on top of a bar that crosses it rather than under one, and
     stronger than the ticks either side: it is what the bars are read from, not
     one more gridline. */
  .now-zero {
    stroke: var(--muted);
    stroke-width: 1;
  }
  .now-grid {
    stroke: var(--rule);
    stroke-width: 1;
  }
  /* `preserveAspectRatio="none"` is safe here for the reason it is on the census
     bar and nowhere else: this box draws horizontal lengths and vertical rules
     only, so stretching it distorts nothing that carries a value. It buys a row
     18px tall at every table width instead of one that shrinks with the column.
     */
  .now {
    width: 108px;
    height: 20px;
    display: block;
  }
  /* Both ends of the shared scale and the zero between them, under the head. */
  .fig-table .nowaxis {
    display: flex;
    justify-content: space-between;
    width: 108px;
    margin-top: 4px;
    font-family: var(--mono);
    font-weight: 400;
    letter-spacing: 0;
    color: var(--muted);
  }
  /* The key to that column, laid out as a chart's figcaption is, inside the
     head it belongs to. Lower case and unemphasised against the head above it:
     it names two marks, it is not a second column heading. */
  .fig-table .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    margin-top: 4px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    white-space: nowrap;
  }
</style>
