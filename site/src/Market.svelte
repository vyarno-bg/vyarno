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
    statusLettersUsed,
  } from "./lib/view/market.js";
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
  const span = (s) => s.max - s.min || 1;
  /**
   * A value's y in a box `h` tall.
   *
   * The height is a parameter rather than the constant it was, because one
   * plot on the page is drawn taller — and every mark inside it has to be
   * placed in ITS box. A `yOf` that kept the constant would draw the tall
   * chart's data in the top three quarters of its own frame with the zero rule
   * floating above the bottom, which reads as a chart with a cropped axis: the
   * one thing this page's plots may never look like.
   */
  const yOf = (value, s, h = CH_H) => h * (1 - (value - s.min) / span(s));
  /** Evenly across the box, first point on the left edge and last on the right. */
  const lineX = (i, n) => (n > 1 ? (CH_W * i) / (n - 1) : CH_W / 2);
  /** A column occupies its own slot with a gap, so a long series still reads. */
  const colX = (i, n) => (CH_W / n) * (i + 0.12);
  const colW = (n) => Math.max(0.8, (CH_W / n) * 0.76);
  /**
   * Where a tick sits down the plot, as the percentage its HTML gutter takes.
   *
   * The box's height cancels — it is `yOf` over the same `h` — so this is the
   * one geometry helper the tall chart does not have to be told about, and a
   * caller passing the wrong height here could not produce a wrong label.
   */
  const tickAt = (value, s) => (yOf(value, s) / CH_H) * 100;
  /**
   * The years to mark on a time axis, and where each one sits along it.
   *
   * **Two end labels are what a chart has instead of a time axis.** Every plot
   * here spanned decades under «Q1 2005» at one end and «Q1 2026» at the other,
   * and a reader looking at the rise in the middle of one had no way to say
   * when it happened without counting columns. On the two panels drawn together
   * it was worse than unhelpful: the whole reason they share a window is that a
   * column can be carried down onto the line below it, and nothing on either
   * picture said where to carry it to.
   *
   * A year is placed at ITS OWN FIRST POINT rather than at an even fraction of
   * the axis. Those are the same thing only while every year carries a full set
   * of periods, and a series missing one — or starting mid-year — would label
   * the wrong columns while the picture stayed correct.
   *
   * **The step is chosen from the number of years, not from the viewport.** Six
   * labels is what a 360px plot holds without them touching, and twenty-one
   * years of an index at one label each is an unreadable smear at that width —
   * so the same rule that keeps the phone legible thins the desk's axis too,
   * and both get the same picture rather than one getting a second layout to
   * maintain. The steps are the ones a reader reads without decoding: every
   * year, every second, every fifth.
   */
  /**
   * An axis that ends on round numbers, and the values to label along it.
   *
   * **A plot whose axis is labelled only at its own extremes has no scale, it
   * has two captions.** Every chart here drew its highest reading, its lowest
   * and zero — so «29 130» named one column and told a reader nothing about the
   * one beside it, and reading a value off the middle of a plot meant
   * estimating against a number that was not round and did not repeat.
   *
   * So the axis is rounded OUTWARD to the step and the step is one a reader
   * adds in their head: 1, 2, 2.5 or 5 times a power of ten. Rounding out costs
   * a little of the box — an axis to 80% over a series that reaches 65.7% draws
   * the columns slightly shorter — and it buys gridlines that mean something at
   * every height rather than only at three of them.
   *
   * **Zero is a tick by construction and stays one.** `plotSeries` guarantees
   * the range contains zero and every step here divides it, so the rule at the
   * foot of a positive chart and through the middle of a signed one is always
   * labelled — which is the property `verify_render_market.mjs` reads the axis
   * for. Nothing here can crop a scale either: the bounds only ever move
   * outward.
   *
   * @param {number} min  the series' own floor, at or below zero
   * @param {number} max  the series' own ceiling
   * @param {number} [want]  roughly how many intervals to aim for
   */
  const niceTicks = (min, max, want = 5) => {
    const range = max - min || 1;
    const raw = range / want;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalised = raw / magnitude;
    const step =
      magnitude *
      (normalised <= 1
        ? 1
        : normalised <= 2
          ? 2
          : normalised <= 2.5
            ? 2.5
            : normalised <= 5
              ? 5
              : 10);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const values = [];
    // Accumulating `lo + i * step` rather than `v += step`, because a repeated
    // addition of 2.5 or of 0.1 drifts, and the drift lands in a tick LABEL:
    // «12 500,000000001 €» on an axis whose whole purpose is round numbers.
    for (let i = 0; lo + i * step <= hi + step / 1000; i += 1) {
      const v = lo + i * step;
      values.push(Math.abs(v) < step / 1000 ? 0 : v);
    }
    return { min: lo, max: hi, values };
  };

  const YEAR_TICKS_MAX = 6;
  const YEAR_STEPS = [1, 2, 5, 10, 25];
  const xTicks = (series) => {
    const n = series.points.length;
    const years = series.points
      .map((p, i) => ({ year: Number(String(p.period).slice(0, 4)), i }))
      .filter((y, k, all) => Number.isFinite(y.year) && (k === 0 || y.year !== all[k - 1].year));
    if (!years.length) return [];
    const step = YEAR_STEPS.find((s) => Math.ceil(years.length / s) <= YEAR_TICKS_MAX) ?? 50;
    // **Counted back from the NEWEST year, never forward from the oldest.** The
    // two differ whenever the step does not divide the span, and what they
    // differ about is which end goes unlabelled — with a two-year step over ten
    // years, forward from the first leaves the last year off the axis. That is
    // the end this page is about: every figure on it is the newest reading, and
    // an axis whose final label is the year before the data stops asks a reader
    // to count columns to find today.
    const last = years[years.length - 1].year;
    return years
      .filter((y) => (last - y.year) % step === 0)
      .map((y) => ({ year: String(y.year), at: (lineX(y.i, n) / CH_W) * 100 }));
  };

  /** The sparkline box, and its own mapping. Small, and drawn 1:1 like the rest. */
  const SP_W = 108,
    SP_H = 26;
  const spY = (value, scale) =>
    2 + (SP_H - 4) * (1 - (value - scale.min) / (scale.max - scale.min || 1));

  const pathOf = (s, h = CH_H) =>
    s.points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${lineX(i, s.points.length).toFixed(2)} ${yOf(p.value, s, h).toFixed(2)}`
      )
      .join(" ");

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
    deals: COPY.mktRangeDeals,
    dealsChange: COPY.mktRangeDealsChange,
    index: COPY.mktRangeIndex,
    indexReal: COPY.mktRangeIndexReal,
    rate: COPY.mktRangeRate,
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

<SiteHeader page="/market/" tagline={COPY.taglineFigures} />

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
  zero, which the axis line marks, and the reference the publisher defines,
  which is dashed because it is a threshold rather than furniture. Two rules on
  one height paint a heavier line at exactly the place the page means something
  quieter.

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
     gridline is furniture, and this page's only emphatic rules are zero and a
     reference the publisher defines. The first tick is skipped where it sits on
     the left edge, which the plot's own border already marks. -->
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
          `средни за цялата страна — не сметката на конкретен купувач в конкретен град.`,
        en:
          `The multiples and the years figure are our arithmetic, both from published numbers. ` +
          `The wage in them is the one before tax and contributions, as НСИ publish it, and both ` +
          `it and the dwelling are country-wide averages — not any particular buyer's ` +
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
        `данъчната таблица на годината, в която са сметнати — това би вкарало трети закон в ` +
        `сметка между две институции.`,
      en:
        `The multiple is Eurostat's index divided by its ${reading.baseYear} level. The years ` +
        `figure is Eurostat's average transaction divided by twelve of НСИ's published average ` +
        `monthly wages across all activities. The two files meet only here, in your browser, ` +
        `which is what keeps each of them one publisher's data. НСИ's table measures employees ` +
        `under a labour contract, so the self-employed and company owners are not in that ` +
        `average. Take-home pay depends on the payroll table of the year that computed it, ` +
        `which would put a third body's law inside a two-publisher ratio.`,
    })}
  {/if}

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
    <!-- The refusal to score is stated HERE and nowhere else on the page. Six
         positions on six tracks are the one thing on it a reader could take for
         a composite waiting to be totalled, so the sentence declining to total
         them belongs against the picture. -->
    <p class="lead">
      <span class="l-bg"
        >Точката показва къде стои последното измерване в своята история: вляво е най-ниското, което
        Евростат е публикувал, вдясно — най-високото. Числата мерят различни неща и не сочат в една
        посока — не заемаме страна и не ги събираме в обща оценка.</span
      >
      <span class="l-en"
        >The dot is where the newest reading sits in its own record: the left end is the lowest
        Eurostat have published and the right end the highest. The figures measure different things
        and do not point one way — we take no side, and nothing here adds up to a single score.</span
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
         reader who takes the position for news reads five of these six rows
         wrong. Why prices take two rows is on the two rows — the labels are
         «цените на сделките» and the same with the rise in everything else
         taken out — and what the base year IS belongs to §prices, where the ×1
         rule is drawn. -->
    <p class="cap">
      <span class="l-bg"
        >Число, което само расте, винаги стои в десния си край — това е свойство на самата редица, а
        не знак, че точно сега се случва нещо.</span
      >
      <span class="l-en"
        >A figure that only ever rises always sits at the right-hand end — that is a property of the
        series itself, not a sign that something is happening now.</span
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
        `мерки от същия набор: брой, индекс, месечна и годишна промяна — затова за същата ` +
        `държава и същото тримесечие там се вижда повече от едно число. Втората, ` +
        `«${COPY.mktSrcQuery.bg}», връща точно това, което пише тук, и нищо друго.`,
      en:
        `The first opens the publisher's own table. Our figure sits there beside every other ` +
        `measure in the same dataset — a count, an index, a quarterly and an annual rate — so ` +
        `the same country and quarter shows more than one number there. The second, ` +
        `"${COPY.mktSrcQuery.en}", returns exactly what is printed here and nothing else.`,
    },
    COPY.mktHowLinks
  )}

  <nav class="toc" aria-label="contents">
    <a href="#volume"
      ><span class="l-bg">колко се търгува</span><span class="l-en">how much changes hands</span></a
    >
    <a href="#prices"
      ><span class="l-bg">колко струва</span><span class="l-en">what it costs</span></a
    >
    <a href="#cities"><span class="l-bg">по градове</span><span class="l-en">by city</span></a>
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
        >Евростат брои жилищата — апартаменти и къщи — които домакинствата са купили през
        тримесечието на пазарна цена. Дарения, наследства, продажбите между роднини на занижена цена
        и построеното за себе си остават извън броя.</span
      >
      <span class="l-en"
        >Eurostat count the dwellings households bought during the quarter — flats and houses,
        bought at a market price. Gifts, inheritances, discounted sales between relatives and
        anything built for oneself stay outside the count.</span
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
            еднакво. Оцветените са едно и също тримесечие всяка година — и точно те се сравняват в
            числото «спрямо година по-рано» отгоре.</span
          >
          <span class="l-en"
            >The columns alternate high and low every year because winter and summer are not traded
            alike. The tinted ones are the same quarter each year — and those are the ones the
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
              "съседни — спадът от лято към зима мери календара, а не пазара.",
            en:
              "The year-on-year change is our arithmetic: this quarter's count against the same " +
              "quarter a year earlier. Like quarters are compared rather than neighbouring ones " +
              "— a summer-to-winter fall measures the calendar rather than the market.",
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
        >Първата точка на редицата е начало на запис, а не дъно на пазара — преди нея е имало
        сделки, просто не в тази таблица. И това не е броят на всички сделки с имоти: имотният
        регистър вписва и земя, гаражи, магазини и офиси и затова брои чувствително повече за същото
        тримесечие. Двете мерят различни неща и нито едното не е сгрешено.</span
      >
      <span class="l-en"
        >The series' first point is the start of a record rather than a floor in the market — there
        were sales before it, just not in this table. Nor is this a count of all property sales: the
        land register also records land, garages, shops and offices, and so counts considerably more
        for the same quarter. The two measure different things and neither is wrong.</span
      >
    </p>

    <!--
      The two figures a reader has to hold at once, on one row of quarters.

      They were both on this page and 1,700px apart at 360px: how many changed
      hands is this section and what they changed hands for is the next one, and
      what people actually argue about is what the two are doing at the same
      time. Assembling that meant scrolling between two charts and remembering a
      percentage, which is a job the page was leaving to the reader on the one
      question it is most often asked.

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
      <p>
        <span class="l-bg"
          >Двете картинки отдолу са за едни и същи тримесечия: горната брои сделките, долната мери
          цените. И двете са промяна спрямо същото тримесечие година по-рано, а не ниво, и всяка е
          със собствена мярка — числата им са различни по големина.</span
        >
        <span class="l-en"
          >The two charts below are for the same quarters: the top one counts the sales and the
          bottom one measures the prices. Both are a change on the same quarter a year earlier
          rather than a level, and each keeps its own scale — the two move by very different
          amounts.</span
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
             upper one it reads as two windows that happen to agree. -->
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
              <path class="plot-line" d={pathOf({ ...pair.price, ...priceChangeAxis })} />
              {@render dots({ ...pair.price, ...priceChangeAxis }, (v) => pct(v))}
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
            `година по-рано. Долният е числото, което Евростат публикува — не е сметнато тук. ` +
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

  <!-- 2 ------------------------------------------------------------------ -->
  <section id="prices">
    <h2>
      <span class="l-bg">Колко струва</span>
      <span class="l-en">What it costs</span>
    </h2>
    <p>
      <span class="l-bg"
        >Първо най-простото: с колко са се променили цените на сделките за една година. Числото е на
        Евростат, а не сметка от наша страна.</span
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
          `разпространява — затова таблицата има две колони, за да се види, че съвпадат. Нито ` +
          `едната не е наша сметка от индекса. НСИ са сменяли базата му — годината, приравнена ` +
          `на 100 — и процент, пресметнат наново през старата и през новата, може да се ` +
          `разминава с публикувания в последния знак.`,
        en:
          `One figure reaches this page by two routes: НСИ compile it and Eurostat disseminate ` +
          `it, so the table has two columns and a reader can see they agree. Neither is worked ` +
          `out here from the index. НСИ have changed its base — the year set to 100 — and a rate ` +
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
          >Процентът отгоре е за една година. Картинката отдолу мери друго — колко пъти са по-високи
          цените от една година, взета за мерило. Тази година е {reading.baseYear} и на картинката е линията
          ×1. Тя е мерилото, а не началото на редицата, затова вляво от нея има точки под ×1: тогава жилищата
          са стрували по-малко.</span
        >
        <span class="l-en"
          >The percentage above is one year's. The chart below measures something else — how many
          times higher prices are than one year taken as the yardstick. That year is {reading.baseYear},
          and on the chart it is the ×1 line. It is the yardstick rather than the start of the
          record, which is why there are points below ×1 to the left of it: homes cost less then.</span
        >
      </p>

      <p>
        <span class="l-bg"
          >Двата реда мерят едно и също по два начина. Плътният брои пари — колко пъти повече пари
          се дават за жилище. Но парите междувременно купуват по-малко от всичко; пунктираният маха
          точно това и отговаря на другия въпрос: поскъпнали ли са жилищата повече от всичко друго,
          което купуваме. Евростат публикува и двата.</span
        >
        <span class="l-en"
          >The two lines measure the same thing two ways. The solid one counts money — how many
          times more of it changes hands for a home. But money buys less of everything than it did;
          the dashed one takes exactly that out and answers the other question: have homes got
          dearer than everything else we buy. Eurostat publish both.</span
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
            г. Но и всичко останало поскъпна — спрямо него жилищата са
            <b>×{fmt(reading.realTimes)}</b> по-скъпи.
            {#if reading.realBelowPeakPct != null && reading.realPeakPeriod}
              Така мерено, нивото днес е с {fmt(reading.realBelowPeakPct)}% под най-високото, което
              Евростат е отчитал — през {periodLong(reading.realPeakPeriod, "bg")}.{/if}</span
          >
          <span class="l-en"
            >A home today takes <b>×{fmt(reading.times)}</b> as much money as it did in {reading.baseYear}.
            But everything else got dearer too — against that, homes are
            <b>×{fmt(reading.realTimes)}</b> dearer.
            {#if reading.realBelowPeakPct != null && reading.realPeakPeriod}
              Measured that way, today's level is {fmt(reading.realBelowPeakPct)}% below the highest
              Eurostat have recorded — in {periodLong(reading.realPeakPeriod, "en")}.{/if}</span
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
        <div class="plot">
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
              class="plot-ref"
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
              d={pathOf({ ...indexRealSeries, ...indexAxis }, CH_TALL)}
            />
            <path class="plot-line" d={pathOf({ ...indexSeries, ...indexAxis }, CH_TALL)} />
            {@render dots({ ...indexSeries, ...indexAxis }, times, CH_TALL)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, indexAxis, CH_TALL)}
              x2={CH_W}
              y2={yOf(0, indexAxis, CH_TALL)}
            />
          </svg>
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
            `Числата са както ги публикува Евростат — индекс, в който средното за ` +
            `${reading.baseYear} г. е 100; картинката отгоре показва същите числа, разделени на ` +
            `това 100. Втората колона е разделена и на дефлатора за крайното потребление на ` +
            `домакинствата — роднина на инфлацията, която този сайт показва, но не същият ред.` +
            (flagKey.length
              ? ` ${COPY.mktFlagsLead.bg} ${flagKey.map((l) => FLAG_COPY[l].bg).join(" · ")}`
              : ""),
          en:
            `The figures are as Eurostat publish them — an index with the average for ` +
            `${reading.baseYear} written as 100; the chart above shows the same figures divided ` +
            `by that 100. The second column is divided by the national accounts deflator for ` +
            `household final consumption as well — a near relative of the inflation figure this ` +
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
            >Същото, но като годишна промяна — числото, което Евростат публикува всяко тримесечие.
            По-ниско стълбче над нулата значи по-малко поскъпване, а не поевтиняване: цените падат
            само в тримесечията със стълбче под линията.</span
          >
          <span class="l-en"
            >The same thing as an annual change — the figure Eurostat publish each quarter. A
            shorter column above the zero line is a smaller rise, not a fall: prices fell only in
            the quarters whose column is below it.</span
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

  <!-- 2b -----------------------------------------------------------------
       Its own section, because section two had grown into the longest on the
       page: two publishers' rate table, the index chart with two lines and a
       disclosure of every quarter behind it, the annual rate chart with another,
       and then six cities with two more — read end to end, the city table
       arrives after four charts and a reader looking for their own city has no
       way to jump to it. It is also a different subject and a different publisher:
       everything above is Eurostat's national series, and every cell below is a
       cell НСИ published for one city. -->
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
          >НСИ публикува същото движение и за шестте града с над 120 000 жители, а до него — с колко
          се е променил броят на сделките там. Всяко число е промяна спрямо същото тримесечие година
          по-рано, а не ниво: лявата колона казва с колко са се променили цените на сделките, а не
          колко струва едно жилище.</span
        >
        <span class="l-en"
          >НСИ publish the same movement for the six cities over 120,000 people, and beside it how
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
          >Промените в цените са от {COPY.srcNsi.bg} —
          <a href={httpUrl(cities.priceUrl)} target="_blank" rel="noopener"
            >индексът на цените на жилищата по градове</a
          >; броят сделки — от
          <a href={httpUrl(cities.dealsUrl)} target="_blank" rel="noopener"
            >продажбите на жилища по градове</a
          >. Всяка стойност е клетка, която НСИ е публикувал; нищо в тази таблица не е сметнато от
          нас.</span
        >
        <span class="l-en"
          >The price changes are {COPY.srcNsi.en}'s —
          <a href={httpUrl(cities.priceUrl)} target="_blank" rel="noopener"
            >the house price index by city</a
          >; the sales counts come from
          <a href={httpUrl(cities.dealsUrl)} target="_blank" rel="noopener"
            >dwelling sales by city</a
          >. Every value is a cell НСИ published; nothing in this table is computed by us.</span
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
        >Евростат публикува колко жилища са купени и колко е платено общо за тях — един и същ
        обхват, едно и също тримесечие. «Платено общо» е цената на самите жилища заедно с земята под
        тях, с ДДС при новото строителство; нотариусът, комисионата и банковите такси стоят извън
        нея, така че средната сделка е цената на жилището, а не цената на купуването му.</span
      >
      <span class="l-en"
        >Eurostat publish how many dwellings were bought and how much was paid for them in total —
        the same scope, the same quarter. "Total paid" is the price of the dwellings themselves
        together with the land under them, VAT included on new builds; the notary, the agency
        commission and the bank fees sit outside it, so the average deal is what a home costs rather
        than what buying one costs.</span
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
        {@const dealAxis = niceTicks(dealScale.min, dealScale.max, 4)}
        <figure class="chart">
          <div class="plot">
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
              <path class="plot-line" d={pathOf({ ...dealNewSeries, ...dealAxis })} />
              <path class="plot-line second" d={pathOf({ ...dealExistingSeries, ...dealAxis })} />
              {@render dots({ ...dealNewSeries, ...dealAxis }, (v) => `${fmt0(v)} €`)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, dealAxis)}
                x2={CH_W}
                y2={yOf(0, dealAxis)}
              />
            </svg>
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
            `Средната сделка е наша сметка: платеното общо, разделено на броя сделки — ` +
            `${fmt0(deal.totalValue)} € върху ${fmt0(deal.deals)} жилища. Това е средна сума за ` +
            `едно жилище, не цена на квадратен метър и не цената по средата на сделките; какво се ` +
            `е продавало, къщи или апартаменти, я движи. Евростат не отговаря за делението, нито ` +
            `за изводите от него.`,
          en:
            `The average deal is our arithmetic: the total paid divided by the number of deals — ` +
            `€${fmt0(deal.totalValue)} over ${fmt0(deal.deals)} dwellings. It is a mean amount ` +
            `paid for a dwelling, not a price per square metre and not the middle price of the ` +
            `quarter's deals; the mix of flats and houses sold moves it. Eurostat are not ` +
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
        `живеещи в частни домакинства — изследването не стига до домовете за стари хора, ` +
        `общежитията и другите колективни домакинства.`,
      en:
        `Every year a part of the country's households answer the same survey. Among the rest ` +
        `they are asked what the home they are in is: theirs and paid off, theirs but with a loan ` +
        `on it, or rented. Eurostat publish the result. The shares are of the people living in ` +
        `private households — the survey does not reach care homes, halls of residence and other ` +
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
      -->
      <p>
        <span class="l-bg"
          >Този ред изглежда невъзможно малък, а не е сгрешен. Той брои хора, а не сделки: колко от
          живеещите в страната имат заем по жилището си — децата и пенсионерите включително. Почти
          всички живеят в собствено жилище без заем, защото жилищата минаха у живеещите в тях при
          приватизацията и оттогава се наследяват. Новите кредити са друго нещо — поток, колко
          договора се подписват през годината — и двете могат да вървят в различни посоки с години.</span
        >
        <span class="l-en"
          >That row looks impossibly small and it is not wrong. It counts people rather than
          purchases: how many of those living in the country have a loan on their home, children and
          pensioners included. Almost everybody lives in a home they own with no loan on it, because
          the homes passed to the people living in them at privatisation and have been inherited
          since. New lending is a different thing — a flow, how many contracts are signed in a year
          — and the two can move in opposite directions for years.</span
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
        новото издание. Това е броене — прави се веднъж и не се обновява, докато не дойде следващото
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
        отдолу мери точно това — не цената на едно жилище, а колко хора дават за жилище повече,
        отколкото домакинството им може да носи.</span
      >
      <span class="l-en"
        >A price on its own says little: it depends on what people earn as well. The figure below
        measures exactly that — not what one home costs, but how many people pay more for housing
        than their household can carry.</span
      >
    </p>

    <!-- Twenty years of the overburden share, which was one number ------- -->
    {#if overburdenSeries.points.length > 4}
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
          >Официалното число брои хората, които живеят в домакинство, даващо над 40% от
          разполагаемия си доход за жилище; процентът е дял от хората в частни домакинства{#if overburdenSeries.value != null},
            а за {periodLong(overburdenSeries.refPeriod, "bg")} е {fmt(
              overburdenSeries.value
            )}%{/if}. «Разходи за жилище» тук е всичко около него — ток, парно, вода, поддръжка,
          застраховка и данък; наем за наемателите, а за собствениците с кредит — само лихвата, не и
          главницата. Огромната част от хората живеят в собствено жилище без заем, така че този ред
          се движи най-вече от сметките, а не от цените на сделките.</span
        >
        <span class="l-en"
          >The official figure counts people living in a household that spends more than 40% of its
          disposable income on housing; the percentage is a share of the people in private
          households{#if overburdenSeries.value != null}, and for {periodLong(
              overburdenSeries.refPeriod,
              "en"
            )} it is {fmt(overburdenSeries.value)}%{/if}. "Housing costs" here is everything around
          it — electricity, heating, water, maintenance, insurance and tax; rent for tenants, and
          for owners with a loan the interest alone, never the capital. Most people here live in a
          home they own outright, so this series moves mainly with bills rather than with
          transaction prices.</span
        >
      </p>
      {@const overburdenAxis = niceTicks(overburdenSeries.min, overburdenSeries.max, 4)}
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
        >Наемите са при <a href="#credit">таблицата кой как живее</a>, а цените на самите жилища —
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
  /* The year ticks, stacked in ONE grid cell and moved with `position:
     relative` — the device the y axis uses, and for the same two reasons. Out
     of flow with `position: absolute` they would contribute nothing to the
     row's height and the labels would sit on top of the plot; laid out in flow
     they would space themselves evenly and stop pointing at their own columns.

     A percentage `left` resolves against this box's width, which the grid has
     already stretched to the plot's — so a tick lands on its own year at every
     viewport. */
  .xyears {
    grid-column: 2;
    display: grid;
    grid-template-columns: 1fr;
    /* …and each tick is sized to its own text rather than stretched to the
       cell. A stacked grid item defaults to filling its area, and then
       `translateX(-50%)` moves it by half the PLOT rather than by half the
       label: the first year lands 157px left of the box at 360px, which is off
       the page. The y axis needs the same declaration and states it as
       `justify-items: end`. */
    justify-items: start;
    margin-top: 4px;
    min-height: 1em;
  }
  /* The horizontal shift is written on the element rather than here: which of
     the three it takes depends on where the tick lands, and only the template
     knows that. */
  .xyears .plot-tick {
    grid-area: 1 / 1;
    position: relative;
    white-space: nowrap;
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
  /* The marked quarters' swatch, drawn at the tint the columns are drawn at, or
     the key names a colour that is nowhere on the plot. Taller than a line
     swatch because what it stands for is a bar. */
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
     the whole panel — the axis in the gutter included. */
  .pair .panel {
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
     reader hunting for one quarter out of decades needs a box to aim at rather
     than a two-pixel stroke. */
  .plot-hit {
    fill: transparent;
  }
  /* The two kinds of furniture: a year boundary down the plot and a value
     gridline across it. The quietest marks on the page — the emphatic rules are
     zero and a reference the publisher defines — and both are drawn BEFORE the
     data, so a column sits on top of its gridline rather than behind it. */
  .plot-year,
  .plot-grid {
    stroke: var(--rule);
    stroke-width: 1;
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
  .spark .plot-ref {
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
    fill: var(--ink-2);
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
</style>
