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
  import { COPY, t } from "./lib/content.js";
  import { loadAll } from "./lib/data.js";
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
  } from "./lib/view.js";
  import { number, integer, percentSigned, periodLong, httpUrl } from "./lib/format.js";

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
  onMount(async () => {
    data = await loadAll("market");
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
   * The plot box, and the mapping from a published figure to a coordinate in
   * it.
   *
   * Geometry rather than domain math, which is why it is here and not in
   * `mirror.js` — `systemWedgeLadder` draws the same line, returning the rates
   * and leaving the pixels to the component that knows how wide its box is.
   *
   * **`barH` takes a maximum and no minimum, and that is the honesty
   * constraint rather than a simplification.** Both plots are drawn from zero.
   * A y-axis cropped to a series' own range turns every property chart into a
   * cliff, and this is the page that refuses to tell a reader what to think —
   * so there is no floor parameter for a later edit to introduce.
   */
  const CH_W = 640,
    CH_H = 190,
    CH_PAD_L = 52,
    CH_PAD_R = 10,
    CH_TOP = 12,
    CH_BASE = CH_H - 26;
  const plotW = CH_W - CH_PAD_L - CH_PAD_R;
  const barH = (value, max) => (max > 0 ? ((CH_BASE - CH_TOP) * value) / max : 0);
  const barW = (n) => Math.max(1, (plotW / n) * 0.72);
  const barX = (i, n) => CH_PAD_L + (plotW / n) * (i + 0.14);
  /** The line, with the first point moved to and the rest drawn through. */
  const ptiPath = $derived(
    ptiSeries.points
      .map((p, i) => {
        const n = ptiSeries.points.length;
        const x = CH_PAD_L + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
        return `${i ? "L" : "M"}${x.toFixed(2)} ${(CH_BASE - barH(p.value, ptiSeries.max)).toFixed(2)}`;
      })
      .join(" ")
  );

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

  /** The rent line the calculator already publishes, read here rather than refetched. */
  const rent = $derived(
    (data.hicpCategories?.categories ?? [])
      .flatMap((c) => c.groups ?? [])
      .find((g) => g.cp_code === "CP041") ?? null
  );
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

  <p class="lead">
    <span class="l-bg"
      >Тук са официалните числа за жилищния пазар в България: колко сделки има, колко се плаща по
      тях, как се движат цените и колко хора изобщо дължат нещо по жилището си. Под всяко число пише
      кой го публикува и за кой период е. Не заемаме страна — числата тук сочат в различни посоки и
      това е част от отговора.</span
    >
    <span class="l-en"
      >These are the official figures for Bulgarian housing: how many deals happen, what is paid for
      them, how prices move, and how many people owe anything on the home they live in. Under every
      number is who publishes it and which period it describes. We take no side — these figures
      point in different directions, and that is part of the answer.</span
    >
  </p>
  <p class="lead">
    <span class="l-bg"
      >Под всяко число има две връзки. Първата води към таблицата на публикуващия, където до нашето
      число стоят и всички останали мерки от същия набор — брой, индекс, месечна и годишна промяна —
      така че там се вижда и друго число за същата държава и същото тримесечие. Втората връзка, «{COPY
        .mktSrcQuery.bg}», връща точно това, което пише тук, и нищо друго. Където сметката е наша,
      пише как е направена и стои заявката, която я връща.</span
    >
    <span class="l-en"
      >Every number carries two links. The first opens the publisher's own table, where our figure
      sits beside every other measure in the same dataset — a count, an index, a quarterly and an
      annual rate — so the same country and quarter shows more than one number there. The second, "{COPY
        .mktSrcQuery.en}", returns exactly what is printed here and nothing else. Where the
      arithmetic is ours, it says so and carries the query that reproduces it.</span
    >
  </p>

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
      ><span class="l-bg">колко жилища има</span><span class="l-en">the housing stock</span></a
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
          <svg
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
            {#each volumeSeries.points as p, i (p.period)}
              <rect
                class="plot-bar"
                x={barX(i, volumeSeries.points.length)}
                y={CH_BASE - barH(p.value, volumeSeries.max)}
                width={barW(volumeSeries.points.length)}
                height={Math.max(1, barH(p.value, volumeSeries.max))}
              />
            {/each}
            <line class="plot-axis" x1={CH_PAD_L} y1={CH_BASE} x2={CH_W - CH_PAD_R} y2={CH_BASE} />
            <text class="plot-tick" x={CH_PAD_L - 6} y={CH_TOP + 9} text-anchor="end"
              >{fmt0(volumeSeries.max)}</text
            >
            <text class="plot-tick" x={CH_PAD_L - 6} y={CH_BASE} text-anchor="end">0</text>
            <text class="plot-tick" x={CH_PAD_L} y={CH_BASE + 15}>{volumeSeries.from}</text>
            <text class="plot-tick" x={CH_W - CH_PAD_R} y={CH_BASE + 15} text-anchor="end"
              >{volumeSeries.to}</text
            >
          </svg>
        </figure>
        <p class="ss tsrc">
          {@render srcLine(
            COPY.srcEurostat,
            volume.deals.sourceUrl,
            {
              bg: `${periodLong(volumeSeries.from, "bg")} – ${periodLong(volumeSeries.to, "bg")}`,
              en: `${periodLong(volumeSeries.from, "en")} – ${periodLong(volumeSeries.to, "en")}`,
            },
            volume.deals.apiUrl
          )}
        </p>
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
        >Индексът на цените на жилищата мери с колко се е променила цената на сделките спрямо година
        по-рано. Показваме числото, което Евростат публикува, а не сметка от индекса: НСИ смени
        базисната година и сам предупреждава, че процент, преизчислен между двете бази, може да се
        различава в последния знак от този, който публикува.</span
      >
      <span class="l-en"
        >The house price index measures how much transaction prices moved against a year earlier. We
        show the figure Eurostat publish rather than one worked out from the index: НСИ changed the
        base year and warn themselves that a rate recomputed across the two bases can differ in the
        last decimal from the one they publish.</span
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

      {#if yearsOfPay.value != null}
        <div class="stats">
          {@render figure(
            fmt(yearsOfPay.value),
            COPY.mktKYearsOfPay,
            COPY.srcEurostatNsi,
            yearsOfPay.wageUrl,
            whenPair(yearsOfPay.dealPeriod, COPY.srcEurostat, yearsOfPay.wagePeriod, COPY.srcNsi)
          )}
        </div>
        {@render ourSum(
          {
            bg:
              "Колко заплати струва едно жилище е наша сметка с числата на две институции: " +
              "средната сделка на Евростат, разделена на дванадесет средни брутни заплати на НСИ " +
              "за всички дейности. Двата файла остават отделни чак до браузъра ти и се срещат " +
              "едва тук — така във всеки от тях стоят числата само на един публикуващ орган. " +
              "Бруто, а не нето: нетото зависи от данъчната таблица на годината, в която е сметнато.",
            en:
              "The years of pay are arithmetic over two institutions' figures: Eurostat's average " +
              "deal divided by twelve of НСИ's published average gross wages across all " +
              "activities. The two files stay apart all the way to your browser and meet here, " +
              "which is what keeps each of them one publisher's data. Gross rather than net: a " +
              "net figure depends on the payroll table of the year it was worked out in.",
          },
          yearsOfPay.derivedFrom
        )}
      {/if}
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
        >Изследването на доходите и условията на живот пита хората какво е жилището им: собствено
        без заем, собствено със заем или под наем. Всички числа тук са дял от хората в страната, на
        една и съща основа — затова собствениците и наемателите се събират на сто. Делът на тези,
        които дължат нещо по жилището си, е контекстът, в който се четат числата по-горе.</span
      >
      <span class="l-en"
        >The income and living-conditions survey asks people what their housing is: owned outright,
        owned with a loan, or rented. Every figure here is a share of the country's people on one
        and the same base, which is why owners and renters add to a hundred. The share of people who
        owe anything on their home is the context the figures above are read in.</span
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
            <tr class="mark">
              <th scope="row">{@render colHead(COPY.mktRowRent, null)}</th>
              <td class="num mono">{fmt(structure.renter.value)}%</td>
            </tr>
            <tr>
              <th scope="row" class="sub">{@render colHead(COPY.mktRowRentMarket, null)}</th>
              <td class="num mono">{fmt(structure.renterAtMarketPrice.value)}%</td>
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
      <span class="l-bg">Колко жилища има</span>
      <span class="l-en">The housing stock</span>
    </h2>
    <p>
      <span class="l-bg"
        >Преброяването брои жилищата, не хората: колко конвенционални жилища има в страната и колко
        от тях са били необитавани в нощта на преброяването. «Необитавано» включва вторите жилища и
        вилите, не само празния фонд.</span
      >
      <span class="l-en"
        >The census counts dwellings rather than people: how many conventional dwellings the country
        has, and how many stood unoccupied on census night. "Unoccupied" includes second homes and
        holiday properties, not only genuinely empty stock.</span
      >
    </p>

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
            `Делът е наша сметка: необитаваните жилища върху всички конвенционални жилища от същото ` +
            `преброяване — ${fmt0(structure.unoccupied.value)} върху ` +
            `${fmt0(structure.dwellings.value)}. И двете числа са в таблицата отгоре.`,
          en:
            `The share is our arithmetic: unoccupied dwellings over all conventional dwellings from ` +
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
        >Цената на жилището сама по себе си не казва много: тя зависи и от това колко печелят
        хората. Затова Евростат дели едното на другото — цените на жилищата върху доходите — и следи
        как се движи резултатът.</span
      >
      <span class="l-en"
        >A house price on its own says little: it depends on what people earn as well. So Eurostat
        divide one by the other — house prices over incomes — and follow how the result moves.</span
      >
    </p>
    <p>
      <span class="l-bg"
        >Второто деление е това, което прави числото четимо. Съотношението за дадена година се дели
        на средното за целия ред и се записва като 100 за средното. Затова 100 е «толкова, колкото
        обикновено е било в България», под 100 е «по-евтино спрямо доходите, отколкото обикновено»,
        а над 100 — «по-скъпо». Мерилото е собствената история на страната. Редът не сравнява
        България с друга държава и не казва нищо за отделния купувач — той е за съотношението, а не
        за нечий бюджет.</span
      >
      <span class="l-en"
        >The second division is what makes the figure readable. A given year's ratio is divided by
        the average across the whole series and written as 100 for that average. So 100 means "about
        what it has usually been in Bulgaria", below 100 means "cheaper against incomes than usual",
        and above 100 means dearer. The yardstick is the country's own history. The series does not
        compare Bulgaria with anywhere else, and it says nothing about an individual buyer — it is
        about the ratio, not about anyone's budget.</span
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
        <svg
          viewBox="0 0 {CH_W} {CH_H}"
          role="img"
          aria-label={t(COPY.mktChartPti, $lang, {
            from: ptiSeries.from,
            to: ptiSeries.to,
            peak: fmt(ptiSeries.peak?.value),
            peakAt: ptiSeries.peak?.period,
            last: fmt(ptiSeries.latest),
          })}
        >
          <line
            class="plot-ref"
            x1={CH_PAD_L}
            y1={CH_BASE - barH(ptiSeries.reference, ptiSeries.max)}
            x2={CH_W - CH_PAD_R}
            y2={CH_BASE - barH(ptiSeries.reference, ptiSeries.max)}
          />
          <path class="plot-line" d={ptiPath} />
          <line class="plot-axis" x1={CH_PAD_L} y1={CH_BASE} x2={CH_W - CH_PAD_R} y2={CH_BASE} />
          <text
            class="plot-tick"
            x={CH_W - CH_PAD_R}
            y={CH_BASE - barH(ptiSeries.reference, ptiSeries.max) - 5}
            text-anchor="end">100</text
          >
          <text class="plot-tick" x={CH_PAD_L - 6} y={CH_BASE} text-anchor="end">0</text>
          <text class="plot-tick" x={CH_PAD_L} y={CH_BASE + 15}>{ptiSeries.from}</text>
          <text class="plot-tick" x={CH_W - CH_PAD_R} y={CH_BASE + 15} text-anchor="end"
            >{ptiSeries.to}</text
          >
        </svg>
        <figcaption>
          <span class="l-bg">{COPY.mktChartRefLine.bg}</span>
          <span class="l-en">{COPY.mktChartRefLine.en}</span>
        </figcaption>
      </figure>
      <p class="ss tsrc">
        {@render srcLine(
          COPY.srcEurostat,
          structure.priceToIncome.sourceUrl,
          { bg: `${ptiSeries.from} – ${ptiSeries.to}`, en: `${ptiSeries.from} – ${ptiSeries.to}` },
          structure.priceToIncome.apiUrl
        )}
      </p>
    {/if}

    {#if structure.priceToIncome.value != null}
      <div class="stats">
        {@render figure(
          fmt(structure.priceToIncome.value),
          COPY.mktKPriceToIncome,
          COPY.srcEurostat,
          structure.priceToIncome.sourceUrl,
          when(structure.priceToIncome.refPeriod),
          structure.priceToIncome.apiUrl
        )}
        {@render figure(
          `${fmt(structure.overburden.value)}%`,
          COPY.mktKOverburden,
          COPY.srcEurostat,
          structure.overburden.sourceUrl,
          when(structure.overburden.refPeriod),
          structure.overburden.apiUrl
        )}
        {#if rent}
          {@render figure(
            pct(rent.annual_rate_pct),
            COPY.mktKRentInflation,
            COPY.srcEurostat,
            rent.api_url,
            when(rent.ref_period)
          )}
        {/if}
      </div>
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Тези три числа не сочат в една посока и страницата няма да реши вместо теб кое тежи повече.
        Показателят спрямо доходите и делът на хората, чието домакинство дава над 40% от дохода си
        за жилище, се движат в една посока; наемите — в друга. Твоята сметка е в калкулатора.</span
      >
      <span class="l-en"
        >These three figures do not point the same way, and the page will not decide for you which
        weighs more. The income-relative indicator and the share of people whose household spends
        over 40% of its income on housing move one way; rents move another. Your own arithmetic is
        in the calculator.</span
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
  .stat {
    flex: 1 1 190px;
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
  .chart svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .chart figcaption {
    margin-top: 6px;
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
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
  .plot-tick {
    fill: var(--ink-2);
    font-family: var(--mono);
    font-size: 11px;
  }

  @media (max-width: 560px) {
    .brand small {
      display: none;
    }
  }
</style>
