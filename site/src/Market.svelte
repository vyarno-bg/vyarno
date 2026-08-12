<script>
  /**
   * `/market/` — what is actually happening in Bulgarian property.
   *
   * The fifth route, built like `/how/`: prerendered in both languages, every
   * figure carrying its publisher, the period it describes and a link to the
   * table it came from. **No input on it, ever.** Every derived value takes
   * payloads rather than scalars (`view.js`), so a reader's own salary has no
   * signature to be threaded into and this page cannot drift into a calculator.
   *
   * THE PAGE TAKES NO VIEW ON THE MARKET, and that is a design constraint
   * rather than a tone. Some of these figures point one way and some the other
   * — prices rising while transactions fall, a price-to-income ratio below its
   * own long-run average while rent inflation runs ahead of the headline — and
   * the page's job is to put them where a reader can see all of them at once.
   * It gives the ratio and stops. `verify_copy.mjs` holds it to that with a
   * vocabulary rule, because "describe, do not advise" is easy to agree with
   * and easy to lose one adjective at a time.
   *
   * WHERE A NUMBER COMES FROM IS PART OF THE NUMBER. Under every digit: the
   * publisher, the period, and a link. Where the figure is ours rather than
   * read off a table, the arithmetic is stated in words and the queries that
   * reproduce it are linked — a reader who does not believe a figure should not
   * have to take our word for it, and the people most likely to doubt this page
   * are the ones it is most worth convincing.
   *
   * The words are here and the wiring is in `view.js`, which is the split the
   * rest of the SPA uses: a claim about which payload field feeds which figure
   * is one a test can hold, and an expression inside a `$derived` is not.
   */
  import { onMount } from "svelte";
  import { lang, theme, chooseLang, langHref, toggleTheme } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import DataLate from "./components/DataLate.svelte";
  import { COPY, t } from "./lib/content.js";
  import { loadAll } from "./lib/data.js";
  import { payloadsFor } from "./lib/payloads.js";
  import {
    marketVolume,
    marketAverageDeal,
    marketPriceRate,
    marketStructure,
    marketDealInYearsOfPay,
    marketCities,
    marketNsiNationalRate,
    marketVolumeSeries,
    marketPriceToIncomeSeries,
    marketPriceIndexSeries,
    marketPriceRateSeries,
    marketAverageDealSeries,
    marketOverburdenSeries,
    marketPriceIndexRealSeries,
    dataAge,
    marketIndexReading,
    marketRangeStrip,
    marketRent,
    statusLettersUsed,
  } from "./lib/view.js";
  import { number, integer, percentSigned, periodLong, httpUrl } from "./lib/format.js";
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

  const volume = $derived(marketVolume(data.houseMarket));
  const deal = $derived(marketAverageDeal(data.houseMarket));
  const priceRate = $derived(marketPriceRate(data.houseMarket));
  const structure = $derived(marketStructure(data.houseMarketStructure));
  const yearsOfPay = $derived(marketDealInYearsOfPay(data.houseMarket, data.sectorSalary));
  const cities = $derived(marketCities(data.nsiHousing));
  const nsiNational = $derived(marketNsiNationalRate(data.nsiHousing));
  const volumeSeries = $derived(marketVolumeSeries(data.houseMarket));
  const ptiSeries = $derived(marketPriceToIncomeSeries(data.houseMarketStructure));

  /**
   * The plot box, and the mapping from a published figure to a coordinate in it.
   *
   * Geometry rather than domain math, which is why it is here and not in
   * `mirror.js` — `systemWedgeLadder` draws the same line, returning the rates
   * and leaving the pixels to the component that knows how wide its box is.
   *
   * **`yOf` takes a series and never a pair of bounds, and that is the honesty
   * constraint rather than a convenience.** `plotSeries` clamps `min` at or
   * below zero and offers no way to raise it, so every scale on this page
   * contains zero by construction and there is no floor for a later edit to
   * pass in. A y-axis cropped to a property series' own range turns any of them
   * into a cliff, and this is the page that refuses to tell a reader what to
   * think.
   *
   * **THE BOX IS THE PLOT AND NOTHING ELSE. No axis text may be drawn inside
   * it, and the reason is the phone.** An SVG sized `width: 100%` against a
   * fixed `viewBox` scales its whole coordinate system, TEXT INCLUDED: at a
   * 360px viewport this box renders at 0.56 of the width it is declared in, so
   * an 11px axis label reaches the reader at 6.2px — measured in Chromium, on
   * six charts at once, on the page whose smallest type is the thing that makes
   * every figure above it checkable. Padding for the labels also came out of
   * the same box, so the plot itself was 83px tall on the device most readers
   * arrive on.
   *
   * So the labels are HTML in a grid beside the box (`.plot`), set in the
   * page's own type scale and therefore the same size at every width, and the
   * SVG carries marks only. `tickAt` is the whole join: a tick's height as a
   * percentage of the plot, which is exactly what a percentage means to the
   * gutter cell the grid stretches to the same height.
   */
  const CH_W = 600,
    CH_H = 240;
  const span = (s) => s.max - s.min || 1;
  const yOf = (value, s) => CH_H * (1 - (value - s.min) / span(s));
  /** Evenly across the box, first point on the left edge and last on the right. */
  const lineX = (i, n) => (n > 1 ? (CH_W * i) / (n - 1) : CH_W / 2);
  /** A column occupies its own slot with a gap, so 85 of them still read. */
  const colX = (i, n) => (CH_W / n) * (i + 0.12);
  const colW = (n) => Math.max(0.8, (CH_W / n) * 0.76);
  /** Where a tick sits down the plot, as the percentage its HTML gutter takes. */
  const tickAt = (value, s) => (yOf(value, s) / CH_H) * 100;
  /** The sparkline box, and its own mapping. Small, and drawn 1:1 like the rest. */
  const SP_W = 108,
    SP_H = 26;
  const spY = (value, scale) =>
    2 + (SP_H - 4) * (1 - (value - scale.min) / (scale.max - scale.min || 1));

  const pathOf = (s) =>
    s.points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${lineX(i, s.points.length).toFixed(2)} ${yOf(p.value, s).toFixed(2)}`
      )
      .join(" ");

  /**
   * Every series the page draws, and the ones it draws a table of.
   *
   * Twenty-one years of the official index, twenty of Eurostat's own annual
   * rate, thirty-seven quarters of what a dwelling actually changed hands for
   * and twenty of the overburden share were all in the payloads and none of
   * them reached the page — it rendered the newest reading of each and threw
   * the history away. A single reading of a figure that has swung by fifteen
   * points twice tells a reader almost nothing about it.
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
   * Where the newest reading of each series sits inside that series' own range.
   *
   * The arithmetic is `mirror.js#rangePosition` and the wiring is
   * `view.js#marketRangeStrip`; what is here is the box it is drawn in, the
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
    deals: COPY.mktRangeDeals,
    index: COPY.mktRangeIndex,
    indexReal: COPY.mktRangeIndexReal,
    rate: COPY.mktRangeRate,
    pti: COPY.mktRangePti,
    overburden: COPY.mktRangeOverburden,
  };

  /** The rows of a numbers table: one period, one value per column. */
  const rowsOf = (series, extra = []) =>
    series.points.map((p, i) => ({
      period: p.period,
      values: [p.value, ...extra.map((e) => e.points[i]?.value ?? null)],
      flag: series.flags?.[p.period] ?? null,
    }));

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

<a class="skip" href="#main">
  <span class="l-bg">{COPY.skipK.bg}</span>
  <span class="l-en">{COPY.skipK.en}</span>
</a>

<header class="site">
  <div class="wrap bar">
    <a class="brand" href="/">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="6" width="4" height="14" rx="1" fill="var(--muted)" />
        <rect x="16" y="2" width="4" height="18" rx="1" fill="var(--real)" />
        <path
          d="M6 20 L16 20"
          stroke="var(--real)"
          stroke-width="1.5"
          stroke-dasharray="2 2"
          fill="none"
        />
      </svg>
      <span class="wm">
        <span class="l-bg">Вярно</span>
        <span class="l-en">Vyarno</span>
        <small>
          <span class="l-bg">числата</span>
          <span class="l-en">the numbers</span>
        </small>
      </span>
    </a>
    <div class="controls">
      <a class="pill back l-bg" href={langHref("/", "bg")}>← към калкулатора</a>
      <a class="pill back l-en" href={langHref("/", "en")}>← to the calculator</a>
      <button class="pill" onclick={toggleTheme} aria-label="Toggle theme">
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <a
        class="pill l-bg"
        href={langHref("/market/", "en")}
        hreflang="en"
        aria-label="смени езика"
        onclick={() => chooseLang("en")}>EN</a
      >
      <a
        class="pill l-en"
        href={langHref("/market/", "bg")}
        hreflang="bg"
        aria-label="toggle language"
        onclick={() => chooseLang("bg")}>BG</a
      >
    </div>
  </div>
</header>

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
  <p class="ours">
    <span class="l-bg"
      >{explain.bg}
      {#each urls ?? [] as url, i (url)}
        <a href={httpUrl(url)} target="_blank" rel="noopener">провери {i + 1}</a>&nbsp;
      {/each}
      <a href="/legal/#sources">{COPY.oursMoreK.bg} →</a></span
    >
    <span class="l-en"
      >{explain.en}
      {#each urls ?? [] as url, i (url)}
        <a href={httpUrl(url)} target="_blank" rel="noopener">check {i + 1}</a>&nbsp;
      {/each}
      <a href="/legal/#sources">{COPY.oursMoreK.en} →</a></span
    >
  </p>
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
{#snippet columns(series, label, scale = null)}
  {@const s = scale ?? series}
  {@const n = series.points.length}
  {#each series.points as p, i (p.period)}
    <rect
      class="plot-bar"
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

<!-- The two ends of the window, under the plot they belong to. A series states
     its own span, so nothing here can name a period the data does not reach. -->
{#snippet xAxis(series)}
  <div class="xaxis" aria-hidden="true">
    <span class="plot-tick">{periodLong(series.from, $lang)}</span>
    <span class="plot-tick">{periodLong(series.to, $lang)}</span>
  </div>
{/snippet}

{#snippet dots(series, label)}
  {@const n = series.points.length}
  {#each series.points as p, i (p.period)}
    <!-- An invisible target over each point of a line. A line has no mark to
         put a `<title>` on, and a reader hunting for one quarter of eighty-five
         needs a box wide enough to hit rather than a stroke one pixel wide. -->
    <rect class="plot-hit" x={lineX(i, n) - CH_W / n / 2} y="0" width={CH_W / n} height={CH_H}>
      <title>{p.period}: {label(p.value)}</title>
    </rect>
  {/each}
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
      <line class="plot-ref" x1="0" y1={spY(0, scale)} x2={SP_W} y2={spY(0, scale)} />
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
  The same series as a table a reader can read a figure off.

  Closed by default, because it is the long form and the plot above it is the
  short one — and open on a `#`-linked visit is not something a `<details>` can
  do without script. `cols` are `{bg, en}` pairs; `rows` come from `rowsOf`.
-->
{#snippet numbersTable(open, caption, cols, rows, format, flagged = false)}
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

  <!-- One sentence, and it is short because the four answers under it are what
       a reader came for. At 360px the orientation paragraph this replaced
       pushed the last two cards past the fold, which on a page whose first job
       is to answer four questions is the paragraph costing more than it gives.
       What it said is under the cards instead. -->
  <p class="lead">
    <span class="l-bg"
      >Официалните числа за жилищата в България. Под всяко пише кой го публикува и за кой период е.</span
    >
    <span class="l-en"
      >The official figures for housing in Bulgaria. Under each one is who publishes it and which
      period it describes.</span
    >
  </p>
  <!--
    The four answers, before anything else on the page.

    A reader arriving here wants to know four things and the page made them
    earn all four: is it dearer than it used to be, by how much, really; what
    does one cost in something I can picture; and are people buying. Each was
    reachable — in section two, in section three, in section one — and reaching
    it meant reading a chart. Six sections in, the page then ended on three
    cards whose labels were definitions rather than statements.

    So the summary is at the top and the working is below it, and every card
    still carries its publisher, the period it describes and the query that
    returns it. Nothing here is a figure the page does not go on to show whole.
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
        COPY.mktKTimesReal,
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
    Where today sits inside each series' own record — the whole page, on one
    screen, without a verdict in it.

    THE ANSWER TO "why not one market-health score". Six sections and six charts
    give a reader no way to see everything at once, which is the real complaint,
    and a single composite would answer it by deciding on their behalf which of
    these is the bad news: whose fall counts as good news depends on whether
    they own or are buying, and any weighting of prices, volume, rates and cost
    burden makes that call using credibility that belongs to Eurostat. It would
    also be the one figure on this site nobody can check against anything. So
    every row is one publisher's one series, placed against its own extremes and
    against nothing else, and each links the section that shows the working.

    ONE HUE, and it is `--real` — the accent every data mark on this page is
    already drawn in. Not red-to-green and not a two-ended scale: `--erode`
    means "money leaving you" and `--real` its opposite everywhere else on the
    site, so painting a position in either says which end is the bad end. Drawn
    identically on all six rows, the accent says "this is the reading" and
    nothing more.

    BELOW the answer cards rather than above them. At 360px the four cards
    already end 710px down an 800px screen, so there is no room above them for
    anything at all — and pushing the summary a reader came for off their screen
    to make space for a second one is the trade this strip exists to avoid.
  -->
  {#if rangeStrip.rows.length}
    <p class="lead">
      <span class="l-bg"
        >Всеки от показателите отдолу има своя история. Точката показва къде в нея е последното
        число: най-лявото е най-ниското, което Евростат е публикувал за него, най-дясното —
        най-високото. Нищо тук не се сумира в една обща оценка — показателите мерят различни неща и
        не сочат в една посока.</span
      >
      <span class="l-en"
        >Each of the indicators below has a record of its own. The dot is where the newest reading
        sits in it: the left end is the lowest Eurostat have published for it and the right end the
        highest. Nothing here adds up to a single score — they measure different things and do not
        point one way.</span
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
                <small class="q mono"
                  >{rangeValue(row, row.low)} … {rangeValue(row, row.high)}</small
                >
              </td>
              <td class="num mono">{rangeValue(row, row.value)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="cap">
      <span class="l-bg"
        >Показател, който само расте, стои в десния си край, защото такъв е самият показател, а не
        защото нещо се е случило точно сега. Затова цените са на два реда: единият е това, което
        реално се плаща, другият — същото, но без поскъпването на всичко останало, и точките им не
        са на едно и също място. Всеки показател започва от различна година и всеки ред пише своята
        под името си.</span
      >
      <span class="l-en"
        >An indicator that only ever rises sits at its right end because that is what the indicator
        does, not because of anything happening now. That is why prices are on two rows: one is what
        is actually paid and the other is the same thing with the rise in everything else taken out,
        and their dots are not in the same place. Each one is published from a different year, and
        every row writes its own under its name.</span
      >
    </p>
  {/if}

  <p class="lead">
    <span class="l-bg"
      >Това е отговорът накратко. Всичко под него е сметката: колко жилища се купуват, на каква
      цена, как се движат цените и кой колко тежко плаща за жилището си. Не заемаме страна — числата
      сочат в различни посоки и това е част от отговора. Под всяко число има две връзки: първата
      отваря таблицата на публикуващия, където до нашето число стоят и всички останали мерки от
      същия набор — брой, индекс, месечна и годишна промяна — така че там се вижда и друго число за
      същата държава и същото тримесечие. Втората, «{COPY.mktSrcQuery.bg}», връща точно това, което
      пише тук, и нищо друго.</span
    >
    <span class="l-en"
      >That is the short answer. Everything below it is the working: how many homes change hands, at
      what price, how prices move, and who finds their housing hardest to pay for. We take no side —
      the figures point in different directions and that is part of the answer. Every number carries
      two links: the first opens the publisher's own table, where our figure sits beside every other
      measure in the same dataset — a count, an index, a quarterly and an annual rate — so the same
      country and quarter shows more than one number there. The second, "{COPY.mktSrcQuery.en}",
      returns exactly what is printed here and nothing else.</span
    >
  </p>

  {#if yearsOfPay.value != null}
    {@render ourSum(
      {
        bg:
          `Числата с «×» и това в години са наша сметка, и двете стъпват на публикувани числа. «Колко ` +
          `пъти» е индексът на Евростат, разделен на нивото от ${reading.baseYear} г. — годината, ` +
          `която самият Евростат е взел за начало и е записал като 100. «Колко години заплата» е ` +
          `средната сделка на Евростат, разделена на дванадесет средни месечни заплати на НСИ за ` +
          `всички дейности. Двата файла остават отделни чак до браузъра ти и се срещат едва тук, ` +
          `така че във всеки от тях стоят числата само на един публикуващ орган. Заплатата е ` +
          `брутната, както я публикува НСИ: парите на ръка зависят от данъчната таблица на ` +
          `годината, в която са сметнати — това би вкарало трети закон в сметка между две институции.`,
        en:
          `The multiple and the years figure are our arithmetic, both from published ` +
          `numbers. The multiple is Eurostat's index divided by its ${reading.baseYear} level — ` +
          `the year Eurostat themselves took as the starting point and wrote as 100. The years ` +
          `figure is Eurostat's average transaction divided by twelve of НСИ's published average ` +
          `monthly wages across all activities. The two files stay apart all the way to your ` +
          `browser and meet only here, which is what keeps each of them one publisher's data. ` +
          `The wage is the one before tax and contributions, as НСИ publish it: take-home pay ` +
          `depends on the payroll table of the year that computed it, which would put a third ` +
          `body's law inside a two-publisher ratio.`,
      },
      yearsOfPay.derivedFrom
    )}
  {/if}

  <nav class="toc" aria-label="contents">
    <a href="#volume"
      ><span class="l-bg">колко се търгува</span><span class="l-en">how much changes hands</span></a
    >
    <a href="#prices"
      ><span class="l-bg">колко струва</span><span class="l-en">what it costs</span></a
    >
    <a href="#deal"
      ><span class="l-bg">средната сделка</span><span class="l-en">the average deal</span></a
    >
    <a href="#credit"
      ><span class="l-bg">кой купува с кредит</span><span class="l-en">who borrows</span></a
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
  <section id="volume">
    <h2>
      <span class="l-bg">Колко се търгува</span>
      <span class="l-en">How much changes hands</span>
    </h2>
    <p>
      <span class="l-bg"
        >Евростат брои жилищата, купени от домакинства през тримесечието — апартаменти и къщи, на
        цената, която реално е платена. Броят им се публикува отделно за новото строителство и за
        съществуващите жилища, така че двете движения се виждат поотделно.</span
      >
      <span class="l-en"
        >Eurostat count the dwellings households bought during the quarter — flats and houses, at
        the price actually paid. The count is published separately for new builds and existing
        dwellings, so the two movements can be read apart.</span
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
           percentage state it; thirty-seven quarters show the shape it sits in,
           and the shape is what the year-on-year figure is a single reading of.

           Columns start at zero and there is no axis minimum to set: a count
           chart cropped to its own range makes any series look like a cliff,
           and on this subject that is the one distortion the page cannot
           afford. `marketVolumeSeries` offers no `min` for the same reason. -->
      {#if volumeSeries.points.length > 4}
        <figure class="chart">
          <div class="plot">
            {@render yAxis([
              { at: tickAt(volumeSeries.max, volumeSeries), label: fmt0(volumeSeries.max) },
              { at: tickAt(0, volumeSeries), label: "0" },
            ])}
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
              {@render columns(volumeSeries, (v) => `${fmt0(v)}`)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, volumeSeries)}
                x2={CH_W}
                y2={yOf(0, volumeSeries)}
              />
            </svg>
            {@render xAxis(volumeSeries)}
          </div>
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
              "за същото тримесечие на предходната година, и двете числа така, както са " +
              "публикувани. Спрямо същото тримесечие, а не спрямо предходното, защото сделките " +
              "имат сезонен ритъм и спадът от лято към зима мери календара, а не пазара.",
            en:
              "The year-on-year change is our arithmetic: this quarter's count against the same " +
              "quarter a year earlier, both as published. Against the same quarter rather than " +
              "the last one, because transactions have a seasonal shape and a summer-to-winter " +
              "fall measures the calendar rather than the market.",
          },
          volume.changePct.derivedFrom
        )}
      {/if}
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Редицата започва оттам, откъдето Евростат я публикува. Първата точка е начало на запис, а
        не дъно на пазара — преди нея е имало сделки, просто не в тази таблица. Между тримесечията
        на една и съща година разликата е сезонна и е голяма, затова таблицата сравнява едни и същи
        тримесечия.</span
      >
      <span class="l-en"
        >The series begins where Eurostat publish it from. Its first point is the start of a record
        rather than a floor in the market — there were sales before it, just not in this table.
        Between quarters of one year the difference is seasonal and it is large, which is why the
        table compares like quarters.</span
      >
    </p>
    <p class="cap">
      <span class="l-bg"
        >Това не е броят на всички сделки с имоти. Имотният регистър вписва и продажбите на земя,
        гаражи, магазини и офиси, и затова брои чувствително повече от Евростат за същото
        тримесечие. Двете мерят различни неща и нито едното не е сгрешено.</span
      >
      <span class="l-en"
        >This is not a count of all property sales. The land register also records sales of land,
        garages, shops and offices, and so counts considerably more than Eurostat for the same
        quarter. The two measure different things and neither is wrong.</span
      >
    </p>
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
  <section id="prices">
    <h2>
      <span class="l-bg">Колко струва</span>
      <span class="l-en">What it costs</span>
    </h2>
    <p>
      <span class="l-bg"
        >Първо най-простото: с колко са се променили цените на сделките за една година. Числото е
        това, което Евростат публикува, а не сметка от наша страна. НСИ по едно време смени
        годината, от която се брои, и сам предупреждава, че процент, пресметнат наново през старата
        и новата отправна година, може да се разминава в последния знак с този, който те печатат —
        затова показваме техния.</span
      >
      <span class="l-en"
        >The simplest figure first: how much transaction prices moved in a year. It is the number
        Eurostat publish rather than one we worked out. НСИ at one point changed the year everything
        is counted from, and warn themselves that a rate recomputed across the old and the new
        starting year can differ in the last decimal from the one they print — so the one shown here
        is theirs.</span
      >
    </p>
    <p>
      <span class="l-bg"
        >Едно и също число стига дотук по два пътя: НСИ го изчислява, Евростат го разпространява.
        Затова таблицата има две колони — за да се види, че съвпадат.</span
      >
      <span class="l-en"
        >One figure reaches this page by two routes: НСИ compile it and Eurostat disseminate it. The
        table has two columns so that a reader can see they agree.</span
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
    {/if}

    <!-- The index, twenty-one years of it -------------------------------- -->
    {#if indexSeries.points.length > 8}
      <p>
        <span class="l-bg"
          >Процентът отгоре е за една година. Следващата картинка е за всичките години, които
          Евростат публикува, и мери друго: не с колко са се променили цените за последната година,
          а колко пъти са по-високи от една година, взета за начало. Тази година е {reading.baseYear},
          избрал я е Евростат, и на картинката тя е линията ×1.</span
        >
        <span class="l-en"
          >The percentage above is one year's. The chart below covers every year Eurostat publish
          and measures something else: not how much prices moved in the last year, but how many
          times higher they are than in one year taken as the starting point. That year is {reading.baseYear},
          Eurostat chose it, and on the chart it is the ×1 line.</span
        >
      </p>

      <p>
        <span class="l-bg"
          >Двата реда са едно и също нещо, мерено по два начина, и разликата между тях е причината
          да ги има и двата. Плътният е в парите от деня на сделката — колко пъти повече пари се
          дават за жилище. Пунктираният вади от сметката това, че междувременно е поскъпнало и
          всичко останало, и отговаря на другия въпрос: повече ли са жилищата спрямо всичко друго,
          което купуваме. Евростат публикува и двата реда, нищо тук не е сметнато от нас.</span
        >
        <span class="l-en"
          >The two lines are the same thing measured two ways, and the difference between them is
          the reason both are here. The solid one is in the money of the day — how many times more
          money changes hands for a home. The dashed one takes out the fact that everything else got
          dearer in the meantime, and answers the other question: have homes risen against
          everything else we buy. Eurostat publish both lines; nothing here is computed by us.</span
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
            >В парите от деня жилищата днес струват <b>×{fmt(reading.times)}</b> спрямо {reading.baseYear}
            г. Извади ли се поскъпването на всичко останало, остават
            <b>×{fmt(reading.realTimes)}</b>. {#if reading.realBelowPeakPct != null && reading.realPeakPeriod}
              И още едно нещо, което само вторият ред казва: така мерено, нивото днес е с {fmt(
                reading.realBelowPeakPct
              )}% под най-високото, което Евростат изобщо е отчитал — през {periodLong(
                reading.realPeakPeriod,
                "bg"
              )}.{/if}</span
          >
          <span class="l-en"
            >In the money of the day a home today costs <b>×{fmt(reading.times)}</b> what it did in {reading.baseYear}.
            Take out the rise in everything else and <b>×{fmt(reading.realTimes)}</b> is left. {#if reading.realBelowPeakPct != null && reading.realPeakPeriod}
              And one thing only the second line says: measured that way, today's level is {fmt(
                reading.realBelowPeakPct
              )}% below the highest Eurostat have ever recorded — in {periodLong(
                reading.realPeakPeriod,
                "en"
              )}.{/if}</span
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

      <figure class="chart">
        <div class="plot">
          <!-- The axis is in multiples, which is what makes it readable at all.
               «272,63» names no unit, is anchored to a year somebody picked, and
               connects to nothing a reader has ever paid; «×2,7» is the same
               cell divided by the base the payload declares. The numbers table
               under the chart keeps the published index, because that is the
               figure a sceptic checks against Eurostat. -->
          {@render yAxis([
            { at: tickAt(indexScale.max, indexScale), label: times(indexScale.max) },
            { at: tickAt(indexScale.reference, indexScale), label: times(indexScale.reference, 0) },
            { at: tickAt(0, indexScale), label: "0" },
          ])}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
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
            <line
              class="plot-ref"
              x1="0"
              y1={yOf(indexScale.reference, indexScale)}
              x2={CH_W}
              y2={yOf(indexScale.reference, indexScale)}
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
                    y2={CH_H}
                  >
                    <title>{period}: {t(COPY.mktFlagB, $lang)}</title>
                  </line>
                {/if}
              {/if}
            {/each}
            <path class="plot-line second" d={pathOf({ ...indexRealSeries, ...indexScale })} />
            <path class="plot-line" d={pathOf({ ...indexSeries, ...indexScale })} />
            {@render dots({ ...indexSeries, ...indexScale }, times)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, indexScale)}
              x2={CH_W}
              y2={yOf(0, indexScale)}
            />
          </svg>
          {@render xAxis(indexSeries)}
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
        true
      )}
      <!-- The bridge between the two forms, and it has to be written or the
           page shows «×2,7» and «272,63» for one cell and leaves a reader to
           work out that they are the same figure. The table keeps the published
           form on purpose: an index level is what a sceptic checks against
           Eurostat's own table, and the multiple is what a reader understands. -->
      <p class="cap">
        <span class="l-bg"
          >В таблицата числата стоят така, както ги публикува Евростат — като индекс, където нивото
          от {reading.baseYear} г. е записано като 100. Картинката отгоре показва същите числа, разделени
          на това ниво: за {periodLong(reading.period, "bg")} индексът е {fmt(
            indexSeries.latest?.value
          )}, което е ×{fmt(reading.times)} — второто е изречение, първото не е.</span
        >
        <span class="l-en"
          >In the table the figures are as Eurostat publish them — as an index, with the {reading.baseYear}
          level written as 100. The chart above shows the same figures divided by that level: for {periodLong(
            reading.period,
            "en"
          )} the index is {fmt(indexSeries.latest?.value)}, which is ×{fmt(reading.times)} — the second
          is a sentence and the first is not.</span
        >
      </p>
      {#if flagKey.length}
        <p class="cap flags">
          <span class="l-bg"
            >{COPY.mktFlagsLead.bg}
            {#each flagKey as letter, i (letter)}{i ? " · " : " "}{FLAG_COPY[letter]
                .bg}{/each}</span
          >
          <span class="l-en"
            >{COPY.mktFlagsLead.en}
            {#each flagKey as letter, i (letter)}{i ? " · " : " "}{FLAG_COPY[letter]
                .en}{/each}</span
          >
        </p>
      {/if}

      <!-- The published rate, every quarter there is one ----------------- -->
      {#if rateSeries.points.length > 8}
        <p>
          <span class="l-bg"
            >Същото, но като годишна промяна — числото, което Евростат публикува всяко тримесечие.
            Линията на нулата е «толкова, колкото и преди година». По-ниско стълбче над нея значи
            по-малко поскъпване, а не поевтиняване: цените падат само в тримесечията със стълбче под
            линията.</span
          >
          <span class="l-en"
            >The same thing as an annual change — the figure Eurostat publish each quarter. The line
            at zero is "the same as twelve months ago". A shorter column above it is a smaller rise,
            not a fall: prices fell only in the quarters whose column is below the line.</span
          >
        </p>
        <figure class="chart">
          <div class="plot">
            {@render yAxis([
              { at: tickAt(rateSeries.max, rateSeries), label: pct(rateSeries.max) },
              { at: tickAt(0, rateSeries), label: "0" },
              { at: tickAt(rateSeries.min, rateSeries), label: pct(rateSeries.min) },
            ])}
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
              {@render columns(rateSeries, (v) => pct(v))}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, rateSeries)}
                x2={CH_W}
                y2={yOf(0, rateSeries)}
              />
            </svg>
            {@render xAxis(rateSeries)}
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

    {#if cities.cities.length}
      <p>
        <span class="l-bg"
          >НСИ публикува същото движение и за шестте града с над 120 000 жители, а до него — с колко
          се е променил броят на сделките там. Двете колони са промени, а не нива: лявата казва с
          колко са се променили цените на сделките, не колко струва едно жилище.</span
        >
        <span class="l-en"
          >НСИ publish the same movement for the six cities over 120,000 people, and beside it how
          much the number of sales there changed. Both columns are changes rather than levels: the
          left one is how much transaction prices moved, not what anything costs.</span
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
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          >Промените в цените са от {COPY.srcNsi.bg} —
          <a href={httpUrl(cities.priceUrl)} target="_blank" rel="noopener"
            >индексът на цените на жилищата по градове</a
          >; броят сделки — от
          <a href={httpUrl(cities.dealsUrl)} target="_blank" rel="noopener"
            >продажбите на жилища по градове</a
          >. Периодът стои над всяка колона, защото двете таблици излизат поотделно. Всяка стойност
          е клетка, която НСИ е публикувал; нищо в тази таблица не е сметнато от нас.</span
        >
        <span class="l-en"
          >The price changes are {COPY.srcNsi.en}'s —
          <a href={httpUrl(cities.priceUrl)} target="_blank" rel="noopener"
            >the house price index by city</a
          >; the sales counts come from
          <a href={httpUrl(cities.dealsUrl)} target="_blank" rel="noopener"
            >dwelling sales by city</a
          >. The period sits above each column because the two tables are released separately. Every
          value is a cell НСИ published; nothing in this table is computed by us.</span
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
        квадратен метър по сделки за отделен български град не публикува никой — затова тук няма
        такава таблица.</span
      >
      <span class="l-en"
        >An asking price and a paid price are different things. Asking prices per m² by city are in
        the calculator and come from имот.bg; the figures here are transaction figures and come from
        Eurostat. Nobody publishes a transaction price per square metre for an individual Bulgarian
        city, which is why there is no such table here.</span
      >
    </p>
  </section>

  <!-- 3 ------------------------------------------------------------------ -->
  <section id="deal">
    <h2>
      <span class="l-bg">Средната сделка</span>
      <span class="l-en">The average deal</span>
    </h2>
    <p>
      <span class="l-bg"
        >Евростат публикува колко жилища са купени и колко е платено общо за тях. Едното, разделено
        на другото, дава средната сделка — число, което никой не публикува наготово. Двете числа, от
        които идва, стоят на същия ред, за да може делението да се провери.</span
      >
      <span class="l-en"
        >Eurostat publish how many dwellings were bought and how much was paid for them in total.
        One divided by the other gives the average deal — a figure nobody publishes ready-made. The
        two numbers it comes from are on the same row, so the division can be checked.</span
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

      <!-- The two lines apart, never one line for the total ---------------
           The average deal is a mean over whatever sold that quarter, so a
           TOTAL line moves with the mix of new builds and existing dwellings as
           much as with prices — and a line chart invites exactly the reading
           that mix will not support. Within one purchase type the mix is far
           narrower, and the two drawn on one scale show the gap between them,
           which is what the mix caveat is about. -->
      {#if dealNewSeries.points.length > 4}
        <figure class="chart">
          <div class="plot">
            {@render yAxis([
              { at: tickAt(dealScale.max, dealScale), label: `${fmt0(dealScale.max)} €` },
              { at: tickAt(0, dealScale), label: "0" },
            ])}
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
              <path class="plot-line" d={pathOf({ ...dealNewSeries, ...dealScale })} />
              <path class="plot-line second" d={pathOf({ ...dealExistingSeries, ...dealScale })} />
              {@render dots(dealNewSeries, (v) => `${fmt0(v)} €`)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, dealScale)}
                x2={CH_W}
                y2={yOf(0, dealScale)}
              />
            </svg>
            {@render xAxis(dealNewSeries)}
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
            `Средната сделка е наша сметка: платеното общо за тримесечието, разделено на броя ` +
            `сделки за същото тримесечие — ${fmt0(deal.totalValue)} € върху ${fmt0(deal.deals)} ` +
            `жилища. Това е средната платена сума за едно жилище, а не цена на квадратен метър и ` +
            `не медиана; какво се е продавало през тримесечието — къщи или апартаменти — я движи. ` +
            `Евростат не отговаря за делението, нито за изводите от него.`,
          en:
            `The average deal is our arithmetic: the total paid in the quarter divided by the ` +
            `number of deals in the same quarter — €${fmt0(deal.totalValue)} over ${fmt0(deal.deals)} ` +
            `dwellings. It is a mean amount paid for a dwelling, not a price per square metre and ` +
            `not a median; the quarter's mix of flats and houses moves it. Eurostat are not ` +
            `responsible for the division or for conclusions drawn from it.`,
        },
        deal.avg.derivedFrom
      )}

      <!-- «Колко години заплата струва едно жилище» is the card at the top of
           the page rather than a second one here. It is built from this
           section's own figure and НСИ's wage, and a reader who has just been
           told how many years it costs is the reader already asking what the
           market is doing — which is the order the page is now in. -->
    {/if}
  </section>

  <!-- 4 ------------------------------------------------------------------ -->
  <section id="credit">
    <h2>
      <span class="l-bg">Кой купува с кредит</span>
      <span class="l-en">Who borrows</span>
    </h2>
    <p>
      <span class="l-bg"
        >Всяка година част от домакинствата в страната отговарят на едно и също изследване — за
        доходите си и за това как живеят, а наред с останалото и какво е жилището, в което са: тяхно
        и изплатено, тяхно, но с кредит по него, или под наем. Евростат публикува резултата. Числата
        в таблицата са дял от всички хора в страната и стоят на една и съща основа, за да се
        събират: собствениците и наемателите правят сто. Редът със заема е отговорът на въпроса в
        заглавието, и той е малък ред.</span
      >
      <span class="l-en"
        >Every year a part of the country's households answer the same survey — about their income
        and how they live, and among the rest what the home they are in is: theirs and paid off,
        theirs but with a loan on it, or rented. Eurostat publish the result. The figures in the
        table are shares of everybody in the country, on one and the same base so that they add up:
        owners and renters make a hundred. The row with the loan on it answers the question in the
        heading, and it is a small row.</span
      >
    </p>

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
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Лихвата по нови жилищни кредити, размерът на банковия портфейл и лимитите на БНБ са в
        калкулатора, до ипотечната сметка.</span
      >
      <span class="l-en"
        >The rate on new home loans, the size of the banks' book and the БНБ limits are in the
        calculator, next to the mortgage panel.</span
      >
    </p>
  </section>

  <!-- 5 ------------------------------------------------------------------ -->
  <section id="stock">
    <h2>
      <span class="l-bg">Колко жилища преброи преброяването</span>
      <span class="l-en">What the census counted</span>
    </h2>
    <p>
      <span class="l-bg"
        >Преброяването брои жилищата, а не хората, и е единственият път, когато някой ги брои
        всички. «Жилище» тук значи място, направено да се живее в него — апартамент или къща, със
        собствен вход; общежития, казарми и домове за възрастни се броят отделно и не са в
        таблицата. «Необитавано» значи, че в нощта на преброяването там не е живял никой, така че
        вътре влизат и вилите, и вторите жилища, и жилищата на хора в чужбина — не само празният
        фонд.</span
      >
      <span class="l-en"
        >The census counts dwellings rather than people, and it is the only time anybody counts all
        of them. "Dwelling" here means somewhere built to be lived in — a flat or a house with its
        own entrance; halls of residence, barracks and care homes are counted separately and are not
        in the table. "Unoccupied" means nobody was living there on census night, so holiday homes,
        second homes and the homes of people abroad are all inside it — not only genuinely empty
        stock.</span
      >
    </p>
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

      {@render ourSum(
        {
          bg:
            `Делът е наша сметка: необитаваните жилища върху всички жилища от същото ` +
            `преброяване — ${fmt0(structure.unoccupied.value)} върху ` +
            `${fmt0(structure.dwellings.value)}. И двете числа са в таблицата отгоре.`,
          en:
            `The share is our arithmetic: unoccupied dwellings over all the dwellings from ` +
            `the same census — ${fmt0(structure.unoccupied.value)} over ` +
            `${fmt0(structure.dwellings.value)}. Both counts are in the table above.`,
        },
        structure.unoccupiedPct.derivedFrom
      )}
    {/if}
  </section>

  <!-- 6 ------------------------------------------------------------------ -->
  <section id="ratio">
    <h2>
      <span class="l-bg">Скъпо ли е спрямо доходите</span>
      <span class="l-en">Expensive against incomes?</span>
    </h2>
    <p>
      <span class="l-bg"
        >Цената сама по себе си не казва много: тя зависи и от това колко печелят хората. Затова
        Евростат дели едното на другото и гледа как се движи резултатът. «Доход» тук не е заплата —
        това е всичко, което влиза в домакинствата: заплати, пенсии, помощи и услугите, които
        държавата плаща вместо тях. Общата сума се дели на всички хора в страната, от бебето до
        пенсионера.</span
      >
      <span class="l-en"
        >A price on its own says little: it depends on what people earn as well. So Eurostat divide
        one by the other and watch how the result moves. "Income" here is not a wage — it is
        everything coming into households: wages, pensions, benefits and the services the state pays
        for on their behalf. That total is divided by everyone in the country, from the baby to the
        pensioner.</span
      >
    </p>
    <p>
      <span class="l-bg"
        >Самото съотношение е неудобно число, затова Евростат го записва спрямо неговата собствена
        средна стойност за целия ред: 100 значи «колкото средно е било в България през тези години».
        Под 100 значи, че жилищата вземат по-малка част от дохода, отколкото средно за периода; над
        100 — по-голяма. Мерилото е миналото на самата България. Редът не я сравнява с друга държава
        и не казва нищо за конкретен купувач — той е за съотношението, не за нечий бюджет.</span
      >
      <span class="l-en"
        >The ratio itself is an awkward number, so Eurostat write it against its own average across
        the whole series: 100 means "about what it averaged in Bulgaria over those years". Below 100
        means homes take a smaller part of income than they did on average over the period; above
        100, a larger one. The yardstick is Bulgaria's own past. The series does not compare it with
        anywhere else and says nothing about an individual buyer — it is about the ratio, not about
        anyone's budget.</span
      >
    </p>

    {#if ptiSeries.points.length > 4}
      <!-- The one figure on the page whose meaning is hard to state and easy to
           show. The rule at 100 is the whole indicator, so the axis is built to
           include it: a plot cropped to the data would leave its own reference
           off the top in the years the ratio ran above it, which is every year
           from 2004 to 2010. Zero-based for the same reason the volume chart
           is. -->
      <figure class="chart">
        <div class="plot">
          {@render yAxis([
            { at: tickAt(ptiSeries.reference, ptiSeries), label: "100" },
            { at: tickAt(0, ptiSeries), label: "0" },
          ])}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
            role="img"
            aria-label={t(COPY.mktChartPti, $lang, {
              from: at(ptiSeries.from),
              to: at(ptiSeries.to),
              peak: fmt(ptiSeries.peak?.value),
              peakAt: at(ptiSeries.peak?.period),
              last: fmt(ptiSeries.latest?.value),
            })}
          >
            <line
              class="plot-ref"
              x1="0"
              y1={yOf(ptiSeries.reference, ptiSeries)}
              x2={CH_W}
              y2={yOf(ptiSeries.reference, ptiSeries)}
            />
            <path class="plot-line" d={pathOf(ptiSeries)} />
            {@render dots(ptiSeries, (v) => fmt(v))}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, ptiSeries)}
              x2={CH_W}
              y2={yOf(0, ptiSeries)}
            />
          </svg>
          {@render xAxis(ptiSeries)}
        </div>
        <figcaption>
          <span class="l-bg">{COPY.mktChartRefLine.bg}</span>
          <span class="l-en">{COPY.mktChartRefLine.en}</span>
        </figcaption>
      </figure>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          ptiSeries.sourceUrl,
          spanned(ptiSeries),
          ptiSeries.apiUrl
        )}
      </p>
      {@render numbersTable(
        countLabel(COPY.mktOpenYears, ptiSeries.points.length),
        COPY.mktTblPtiNumbers,
        [COPY.mktColRatio],
        rowsOf(ptiSeries),
        (v) => fmt(v)
      )}
      <p class="cap">
        <span class="l-bg"
          >Този ред спира на {periodLong(ptiSeries.to, "bg")} г., докато другите числа на страницата са
          за {periodLong(priceRate.period, "bg")}. Така го публикува Евростат: показателят излиза
          веднъж годишно и последната година още не е излязла. Показваме последната, която
          съществува, с годината до нея.</span
        >
        <span class="l-en"
          >This series stops at {periodLong(ptiSeries.to, "en")} while the other figures on the page are
          for {periodLong(priceRate.period, "en")}. That is Eurostat's own schedule: the indicator
          comes out once a year and the latest year is not out yet. We show the newest that exists,
          with its year beside it.</span
        >
      </p>
      <p class="cap">
        <span class="l-bg"
          >Две неща за този ред, които не си личат от картинката. Броят хора, на който се дели, е
          намалявал през целия период, така че доходът на човек расте и когато общата сума не расте.
          И средната, спрямо която се мери, се пресмята наново при всяко издание: излезе ли нова
          година, всички предишни точки се разместват, без годината им да се променя.</span
        >
        <span class="l-en"
          >Two things about this series that the picture does not show. The number of people it is
          divided by has fallen throughout the period, so income per head rises even when the total
          does not. And the average it is measured against is worked out afresh with every edition:
          when a new year is added, every earlier point shifts without its year changing.</span
        >
      </p>
    {/if}

    <!-- Twenty years of the overburden share, which was one number ------- -->
    {#if overburdenSeries.points.length > 4}
      <!-- The card this replaced read «6,9% · плащат над 40% от дохода си за
           жилище», and a reader could not tell who «they» were: the figure is a
           share of everybody in the country, while the 40% is of a HOUSEHOLD's
           income. Two denominators in one line, neither of them named. A
           sentence has room to say both, and the chart beside it is the same
           series, so the card was also the picture repeated badly. -->
      <p>
        <span class="l-bg"
          >Другият официален показател брои хората, които живеят в домакинство, даващо над 40% от
          дохода си за жилище. Изследването пита самите домакинства; процентът е дял от всички хора
          в страната{#if overburdenSeries.value != null}, и за {periodLong(
              overburdenSeries.refPeriod,
              "bg"
            )} е {fmt(overburdenSeries.value)}%{/if}. «Разходи за жилище» тук е всичко около него —
          ток, парно, вода, поддръжка и данък, а наем или вноска само за тези, които плащат такива.
          Огромната част от хората в България живеят в собствено жилище без заем, така че този ред
          се движи най-вече от сметките, а не от цените на сделките. И не върви в една посока:
          най-ниското му е {fmt(overburdenSeries.trough?.value)}% през {periodLong(
            overburdenSeries.trough?.period,
            "bg"
          )}, а най-високото — {fmt(overburdenSeries.peak?.value)}% през {periodLong(
            overburdenSeries.peak?.period,
            "bg"
          )}.</span
        >
        <span class="l-en"
          >The other official indicator counts people living in a household that spends more than
          40% of its income on housing. The survey asks the households themselves; the percentage is
          a share of everybody in the country{#if overburdenSeries.value != null}, and for {periodLong(
              overburdenSeries.refPeriod,
              "en"
            )} it is {fmt(overburdenSeries.value)}%{/if}. "Housing costs" here is everything around
          it — electricity, heating, water, maintenance and tax, with rent or a mortgage payment
          only for those who pay one. The great majority of people in Bulgaria live in a home they
          own outright, so this series moves mainly with bills rather than with transaction prices.
          It does not move one way either: its lowest reading is {fmt(
            overburdenSeries.trough?.value
          )}% in {periodLong(overburdenSeries.trough?.period, "en")} and its highest {fmt(
            overburdenSeries.peak?.value
          )}% in {periodLong(overburdenSeries.peak?.period, "en")}.</span
        >
      </p>
      <figure class="chart">
        <div class="plot">
          {@render yAxis([
            {
              at: tickAt(overburdenSeries.max, overburdenSeries),
              label: `${fmt(overburdenSeries.max)}%`,
            },
            { at: tickAt(0, overburdenSeries), label: "0" },
          ])}
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
            {@render columns(overburdenSeries, (v) => `${fmt(v)}%`)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, overburdenSeries)}
              x2={CH_W}
              y2={yOf(0, overburdenSeries)}
            />
          </svg>
          {@render xAxis(overburdenSeries)}
        </div>
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

    <!-- The renters' figure. Two of every fifteen people in the country rent,
         and the two indicators above them are about owners for the most part —
         so a section asking whether housing is dear against incomes that never
         mentioned rent would be answering for the majority and calling it the
         answer. It is the calculator's own line, read here rather than fetched
         again. -->
    {#if rent}
      <p>
        <span class="l-bg"
          >Двата реда отгоре са най-вече за хората със собствено жилище, защото такива са почти
          всички в България. За тези, които плащат наем, официалното число е друго: промяната в
          наемите за {periodLong(rent.refPeriod, "bg")} спрямо същия месец година по-рано е {pct(
            rent.value
          )}. Това е цената на наема, а не цената на жилището, и се мери всеки месец, а не веднъж
          годишно.</span
        >
        <span class="l-en"
          >The two series above are mostly about people who own their home, because almost everyone
          in Bulgaria does. For those who pay rent the official figure is a different one: the
          change in rents for {periodLong(rent.refPeriod, "en")} against the same month a year earlier
          is {pct(rent.value)}. That is the price of renting rather than the price of a home, and it
          is measured every month rather than once a year.</span
        >
      </p>
      <p class="ss tsrc">
        {@render srcLine(COPY.srcEurostat, rent.sourceUrl, when(rent.refPeriod), rent.apiUrl)}
      </p>
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Трите числа в този раздел мерят различни неща и не сочат непременно в една посока: първото
        е цената спрямо доходите на цялата страна, второто — колко хора дават над 40% от дохода си
        за жилището, третото — с колко се променя наемът. Страницата дава и трите и няма да реши
        вместо теб кое тежи повече. Твоята собствена сметка е в калкулатора.</span
      >
      <span class="l-en"
        >The three figures in this section measure different things and need not point the same way:
        the first is price against the whole country's incomes, the second is how many people spend
        over 40% of their income on housing, and the third is how much rent is moving. The page
        gives all three and will not decide for you which weighs more. Your own arithmetic is in the
        calculator.</span
      >
    </p>
  </section>

  <p class="onward">
    <span class="l-bg"
      >Как е сметнато всичко останало на сайта е на <a href="/how/">страницата с числата</a>, а
      твоята собствена сметка — в <a href="/">калкулатора</a>.</span
    >
    <span class="l-en"
      >How everything else on the site is worked out is on <a href="/how/">the numbers page</a>, and
      your own arithmetic is in <a href="/">the calculator</a>.</span
    >
  </p>
</main>

<SiteFooter page="market" />

<style>
  /* `/how/`'s chrome, and deliberately the same one: three pages a reader
     reaches from the same footer row should not each have their own header.
     Sharing the rules rather than the file is not possible — a Svelte
     component's styles are scoped to it. */
  header.site {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--hdr);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  /* The masthead row. Scoped styles reach every element in THIS component, so
     a chart mark named `.bar` would take this `height: 54px` and every column
     on the volume plot would be drawn the same height — a chart that renders,
     looks plausible and is not the data. The plot marks are `.plot-*` for that
     reason and not for tidiness. */
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 54px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 700;
    font-size: var(--fs-h3);
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  .brand .wm {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }
  .brand small {
    font-family: var(--mono);
    font-weight: 500;
    font-size: var(--fs-micro);
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    display: block;
    margin-top: 2px;
  }
  .controls {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    padding: 5px 9px;
    border: 1px solid var(--control-line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }
  .pill:hover {
    border-color: var(--muted);
    color: var(--ink);
  }
  .skip {
    position: absolute;
    left: -999px;
  }
  .skip:focus {
    left: 16px;
    top: 10px;
    z-index: 99;
    background: var(--surface);
    padding: 8px 12px;
    border: 1px solid var(--ink);
    border-radius: 6px;
    color: var(--ink);
    text-decoration: none;
  }

  /* `.wrap` centres itself and stops at `--maxw`, which is 1120px — a measure
     for the calculator's three-column card and far too wide for prose. The
     column was capped per SECTION instead, at 46rem with no auto margin, so
     every heading and every table sat against the left edge of a container
     twice their width and the page read as though it had slipped. One measure
     on the main element, the same 760px `/how/` uses, and the sections inherit
     it. */
  main.market {
    padding: 30px 0 10px;
    max-width: 760px;
    /* The skip link's target, offset by the same amount the sections are: a
       bare `#main` jump parks the h1 under the 54px sticky header. */
    scroll-margin-top: 64px;
  }
  h1 {
    font-family: var(--serif);
    font-size: clamp(1.5625rem, 4vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 0;
  }
  h2 {
    font-family: var(--serif);
    font-size: var(--fs-h3);
    line-height: 1.25;
    margin: 0 0 8px;
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
    font-size: var(--fs-lead);
    line-height: 1.62;
    color: var(--ink-2);
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
  .cap {
    margin-top: 8px;
    font-family: var(--mono);
    font-size: var(--fs-micro);
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
    font-size: var(--fs-meta);
    line-height: 1.55;
    color: var(--muted);
  }
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 18px;
    font-family: var(--mono);
    font-size: var(--fs-small);
  }
  .toc a,
  .cap a,
  .ours a,
  .onward a {
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
  }
  .toc a:hover,
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
    gap: 12px;
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
  .stat {
    flex: 1 1 150px;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 13px 15px;
    display: flex;
    flex-direction: column;
  }
  .stat .sv {
    font-size: var(--fs-h2);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .stat .sl {
    font-size: var(--fs-meta);
    color: var(--ink-2);
    margin-top: 6px;
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

  /* The scroll box sits on the wrapper, so a wide table never makes the page
     body scroll sideways on a phone. IT IS A TAB STOP (`tabindex="0"` in the
     markup): a scroll container is not focusable on its own and no browser
     makes it so, and at 360px the four-column deal table runs past the box
     carrying no link at all — a keyboard-only reader could reach none of it. */
  .scroll {
    overflow-x: auto;
    margin-top: 16px;
  }
  .scroll:focus-visible {
    outline: 2px solid var(--real);
    outline-offset: 2px;
  }
  .fig-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-meta);
  }
  .fig-table th,
  .fig-table td {
    text-align: left;
    padding: 7px 10px 7px 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }
  .fig-table thead th {
    font-weight: 600;
    color: var(--muted);
    font-size: var(--fs-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fig-table tbody th {
    font-weight: 500;
    color: var(--ink);
  }
  .fig-table tbody th.sub {
    font-weight: 400;
    color: var(--muted);
    padding-left: 10px;
  }
  .fig-table td {
    color: var(--ink-2);
  }
  .fig-table .num {
    text-align: right;
    white-space: nowrap;
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
     means nothing. */
  .fig-table tr.mark {
    background: var(--real-soft);
  }
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

  /* Inline SVG, no chart library and no third-party script: `site/package.json`
     declares no runtime dependencies and the CSP the privacy notice rests on
     forbids one. No `preserveAspectRatio="none"` either — the box scales
     uniformly, so a stroke stays the width it was drawn at. */
  .chart {
    margin: 16px 0 0;
  }
  /* The frame: a gutter of labels, the plot, and the window's two ends under
     it. The gutter is `auto`, so it takes the width the longest tick needs and
     the plot takes the rest — a fixed gutter is either too narrow for «22 366»
     or too wide for «0», and both are decided by data nobody controls. */
  .plot {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 8px;
    align-items: stretch;
  }
  /* The grid stretches this cell to the height the plot beside it resolved to,
     which is what lets a tick position itself as a percentage and land on its
     own gridline at every viewport.

     THE TICKS STACK IN ONE CELL AND ARE MOVED WITH `position: relative`, never
     taken out of flow with `position: absolute`. An out-of-flow child
     contributes nothing to its parent's intrinsic width, so the gutter measured
     zero, the plot took the whole measure and every label hung off the left
     edge of the page. Stacked in a single grid area they all still size the
     column — it is as wide as «22 366» needs and no wider — while a percentage
     `top` resolves against this box's stretched height, which is the plot's. */
  .yaxis {
    grid-column: 1;
    display: grid;
    /* ONE ROW, AND IT TAKES THE WHOLE BOX. A relatively positioned grid item
       resolves a percentage `top` against its GRID AREA rather than against the
       container, so a row sized to its own content makes `top: 100%` mean 11px
       — and every tick lands within one line-height of the top of the plot,
       looking like a rendering glitch rather than like a wrong axis. */
    grid-template-rows: 1fr;
    justify-items: end;
    /* …and the items sit at the top of that area rather than stretching to it,
       or `translateY(-50%)` moves each one by half the plot. */
    align-items: start;
  }
  .yaxis .plot-tick {
    grid-area: 1 / 1;
    position: relative;
    transform: translateY(-50%);
    white-space: nowrap;
  }
  .xaxis {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }
  /* The labels are HTML and set in the page's own type, so they are the same
     size at 360px as at 1440. Inside the SVG they were 11px in a box that
     renders at 0.56 of its declared width on a phone — 6.2px, on the captions
     that make every figure above them checkable. */
  .plot-tick {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    line-height: 1;
    color: var(--ink-2);
  }
  /* The box holds marks and no text at all. `overflow: visible` because the
     first and last point of a line sit ON the left and right edges and the
     zero rule on the bottom one, so half of each stroke falls outside. */
  .chart svg.pane {
    grid-column: 2;
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .chart figcaption {
    margin-top: 6px;
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
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
  .key.two::before {
    background: var(--ink-2);
  }

  /* The numbers under a chart. Closed, because it is the long form and the plot
     is the short one; a real <table>, because it is the WCAG text alternative
     and the only way to read one quarter off an eighty-five-quarter line. */
  .numbers {
    margin-top: 8px;
  }
  .numbers > summary {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--real-ink);
    cursor: pointer;
    padding: 2px 0;
  }
  .numbers > summary:hover {
    color: var(--ink);
  }
  .numbers .scroll {
    max-height: 22rem;
    overflow-y: auto;
    margin-top: 6px;
  }
  .plot-bar {
    fill: var(--real);
  }
  .plot-line {
    fill: none;
    stroke: var(--real);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  /* The second series on a shared scale. Dashed and in the neutral ink, never
     the erode accent: `--erode` means "this one costs you something" elsewhere
     on the site and `--real` means the opposite, so drawing one of two
     measurements in either says which one is the bad news. Whose fall is bad
     here depends on whether a reader owns or is buying, and the page does not
     get to decide that. The accent stays on the data line and the erode accent
     stays on a REFERENCE rule, which is a different kind of mark. */
  .plot-line.second {
    stroke: var(--ink-2);
    stroke-dasharray: 5 3;
  }
  /* The hit target over each point of a line. It carries the `<title>` a
     pointer needs and paints nothing — a line has no mark to hang one on, and a
     reader hunting for one quarter of eighty-five needs a box to aim at rather
     than a two-pixel stroke. */
  .plot-hit {
    fill: transparent;
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
  .spark .plot-ref {
    stroke-width: 1;
  }
  .fig-table .spark-col {
    width: 108px;
    padding-right: 12px;
  }
  .plot-axis {
    stroke: var(--muted);
    stroke-width: 1;
  }
  /* The reference is a threshold rather than a gridline, so it is the one
     dashed rule on the plot — the same distinction the tax wedge draws
     between its baseline and the contribution ceiling. */
  .plot-ref {
    stroke: var(--erode);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  @media (max-width: 560px) {
    .brand small {
      display: none;
    }
  }
</style>
