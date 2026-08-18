<script>
  /**
   * `/how/` — Bulgaria's official figures, on a page of their own.
   *
   * **Why this is a page and not a section of the calculator.** One page ranks
   * for one cluster of queries, and `/` is answering «сметни моята инфлация».
   * Nothing on it answers «каква е инфлацията в България», «колко взима
   * данъкът» or «колко струва квадратът в София» — informational questions
   * with no calculator in them, asked by people who will never type a salary
   * into anything. `docs/seo.md` costs the entry out; `docs/how-it-works.md` is
   * the same explanation written for a contributor, and this is it written for
   * a reader, in both languages, with the figures rendered rather than typed.
   *
   * **Every number here is the country's and none is the reader's.** There is
   * no input on this page and there must never be one: every value it reads off
   * `Calculator` is a function of the published payloads alone, and each takes
   * payloads rather than scalars precisely so a reader's figure cannot be
   * threaded into one (calculator.svelte.js §"Derived: the country, with nobody
   * in it"). The tax
   * wedge is the case that matters: a PERSONAL effective rate is closed on any
   * shareable surface because it inverts to the salary (P2), and the system's
   * own curve is the version the closed list leaves open. `WedgeChart` is
   * mounted by the results card too and draws whatever it is handed, so what
   * keeps the reader off this page's picture is `systemWedgeCurve` —
   * `view/country.js#wedgeCurve` has no `pay` parameter and passes no markers.
   *
   * **`syncWithData` is deliberately not called.** It seeds the basket
   * sliders, adopts the live mortgage rate into the reader's field and clamps
   * their term — three pieces of calculator state, none of which exists here.
   * Running it would be work with no output; more to the point, an `$effect`
   * on a page that renders no inputs is where an input eventually gets added.
   */
  import { onMount } from "svelte";
  import { lang, langHref } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import SiteHeader from "./lib/SiteHeader.svelte";
  import WedgeChart from "./lib/WedgeChart.svelte";
  import LabourCostChart from "./lib/LabourCostChart.svelte";
  import DataLate from "./components/DataLate.svelte";
  import { Calculator } from "./lib/calculator.svelte.js";
  import { COPY, HOME, t } from "./lib/content.js";
  import { QUARTERS, unemploymentHistory } from "./lib/view/country.js";
  import { monthsSplit as monthsAreSplit } from "./lib/view/results.js";
  import { number, integer, periodLong, dateShort, httpUrl } from "./lib/format.js";
  import { niceTicks, pathOf, plotX, plotY, tickAt, yearTicks } from "./lib/plot.js";

  /**
   * The published payloads, read off disk by `scripts/prerender.mjs`.
   *
   * `how-main.js` never passes them: in a browser the page fetches, like every
   * other page here. At build time there is no fetch, so the payloads arrive
   * as a prop and the served HTML carries the figures a crawler — and an agent
   * citing them — would otherwise have to run the bundle to see.
   */
  const { payloads = null, servedLang = null } = $props();

  /**
   * The language the build is writing this render into, or `null` in a browser.
   *
   * A word is a `.l-bg` / `.l-en` pair and the prerender strips the half the
   * entry does not declare. A NUMBER is not a pair: `format.js` writes «22,323%»
   * for a Bulgarian reader and "22.323%" for an English one, off the `lang`
   * store — and that store has no `<html data-lang>` to read in a Node build.
   * Without this the English entry ships Bulgarian decimals to the one consumer
   * that executes nothing, where a comma reads as a thousands separator.
   *
   * Setting a module-global store from component setup is safe exactly here:
   * the server render is synchronous and single-threaded, and the client never
   * passes the prop — there `initialLang()` reads the document instead.
   */
  if (servedLang) lang.set(servedLang);

  // svelte-ignore state_referenced_locally
  // Reading the initial value is the whole intent: `payloads` is set once by
  // the build and never again, and the Calculator holds what it was given.
  const calc = new Calculator(payloads);
  onMount(calc.load);

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // Whether Eurostat's flash has the all-items rate a month ahead of the
  // divisions. §инфлацията prints both figures and then explains the gap
  // between them, and which explanation is TRUE depends on this — see
  // `view/results.js#monthsSplit`, which the calculator's explainer branches on too.
  const monthsSplit = $derived(
    monthsAreSplit({ headlineMonth: calc.headlineRefPeriod, basketMonth: calc.basketRefPeriod })
  );

  // Dates and periods come out as a `{bg, en}` PAIR, not as one string picked
  // by `$lang`, and that is the difference between a page a crawler can read
  // and one it half can. Both languages ship in the DOM at once here (the rule
  // in `tokens.css` hides one), so a caption assembled from `$lang` puts «юли
  // 2026 г.» inside the English span — invisible to a reader, who only ever
  // sees the other one, and served verbatim to whatever indexes the HTML.
  /**
   * The period a figure describes, carrying НСИ's own provisional marker where
   * they have one.
   *
   * НСИ star a whole year until they finalise it, and 2026 is starred. The
   * calculator says so on both of its НСИ credit lines — «… · 2026-Q1
   * (предварителни данни)» — and this page, whose entire job is provenance, was
   * showing the same cell as settled in four places: the wage card, the
   * years-of-pay card, the ladder's caption and the quarterly wage table. A
   * figure the publisher will revise, shown as final, tells the reader more
   * certainty than exists (P4).
   *
   * The marker is `COPY.srcPrelim`, the one both calculator credit lines
   * already share, rather than a second string here: two keys holding the same
   * sentence is how one of them ends up saying something the other does not.
   */
  const when = (p, preliminary = false) => ({
    bg: periodLong(p, "bg") + (preliminary ? t(COPY.srcPrelim, "bg") : ""),
    en: periodLong(p, "en") + (preliminary ? t(COPY.srcPrelim, "en") : ""),
  });
  /** True while НСИ have not finalised the quarter the wage figures come from.
      Both НСИ payloads carry the same quarter under the same marker, and the
      by-activity one is where every wage on this page comes from. */
  const wagesArePreliminary = $derived(Boolean(calc.data.sectorSalary?.is_preliminary));
  /**
   * WHICH date is on the имот.bg figures, said out loud.
   *
   * They carry two different facts. `snapshot_date` is имот.bg's own newest
   * published snapshot, read off that city's `<select name="date">` — the day
   * the SOURCE published the number — and `as_of` is the day our pipeline
   * fetched it. A page that serves no parseable snapshot list leaves the first
   * null, which is the case for the payload currently shipped, so printing
   * whichever is available with no qualifier lets our download date read as
   * имот.bg's publication date.
   *
   * Same two strings as `App.svelte`, so the two pages cannot come to
   * different words for the same distinction.
   */
  const imotDated = $derived(
    calc.refCityPriceSnapshot
      ? {
          bg: t(COPY.srcDatedByPage, "bg", { d: calc.refCityPriceSnapshot }),
          en: t(COPY.srcDatedByPage, "en", { d: calc.refCityPriceSnapshot }),
        }
      : {
          bg: t(COPY.srcDatedByFetch, "bg", { d: dateShort(calc.refCityPriceAsOf, "bg") }),
          en: t(COPY.srcDatedByFetch, "en", { d: dateShort(calc.refCityPriceAsOf, "en") }),
        }
  );
  /** A period that is already language-independent — a year, an ISO effective date. */
  const asIs = (v) => ({ bg: String(v ?? ""), en: String(v ?? "") });

  // The two Eurostat extracts this page cites for figures that are not
  // per-category: the all-items headline and unemployment. Same reasoning as
  // the strip's — they point at the exact dissemination query behind the
  // number rather than the Data Browser table, which silently defaults to
  // CP01/Food for the first and to the dataset's default geo for the second.
  const ESTAT_HEADLINE_URL =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=12";
  const ESTAT_UNEMPLOYMENT_URL =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=BG&s_adj=SA&sex=T&age=TOTAL&unit=PC_ACT&sinceTimePeriod=2020-01";
  // The shares in the basket table's own column. Their cube is not the rates'
  // — a row's ↗ is a `prc_hicp_minr` query and returns no weight — so this is
  // the one place on the page `prc_hicp_iw` is reachable from.
  const ESTAT_WEIGHTS_URL =
    "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_iw/default/table?lang=en";
  const ESTAT_SES_URL =
    "https://ec.europa.eu/eurostat/databrowser/view/earn_ses_monthly/default/table?lang=en";
  const DV_URL = "https://dv.parliament.bg/";
  // What dates the four payroll figures. `DV_URL` is the gazette's landing
  // page and cannot be a per-issue permalink, so under P9 the caption has to
  // carry the instrument: «бр. 68 от 28.07.2026» is what ДВ's own archive is
  // searched by, and it moves with the next ЗБДОО rather than staying true by
  // accident. The year is the fallback for a parameter set assembled from
  // several acts, where no single issue is true of it.
  const dvWhen = $derived.by(() => {
    const { gazetteIssue, gazetteDate, effectiveYear } = calc.systemWedge;
    if (!gazetteIssue) return asIs(effectiveYear);
    return {
      bg: t(COPY.howSrcDvIssue, "bg", { issue: gazetteIssue, date: dateShort(gazetteDate, "bg") }),
      en: t(COPY.howSrcDvIssue, "en", { issue: gazetteIssue, date: dateShort(gazetteDate, "en") }),
    };
  });
  // The same citation for the ТЗПБ appendix, which dates itself off a different
  // block: `work_accident` carries the gazette pair of the act it was fetched
  // from, and `systemWedge`'s is the entry's own. They agree today because one
  // ЗБДОО sets both, and they are read apart so the day they stop agreeing the
  // caption under the chart still names the act the chart was drawn from.
  const tzpbWhen = $derived.by(() => {
    const { gazetteIssue, gazetteDate } = calc.systemLabourCost;
    return {
      bg: t(COPY.howSrcDvIssue, "bg", {
        issue: integer(gazetteIssue, "bg"),
        date: dateShort(gazetteDate, "bg"),
      }),
      en: t(COPY.howSrcDvIssue, "en", {
        issue: integer(gazetteIssue, "en"),
        date: dateShort(gazetteDate, "en"),
      }),
    };
  });
  const unemployment = $derived(unemploymentHistory(calc.data.unemployment));
  // The box the one chart on this page is drawn in, in its own units, and the
  // same numbers `/credit/` uses so the two pages' plots read at one scale.
  // `chart.css` holds the furniture around it.
  const CH_W = 600,
    CH_H = 150;
  const yOf = (v, axis) => plotY(v, axis, CH_H);
  const xOf = (i, n) => plotX(i, n, CH_W);
  // A year rule's x. `yearTicks` answers in a percentage, so one value places
  // both the HTML label in the gutter and the rule inside the box; this is the
  // inverse, through the same width, so the two land on the same column.
  const yearX = (at) => (at / 100) * CH_W;
  const xTicks = (series) => yearTicks(series, CH_W);

  // The index of all twenty-seven city pages, and the fallback only. Each city
  // row carries its own page and `cityHome.sourceUrl` is what the cards use —
  // this is what a card links to when the payload has not loaded, which is the
  // one state in which no city has been chosen to link to.
  const IMOT_URL = "https://www.imot.bg/sredni-ceni";
</script>

<svelte:head>
  <!-- Only the title, for the reason `App.svelte` carries at length: a
       `<meta name="description">` here does NOT replace the one in
       how/index.html — Svelte appends it and a crawler reads the first of the
       two. The description belongs in the entry file. -->
  <title>{t(COPY.howTitle, $lang)}</title>
</svelte:head>

<SiteHeader page="/how/" tagline={COPY.taglineFigures} />

<!--
  One stat block, used about a dozen times below.

  `label` and `source` arrive as `{bg, en}` pairs and both languages are
  rendered into the DOM, hidden by the rule in `tokens.css`. That is not a
  detail here: the served HTML is what a crawler and a citing agent read, and a
  caption assembled from `$lang` would reach them in one language — the same
  reason every paragraph on this page is a `.l-bg` / `.l-en` pair rather than a
  `t(...)` call.

  `when` is the period the figure DESCRIBES, never the day we fetched it. P3
  and P4 both hang off it, and on a page that may be served for longer than its
  data is current it is also the mitigation: a figure that fell behind is
  visibly behind rather than silently wrong.
-->
{#snippet stat(value, label, source, href, period)}
  <div class="stat">
    <div class="sv mono">{value}</div>
    <div class="sl">
      <span class="l-bg">{label.bg}</span>
      <span class="l-en">{label.en}</span>
    </div>
    <div class="ss">
      <!-- The publisher and the period are two elements rather than one
           `COPY.howSrc` string, because they answer different questions and the
           page needs one of them answerable without reading. Eighteen figures
           come from six publishers and one of them is us; set at one weight in
           one colour, WHOSE a figure is can only be found by reading every
           caption in turn, and the reader most likely to want it — somebody
           deciding what to attribute a number to — is the one least likely to
           read eighteen captions. The publisher takes the page's ink and the
           period keeps the muted tone it had, so the six names carry down the
           column and the dates stay furniture.

           `COPY.howSrc` still assembles the same line under the tables, where
           there is one caption rather than a column of them and nothing to
           scan. The separator is spelled here because it sits BETWEEN the two
           elements: `::before` content is not in the accessible name, and a
           caption announced as «Държавен вестникбр. 68» is the cost of keeping
           the punctuation in the stylesheet. -->
      <a href={httpUrl(href)} target="_blank" rel="noopener">
        <b class="pub">
          <span class="l-bg">{source.bg}</span>
          <span class="l-en">{source.en}</span>
        </b>
        ·
        <span class="per">
          <span class="l-bg">{period.bg}</span>
          <span class="l-en">{period.en}</span>
        </span>
      </a>
    </div>
  </div>
{/snippet}

<!-- The Eurostat disclosure obligation, attached to each of the figures it
     applies to rather than stated once at the foot: the sum over the thirteen
     divisions, the modelled ladder, and the €/m² median across имот.bg's
     districts with the change since that city's baseline year built on it are
     OURS, and Eurostat's terms permit derivation on condition that it is
     disclosed. The link carries the reader to the full wording, including the
     non-responsibility clause.

     `check` is the query that RE-RUNS the derivation, and it is optional
     because only one of the three has a single one. A licence discharged one
     paragraph above the number does nothing for the reader who thinks the
     number is invented, so where a sum can be reproduced from one extract the
     disclosure carries it — Σ over the divisions is that case, and
     `view/basket.js#basketSumQuery` says why the shares are not a second link.
     The ladder's two inputs are already linked, one each, in the caption
     directly above it; the €/m² median's is the card's own link, which is the
     district page the median was taken across. -->

{#snippet ours(check = "")}
  <p class="ours">
    <span class="l-bg"
      >{COPY.oursNote.bg}
      {#if check}
        <a href={httpUrl(check)} target="_blank" rel="noopener">провери</a>&nbsp;
      {/if}
      <a href="/legal/#sources">{COPY.oursMoreK.bg} →</a></span
    >
    <span class="l-en"
      >{COPY.oursNote.en}
      {#if check}
        <a href={httpUrl(check)} target="_blank" rel="noopener">check</a>&nbsp;
      {/if}
      <a href="/legal/#sources">{COPY.oursMoreK.en} →</a></span
    >
  </p>
{/snippet}

<!-- Between the header and the page, where the calculator puts the same
     warning. `calc.dataOverdue` is empty until `load()` has run in the reader's
     own tab: the verdict is a function of the clock and the build's clock is
     not the reader's, which is why the constructor deliberately does not seed
     it (calculator.svelte.js). -->
<DataLate rows={calc.dataOverdue} />

<main id="main" class="wrap how">
  <h1>
    <span class="l-bg">Числата за България, обяснени</span>
    <span class="l-en">Bulgaria's numbers, explained</span>
  </h1>

  <p class="lead">
    <span class="l-bg"
      >Тук са официалните числа, с които калкулаторът смята: инфлацията и 13-те групи на кошницата,
      данъкът и осигуровките, подредбата на заплатите, лихвата по жилищен кредит, цената на
      квадратен метър в София и безработицата. До всяко стои институцията, която го публикува,
      периодът, за който се отнася, и връзка към таблицата, от която е взето. Нищо тук не е
      измислено от нас и нищо не е закръглено на око.</span
    >
    <span class="l-en"
      >These are the official figures the calculator works from: inflation and the 13 basket groups,
      tax and contributions, how pay is spread out, the home-loan rate, the price of a square metre
      in Sofia, and unemployment. Each one carries the body that publishes it, the period it
      describes, and a link to the table it was taken from. Nothing here is invented and nothing is
      rounded by eye.</span
    >
  </p>

  <nav class="toc" aria-label="contents">
    <a href="#inflation"><span class="l-bg">инфлацията</span><span class="l-en">inflation</span></a>
    <a href="#basket"><span class="l-bg">кошницата</span><span class="l-en">the basket</span></a>
    <a href="#pay"><span class="l-bg">бруто и нето</span><span class="l-en">gross and net</span></a>
    <a href="#ladder"
      ><span class="l-bg">подредбата на заплатите</span><span class="l-en">the pay ladder</span></a
    >
    <a href="#loan"
      ><span class="l-bg">жилищният кредит</span><span class="l-en">the home loan</span></a
    >
    <a href="#home"
      ><span class="l-bg">цената в обявите</span><span class="l-en">the listed price</span></a
    >
    <a href="#work"
      ><span class="l-bg">работа и заплати</span><span class="l-en">work and pay</span></a
    >
  </nav>

  <!-- 1 ------------------------------------------------------------------ -->
  <section id="inflation">
    <h2>
      <span class="l-bg">Каква е инфлацията и защо твоята е различна</span>
      <span class="l-en">What inflation is, and why yours is different</span>
    </h2>
    <p>
      <span class="l-bg"
        >Официалната инфлация е едно число за цялата страна: с колко са по-скъпи нещата днес спрямо
        преди година. Не всичко тежи еднакво: храната тежи повече от учебниците, защото за нея
        отиват повече пари. Цените ги събира НСИ всеки месец и НСИ изчислява от тях българския
        индекс; единните европейски правила и проверката дали са спазени са на Евростат, който
        публикува резултата. Вярно го взима дословно и не го пресмята наново, за да не се разминава
        с публикуваното.</span
      >
      <span class="l-en"
        >Official inflation is one number for the whole country: how much dearer things are today
        than a year ago. Not everything counts the same: food moves the figure more than textbooks
        do, because more money goes to it. NSI collects the prices every month and builds Bulgaria's
        index from them; the one common European method, and the check that it was followed, are
        Eurostat's, and Eurostat publishes the result. Vyarno takes it verbatim and never recomputes
        it, so it cannot drift from what is published.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.hicpHeadline}
        {@render stat(
          `${fmt(calc.headline)}%`,
          COPY.howKHeadline,
          COPY.srcEurostat,
          ESTAT_HEADLINE_URL,
          when(calc.headlineRefPeriod)
        )}
      {/if}
      {#if calc.categories.length > 0}
        <!-- **The publisher slot says US, and the two cards are why.** This
             figure is Σ(w·r) over the thirteen divisions, which Eurostat has
             never printed — it runs about 0.16 pp from their all-items rate in
             the ordinary case and 1.3 pp during their flash, and it is standing
             beside that rate under a caption a reader reads as a byline. Named
             «Евростат» there it is their number, in their voice, differing from
             their own published one, on the page whose whole claim is that a
             reader can tell whose figure is whose. The inputs are still theirs
             and the link still goes to their table of them. -->
        {@render stat(
          `${fmt(calc.off)}%`,
          COPY.howKBasket,
          COPY.howSrcOurSum,
          calc.data.hicpCategories.source_url,
          when(calc.basketRefPeriod)
        )}
      {/if}
    </div>

    {#if calc.categories.length > 0}
      {@render ours(calc.basketSumUrl)}
    {/if}

    <!-- The two figures sit side by side, so the paragraph under them has to
         account for the whole of what a reader can see — and how much of the gap
         the January re-weighting explains depends on whether the two describe
         the same month. During Eurostat's flash they do not, and then most of
         the difference on screen is the fortnight rather than the method: on the
         payloads as this is written the two are 1.26 pp apart where a same-month
         pair is ~0.16 pp. So the cause is named before the method that would
         otherwise be made to carry it, exactly as `ExplainerBand.svelte` does
         over the same two months. Both cards already state their own period;
         this is the prose over them catching up.

         WRITTEN FOR SOMEBODY WHO HAS NEVER MET A PRICE INDEX. The earlier
         version explained the gap in the vocabulary of the method — «сбор на
         13-те групи с тазгодишните тегла», «прозорецът от дванадесет месеца
         минава през тази смяна» — and every one of those phrases needs the
         answer before it can be read. This is the paragraph a doubting reader
         opens FIRST, on the page that exists to remove doubt, so it says which
         number is which, then what changes in January, in the words somebody
         uses about their own shopping. The two figures are unchanged and so is
         the reason for the gap; what went is the requirement to already know. -->
    <p>
      <span class="l-bg"
        >Двете числа горе идват от Евростат и са еднакво официални. Не са едно и също нещо: горното
        е инфлацията за цялата страна, точно както Евростат я публикува, а долното е нашият сбор от
        13-те групи, всяка умножена по това каква част от парите отива за нея. {monthsSplit
          ? t(COPY.explainSplitMonth, "bg", {
              headline: periodLong(calc.headlineRefPeriod, "bg"),
              basket: periodLong(calc.basketRefPeriod, "bg"),
            })
          : COPY.explainSameMonth.bg} Остава още една разлика, и тя е от смятането.
        <b>Всеки януари Евростат обновява кошницата</b>, защото хората харчат малко по-различно от
        предната година. Числото за последните дванадесет месеца минава през тази смяна и хваща и
        двете кошници, старата и новата; нашият сбор ползва само днешната. Затова двете се
        разминават съвсем малко. Показваме и двете, вместо да представим едното за другото.</span
      >
      <span class="l-en"
        >Both figures above come from Eurostat and both are equally official. They are not the same
        thing: the first is inflation for the whole country exactly as Eurostat publishes it, and
        the second is our own sum of the 13 groups, each multiplied by the share of the money that
        goes to it. {monthsSplit
          ? t(COPY.explainSplitMonth, "en", {
              headline: periodLong(calc.headlineRefPeriod, "en"),
              basket: periodLong(calc.basketRefPeriod, "en"),
            })
          : COPY.explainSameMonth.en} One difference is still left, and it comes from the arithmetic.
        <b>Every January Eurostat refreshes the basket</b>, because people spend a little
        differently than the year before. The figure for the last twelve months runs through that
        changeover and catches both baskets - the old one and the new; our sum uses only today's.
        That is why the two come out slightly apart. Both are shown rather than one being passed off
        as the other.</span
      >
    </p>
    <p>
      <span class="l-bg"
        >Твоята инфлация е същата сметка с твоите дялове. Ако храната е една трета от парите ти, а в
        националната кошница е една пета, поскъпването на храната тежи повече при теб. Кошницата се
        описва в калкулатора и сметката се прави изцяло в браузъра ти.</span
      >
      <span class="l-en"
        >Your own inflation is that same sum with your shares in it. If food is a third of your
        money where the national basket puts a fifth, food's price rise weighs more for you. The
        basket is described in the calculator and the arithmetic happens entirely in your browser.</span
      >
    </p>
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
  <section id="basket">
    <h2>
      <span class="l-bg">Кошницата: 13 групи, теглата им и колко е поскъпнала всяка</span>
      <span class="l-en">The basket: 13 groups, their weights, and how far each has risen</span>
    </h2>
    <p>
      <span class="l-bg"
        >Цените се групират по европейска класификация (ECOICOP), която за България дава тринадесет
        групи. Делът на всяка група е каква част от всички пари, които домакинствата в страната
        харчат, отива за нея, и Евростат го публикува веднъж годишно. По-старите български таблици
        имат дванадесет групи, защото последната беше сборна: сега CP12 е застраховки и банкови
        услуги, а новата CP13 покрива лична хигиена и социални услуги. Затова двете подредби не се
        припокриват.</span
      >
      <span class="l-en"
        >Prices are grouped by a European classification (ECOICOP), which for Bulgaria gives
        thirteen groups. A group's share is how much of everything the country's households spend
        goes to it; Eurostat publishes it once a year. Older Bulgarian tables show twelve groups
        because the last one was a catch-all: CP12 is now insurance and financial services and a new
        CP13 covers personal care and social protection. That is why the two do not line up.</span
      >
    </p>

    {#if calc.categories.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howTblBasket, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">
                <span class="l-bg">{COPY.howColGroup.bg}</span>
                <span class="l-en">{COPY.howColGroup.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColWeight.bg}</span>
                <span class="l-en">{COPY.howColWeight.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColYoy.bg}</span>
                <span class="l-en">{COPY.howColYoy.en}</span>
              </th>
              <th scope="col">
                <span class="l-bg">{COPY.howColCheck.bg}</span>
                <span class="l-en">{COPY.howColCheck.en}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each calc.categories as cat (cat.cp_code)}
              <tr>
                <th scope="row">
                  <span class="code mono">{cat.cp_code}</span>
                  <span class="l-bg">{cat.bg_name}</span>
                  <span class="l-en">{cat.en_name}</span>
                </th>
                <!-- The weight at the precision Eurostat publishes it, not at
                     the strip's. This page says in its own lead that nothing on
                     it is rounded by eye, and a reader following the ↗ link
                     lands on 22.323 rather than on 22.3. -->
                <td class="num mono">{fmt(cat.weight_pct, 3)}%</td>
                <td class="num mono">{fmt(cat.annual_rate_pct)}%</td>
                <td class="mono">
                  <a href={httpUrl(calc.estatCatUrl(cat))} target="_blank" rel="noopener">↗</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <!-- **The caption is the weight column's citation and nothing else is.**
           Two Eurostat cubes meet in this table: the rate column is
           `prc_hicp_minr` and every row carries its own ↗ into it, and the
           share column is `prc_hicp_iw`, which no row links because no row is
           a query for it. Uncited, thirteen shares sit on the page with the
           dataset that publishes them named nowhere — the omission direction
           of `verify_wiring.mjs` §"the country page cites every Eurostat
           dataset it renders", and the one a reader cannot notice, because a
           figure with no link looks exactly like a figure whose link is
           elsewhere. -->
      <p class="cap">
        <a href={ESTAT_WEIGHTS_URL} target="_blank" rel="noopener">
          <span class="l-bg"
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcEurostat.bg,
              p: when(calc.basketRefPeriod).bg,
            })}</span
          >
          <span class="l-en"
            >{t(COPY.howSrc, "en", {
              s: COPY.srcEurostat.en,
              p: when(calc.basketRefPeriod).en,
            })}</span
          >
        </a>
      </p>
    {/if}
  </section>

  <!-- 3 ------------------------------------------------------------------ -->
  <section id="pay">
    <h2>
      <span class="l-bg">От бруто към нето: какво взимат данъкът и осигуровките</span>
      <span class="l-en">From gross to net: what tax and contributions take</span>
    </h2>
    <p>
      <span class="l-bg"
        >От брутната заплата първо се удържат осигуровките за сметка на работника, а данъкът върху
        дохода се начислява върху остатъка. Ставките са в закона и се сменят с него, не с пазара.</span
      >
      <span class="l-en"
        >Employee social contributions come out of the gross first, and income tax is charged on
        what is left. The rates are in statute and change with it rather than with the market.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.payroll}
        {@render stat(
          `${fmt(calc.systemWedge.contributionRatePct, 2)}%`,
          COPY.howKContrib,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
        {@render stat(
          `${fmt(calc.systemWedge.incomeTaxRatePct, 0)}%`,
          COPY.howKTax,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
        {@render stat(
          `${fmt0(calc.systemWedge.maxInsurable)} €`,
          COPY.howKCeiling,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
        {@render stat(
          `${fmt(calc.systemWedge.minWageGross, 2)} €`,
          COPY.howKMinWage,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
      {/if}
    </div>

    <p>
      <span class="l-bg"
        >Данъкът е един за всички, но осигуровки се плащат само до определена заплата. Под тази
        граница от всяко увеличение се удържа едно и също. Над нея осигуровките спират, така че от
        увеличението остава само данъкът, и колкото по-висока е заплатата, толкова по-малка част от
        нея взима държавата. И кривата, и таблицата под нея са сметнати от ставките и границата
        горе. Никоя институция не ги публикува: никой не е длъжен да ги състави.</span
      >
      <span class="l-en"
        >The tax is the same for everyone, but contributions are only paid up to a certain salary.
        Below that line the same share comes out of any raise. Above it contributions stop, so only
        the tax comes out of a raise, and the higher the pay, the smaller the share of it the state
        takes. Both the curve below and the table under it are worked out from the rates and the
        line above. No agency publishes them: nobody is obliged to put them together.</span
      >
    </p>

    <!-- **The shape, then the figures.** The finding on this section is that
         the share the state takes holds flat and then falls, and five rows ask
         a reader to hold five effective rates in their head and do the drawing
         themselves. The table stays and stays open: it is the exact figures, it
         is what a keyboard and a screen reader get, and it is what a journalist
         quotes — a picture is not a text alternative for itself.

         `$lib/WedgeChart.svelte` rather than a second drawing, and no markers:
         the results card mounts the same component over the reader's own
         contracts, and `systemWedgeCurve` is the curve with nobody standing on
         it (`view/country.js#wedgeCurve`). -->
    {#if calc.data.payroll && calc.systemWedgeCurve.points.length > 0}
      <figure class="wedge-fig">
        <WedgeChart wedge={calc.systemWedgeCurve} />
      </figure>
    {/if}

    {#if calc.data.payroll}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howTblWedge, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColGross.bg}</span>
                <span class="l-en">{COPY.howColGross.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColNet.bg}</span>
                <span class="l-en">{COPY.howColNet.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColTaken.bg}</span>
                <span class="l-en">{COPY.howColTaken.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColEffective.bg}</span>
                <span class="l-en">{COPY.howColEffective.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColMarginal.bg}</span>
                <span class="l-en">{COPY.howColMarginal.en}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each calc.systemWedge.rungs as rung (rung.gross)}
              <tr class:mark={rung.atCeiling}>
                <th scope="row" class="num mono">
                  {fmt0(rung.gross)} €
                  {#if rung.atCeiling}
                    <span class="tag">
                      <span class="l-bg">{COPY.howAtCeiling.bg}</span>
                      <span class="l-en">{COPY.howAtCeiling.en}</span>
                    </span>
                  {/if}
                </th>
                <td class="num mono">{fmt0(rung.net)} €</td>
                <td class="num mono">{fmt0(rung.deductions)} €</td>
                <td class="num mono">{fmt(rung.effectivePct)}%</td>
                <td class="num mono">{fmt(rung.marginalPct)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <!-- The table is computed from the four figures above it, so it carries
           their citation rather than a year of its own. Two captions on one
           section naming one publisher at two levels of precision is a reader
           working out which of them is the instrument. -->
      <p class="cap">
        <span class="l-bg">{t(COPY.howSrc, "bg", { s: COPY.howSrcDv.bg, p: dvWhen.bg })}</span>
        <span class="l-en">{t(COPY.howSrc, "en", { s: COPY.howSrcDv.en, p: dvWhen.en })}</span>
      </p>
    {/if}

    <!-- **The second denominator, and it gets its own picture rather than a
         second series on the one above.** Everything up to here is a share of
         the GROSS salary; everything below is a share of what the job costs.
         They are the same euros — 22,4% and 34,7% — and drawn on one axis a
         reader cannot say which they are looking at. Both charts mark €2300 so
         the two can be lined up vertically, and neither shares the other's
         y-axis. -->
    {#if calc.data.payroll && calc.systemLabourCost.points.length > 0}
      <h3>
        <span class="l-bg">Колко струва един работник</span>
        <span class="l-en">What a worker costs</span>
      </h3>
      <p>
        <span class="l-bg"
          >Освен брутото работодателят внася и своя част от същите пет фонда, <b
            >{fmt(calc.systemLabourCost.employerRatePct, 2)}%</b
          >
          върху същия осигурителен доход и до същата граница, плюс вноска за трудова злополука между
          <b>{fmt(calc.systemLabourCost.workAccidentMinPct, 1)}%</b>
          и <b>{fmt(calc.systemLabourCost.workAccidentMaxPct, 1)}%</b> според дейността. Под
          границата
          <b>{fmt(calc.systemLabourCost.peakWedgePct)}%</b> от целия разход за труд не стига до работника,
          а над нея делът пада: осигуровките спират, заплатата не.</span
        >
        <span class="l-en"
          >On top of the gross, the employer pays its own share of the same five funds, <b
            >{fmt(calc.systemLabourCost.employerRatePct, 2)}%</b
          >
          on the same insurable income, under the same ceiling, plus a work-accident contribution of
          <b>{fmt(calc.systemLabourCost.workAccidentMinPct, 1)}%</b>
          to <b>{fmt(calc.systemLabourCost.workAccidentMaxPct, 1)}%</b> depending on the activity.
          Under the ceiling <b>{fmt(calc.systemLabourCost.peakWedgePct)}%</b> of the whole cost of employment
          never reaches the worker, and above it the share falls: contributions stop, the salary does
          not.</span
        >
      </p>
      <figure class="wedge-fig">
        <LabourCostChart cost={calc.systemLabourCost} />
      </figure>
      <!-- P3: the ТЗПБ figures are the only ones on this page read out of a
           fetched act rather than a transcribed table, so the appendix that
           sets them is named and its ДВ permalink is the link. -->
      {#if calc.systemLabourCost.sourceUrl}
        <p class="cap">
          <span class="l-bg"
            >източник: <a href={calc.systemLabourCost.sourceUrl} target="_blank" rel="noopener"
              >Държавен вестник · ЗБДОО 2026, {calc.systemLabourCost.appendix}</a
            >
            · {tzpbWhen.bg}</span
          >
          <span class="l-en"
            >source: <a href={calc.systemLabourCost.sourceUrl} target="_blank" rel="noopener"
              >State Gazette · ЗБДОО 2026, {calc.systemLabourCost.appendix}</a
            >
            · {tzpbWhen.en}</span
          >
        </p>
      {/if}
    {/if}
  </section>

  <!-- 4 ------------------------------------------------------------------ -->
  <section id="ladder">
    <h2>
      <span class="l-bg">Къде сяда една заплата в страната</span>
      <span class="l-en">Where a salary sits in the country</span>
    </h2>
    <!-- **The figure, then the table, then how they were made.** A reader who
         came for the average wage — the one figure on this section, and the
         one nobody publishing it puts on a page of its own — met 121 words of
         method first and the number 588px below the heading, which is off a
         phone screen. The method has not moved out of anyone's way: it sits
         under the table, where the two caveats already are, in the order
         `docs/writing-style.md` §"Sentence length is a review note" sets out —
         the answer, then what qualifies it, then how it was produced. -->
    <div class="stats">
      {#if calc.data.sectorSalary}
        {@render stat(
          `${fmt0(calc.payLadderRows.anchorGross)} €`,
          COPY.howKNationalWage,
          COPY.srcNsiWages,
          calc.payLadderRows.anchorUrl,
          when(calc.payLadderRows.anchorPeriod, wagesArePreliminary)
        )}
      {/if}
    </div>

    {#if calc.payLadderRows.anchorGross > 0 && calc.data.salaryDist}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howTblLadder, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">
                <span class="l-bg">{COPY.howColRung.bg}</span>
                <span class="l-en">{COPY.howColRung.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColGross.bg}</span>
                <span class="l-en">{COPY.howColGross.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColNet.bg}</span>
                <span class="l-en">{COPY.howColNet.en}</span>
              </th>
              <th scope="col">
                <span class="l-bg">{COPY.howColBasis.bg}</span>
                <span class="l-en">{COPY.howColBasis.en}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each calc.payLadderRows.rungs as rung (rung.cut)}
              <tr>
                <th scope="row" class="mono">P{rung.cut}</th>
                <td class="num mono">{fmt0(rung.gross)} €</td>
                <td class="num mono">{fmt0(rung.net)} €</td>
                <td>
                  {#if rung.atMinWage}
                    <!-- Neither of the other two, and the difference is the
                         column's whole point: the figure on this row came out
                         of the ЗБДОО rather than out of Eurostat's survey or
                         out of an interpolation between two of their points.
                         See `mirror.js#flooredCuts`. -->
                    <span class="soft">
                      <span class="l-bg">{COPY.howAtMinWage.bg}</span>
                      <span class="l-en">{COPY.howAtMinWage.en}</span>
                    </span>
                  {:else if rung.surveyed}
                    <span class="l-bg">{COPY.howSurveyed.bg}</span>
                    <span class="l-en">{COPY.howSurveyed.en}</span>
                  {:else}
                    <span class="soft">
                      <span class="l-bg">{COPY.howModelled.bg}</span>
                      <span class="l-en">{COPY.howModelled.en}</span>
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          >Разпъването: <a href={httpUrl(calc.payLadderRows.shapeUrl) || ESTAT_SES_URL}
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcEurostat.bg,
              p: calc.payLadderRows.shapeYear,
            })}</a
          >. Днешната средна:
          <a href={httpUrl(calc.payLadderRows.anchorUrl)}
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcNsiWages.bg,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).bg,
            })}</a
          >.</span
        >
        <span class="l-en"
          >The spread: <a href={httpUrl(calc.payLadderRows.shapeUrl) || ESTAT_SES_URL}
            >{t(COPY.howSrc, "en", {
              s: COPY.srcEurostat.en,
              p: calc.payLadderRows.shapeYear,
            })}</a
          >. Today's average:
          <a href={httpUrl(calc.payLadderRows.anchorUrl)}
            >{t(COPY.howSrc, "en", {
              s: COPY.srcNsiWages.en,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).en,
            })}</a
          >.</span
        >
      </p>
      {@render ours()}
      <p>
        <span class="l-bg"
          >Изследването дава три числа за България: колко изкарват най-ниско платените 10%, колко
          изкарва човекът точно по средата и колко изкарват най-високо платените 10%. Всички стъпала
          между тях са пресметнати, а не преброени, и таблицата казва кое кое е. Затова числото
          показва приблизително къде се нарежда една заплата, а не точно: никой не е обиколил всички
          работещи в страната този месец.</span
        >
        <span class="l-en"
          >The survey gives three figures for Bulgaria: what the lowest-paid 10% earn, what the
          person exactly in the middle earns, and what the highest-paid 10% earn. Every rung between
          them is worked out rather than counted, and the table says which is which. So the figure
          shows roughly where a salary sits, not exactly: nobody polled every worker in the country
          this month.</span
        >
      </p>
      <!-- Only where the floor actually binds, so the paragraph is not
           explaining a row that is not on the table. It reads off the rungs
           rather than off a threshold of its own — a second comparison here
           would be a second thing to keep in step with `flooredCuts`. -->
      {#if calc.payLadderRows.rungs.some((r) => r.atMinWage)}
        <p>
          <span class="l-bg"
            >Изследването е от {calc.payLadderRows.shapeYear} г., а минималната заплата оттогава се е
            вдигнала по-бързо от средната. Затова долните стъпала, преизчислени към днешната средна, излизат
            под минималната, а под нея не е законно да се плаща на човек на пълен работен ден. Тези стъпала
            показват самата минимална заплата и таблицата ги отбелязва така: тя не е нито измерена от
            Евростат, нито пресметната между техните числа.</span
          >
          <span class="l-en"
            >The survey is from {calc.payLadderRows.shapeYear}, and the minimum wage has risen
            faster than the average since. So the bottom rungs, set against today's average, come
            out below the minimum, and below it is not a lawful wage for a full-time employee. Those
            rungs show the minimum wage itself, and the table marks them as that: it is neither
            measured by Eurostat nor worked out between two of their figures.</span
          >
        </p>
      {/if}
    {/if}

    <p>
      <span class="l-bg"
        >За това трябват две официални числа, защото нито едното не стига само. Първото казва
        <b>колко са разпънати заплатите</b>, тоест с колко човек в горния край изкарва повече от
        човек в долния. То е от изследването на Евростат за заплатите, мери един човек с една
        заплата, но излиза веднъж на четири години, тоест сумите в него са остарели. Второто е
        <b>днешната средна заплата за страната</b>, която НСИ публикува всяко тримесечие. Взимаме
        разпъването от първото и го прилагаме върху днешната средна от второто, за да носят
        стъпалата днешни суми. После всяко стъпало се превръща от бруто в нето. И двете числа са за
        цялата страна: никой не публикува как са разпределени заплатите вътре в една област, затова
        тази подредба не зависи от нея.</span
      >
      <span class="l-en"
        >This needs two official numbers, because neither is enough on its own. The first says
        <b>how far apart wages are</b>: how much more someone near the top earns than someone near
        the bottom. It comes from Eurostat's earnings survey, counts one person and one wage at a
        time, but is published once every four years, so its amounts are out of date. The second is
        <b>today's average wage for the country</b>, which NSI publishes every quarter. We take the
        spread from the first and set it against today's average from the second, so the rungs carry
        today's amounts. Each rung is then converted from gross to net. Both figures are the whole
        country's: nobody publishes how wages are spread inside one oblast, so this ladder does not
        change with the oblast.</span
      >
    </p>
  </section>

  <!-- 5 ------------------------------------------------------------------ -->
  <!-- The section keeps its heading and its `id`, and its depth moved to
       `/credit/`. `docs/seo.md`'s rule is one page per query cluster, and a
       full three-rate explainer here plus a deeper one there splits the
       borrowing cluster between two pages of ours. This page is a TOUR of the
       country's figures, and a tour may point at a room without walking you
       through it — so what stays is the one rate a tour needs and the way on.
       `#loan` is a deep-linkable anchor with inbound links; they keep landing
       on a section about loans, which is the obligation. -->
  <section id="loan">
    <h2>
      <span class="l-bg">Жилищният кредит</span>
      <span class="l-en">The home loan</span>
    </h2>
    <div class="stats">
      {#if calc.data.mortgage}
        {@render stat(
          `${fmt(calc.mortgageRateData.pct, 2)}%`,
          COPY.howKAar,
          COPY.srcEcbMir,
          calc.data.mortgage.new_business?.source_url,
          when(calc.mortgageRateData.refPeriod)
        )}
      {/if}
    </div>
    <p>
      <span class="l-bg"
        >Това е средното по споразуменията, подписани миналия месец, и от него се смята вноската.
        Три различни числа обаче се наричат „лихвата по жилищен кредит“, ГПР-то е второто от тях, а
        БНБ поставя и три граници на всеки нов кредит. Всичко това е на
        <a href={langHref("/credit/", $lang)}>страницата за кредитите</a>.</span
      >
      <span class="l-en"
        >This is the average across the agreements signed last month, and it is what the monthly
        payment is computed from. Three different numbers go by "the mortgage rate" though, the APRC
        is the second of them, and БНБ place three limits on every new loan besides. All of that is
        on <a href={langHref("/credit/", $lang)}>the borrowing page</a>.</span
      >
    </p>
  </section>

  <!-- 6 ------------------------------------------------------------------ -->
  <section id="home">
    <h2>
      <span class="l-bg">Цената на квадратен метър в обявите</span>
      <span class="l-en">The €/m² in the listings</span>
    </h2>
    <p>
      <span class="l-bg"
        >Никоя институция не публикува цената на квадратен метър в България. Евростат казва само с
        колко се е променила, не и колко струва. Затова самата цена идва от обявите: имот.bg
        публикува средна цена на квадратен метър по квартали, за всеки от градовете, които покрива.
        Тук показваме София, защото тази страница е за страната и не пита читателя къде живее;
        калкулаторът показва града, който той е избрал. Това са <b>искани</b> цени, не цени по сключени
        сделки, и между най-евтиния и най-скъпия квартал разликата е няколко пъти.</span
      >
      <span class="l-en"
        >No institution publishes the price of a square metre in Bulgaria. Eurostat says only how
        much it has changed, not what it costs. So the price itself comes from listings: imot.bg
        publishes an average €/m² per district, for each city it covers. Sofia is the one shown
        here, because this page is the country's and asks the reader nothing; the calculator shows
        whichever city they picked. These are <b>asking</b> prices rather than prices from closed sales,
        and the cheapest district and the dearest are several times apart.</span
      >
    </p>

    <div class="stats">
      {#if calc.refCityPriceIsLive}
        {@render stat(
          `${fmt0(calc.cityHome.eurPerM2)} €`,
          COPY.howKEurM2,
          COPY.howSrcImot,
          calc.cityHome.sourceUrl || IMOT_URL,
          imotDated
        )}
        {@render stat(
          `${fmt0(calc.cityHome.eurPerM2Min)}–${fmt0(calc.cityHome.eurPerM2Max)} €`,
          {
            bg: t(COPY.howKEurM2Range, "bg", { n: fmt0(calc.cityHome.nDistricts) }),
            en: t(COPY.howKEurM2Range, "en", { n: fmt0(calc.cityHome.nDistricts) }),
          },
          COPY.howSrcImot,
          calc.cityHome.sourceUrl || IMOT_URL,
          imotDated
        )}
        {@render stat(
          `${fmt0(calc.cityHome.price)} €`,
          {
            bg: t(COPY.howKHomePrice, "bg", { m2: fmt0(HOME.m2Default) }),
            en: t(COPY.howKHomePrice, "en", { m2: fmt0(HOME.m2Default) }),
          },
          COPY.howSrcImot,
          calc.cityHome.sourceUrl || IMOT_URL,
          imotDated
        )}
      {/if}
    </div>

    {#if calc.refCityPriceIsLive}
      {@render ours()}
      <p>
        <span class="l-bg"
          >имот.bg публикува по едно число на квартал и нито едно за София като цяло. Медианата на
          {fmt0(calc.cityHome.nDistricts)} квартала и сравнението с {calc.cityHome.baselineYear} г. са
          наши сметки върху техните числа, затова стоят тук, а не се приписват на тях. Колко заплати струва
          жилище стои в калкулатора, до самата цена. Числата по сключени сделки са на
          <a href="/market/">страницата за пазара</a>, защото идват от Евростат и НСИ и мерят друго.</span
        >
        <span class="l-en"
          >imot.bg publishes one figure per district and none for Sofia as a whole. The median
          across
          {fmt0(calc.cityHome.nDistricts)} districts, and the comparison with {calc.cityHome
            .baselineYear}, are our arithmetic over their figures, which is why they are named here
          rather than attributed to them. How many salaries a home is sits in the calculator, next
          to the price itself. The figures from closed sales are on
          <a href="/market/">the market page</a>, because they come from Eurostat and НСИ and
          measure something else.</span
        >
      </p>
    {/if}
  </section>

  <!-- 7 ------------------------------------------------------------------ -->
  <section id="work">
    <h2>
      <span class="l-bg">Работа и заплати</span>
      <span class="l-en">Work and pay</span>
    </h2>
    <p>
      <span class="l-bg"
        >Безработицата е сезонно изгладена: месечните ѝ колебания от селското стопанство, туризма и
        строителството са извадени, за да се вижда посоката, а не сезонът. Заплатите под нея са
        тримесечните числа на НСИ за страната, така както са публикувани: избираме клетка, не
        смятаме средни от техните числа.</span
      >
      <span class="l-en"
        >Unemployment is seasonally adjusted: the month-to-month swings from farming, tourism and
        construction are taken out so the direction shows rather than the season. The wages below
        are NSI's own quarterly figures for the country, exactly as published: a cell is selected,
        never averaged.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.unemployment}
        {@render stat(
          `${fmt(calc.data.unemployment.value)}%`,
          COPY.howKUnemp,
          COPY.srcEurostat,
          ESTAT_UNEMPLOYMENT_URL,
          when(calc.data.unemployment.ref_period)
        )}
      {/if}
    </div>

    {#if unemployment}
      {@const axis = niceTicks(0, unemployment.max, 4)}
      <p>
        <span class="l-bg"
          >Върхът е {number(unemployment.peak.value, 1, $lang)}% през {periodLong(
            unemployment.peak.period,
            $lang
          )}, по време на извънредното положение заради COVID. Оттам слиза без прекъсване до {number(
            unemployment.trough.value,
            1,
            $lang
          )}% през {periodLong(unemployment.trough.period, $lang)}, най-ниската стойност, която
          Евростат са отчели за България в този период.</span
        >
        <span class="l-en"
          >The peak is {number(unemployment.peak.value, 1, $lang)}% in {periodLong(
            unemployment.peak.period,
            $lang
          )}, during the COVID state of emergency. From there it falls without interruption to {number(
            unemployment.trough.value,
            1,
            $lang
          )}% in {periodLong(unemployment.trough.period, $lang)}, the lowest Eurostat have recorded
          for Bulgaria over this window.</span
        >
      </p>
      <figure class="chart">
        <div class="plot">
          {@render yAxis(
            axis.values.map((v) => ({ at: tickAt(v, axis), label: `${number(v, 0, $lang)}%` }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
            role="img"
            aria-label={t(COPY.howChartUnemp, $lang, {
              from: periodLong(unemployment.from, $lang),
              to: periodLong(unemployment.to, $lang),
              fromPct: number(unemployment.points[0].value, 1, $lang),
              toPct: number(unemployment.latest.value, 1, $lang),
              peakPct: number(unemployment.peak.value, 1, $lang),
              peakAt: periodLong(unemployment.peak.period, $lang),
              troughPct: number(unemployment.trough.value, 1, $lang),
              troughAt: periodLong(unemployment.trough.period, $lang),
            })}
          >
            {#each axis.values as v (v)}
              <line class="plot-grid" x1="0" y1={yOf(v, axis)} x2={CH_W} y2={yOf(v, axis)} />
            {/each}
            {#each xTicks(unemployment) as tick (tick.year)}
              <line class="plot-year" x1={yearX(tick.at)} y1="0" x2={yearX(tick.at)} y2={CH_H} />
            {/each}
            <path class="plot-line" d={pathOf({ ...unemployment, ...axis }, CH_W, CH_H)} />
            <line class="plot-axis" x1="0" y1={yOf(0, axis)} x2={CH_W} y2={yOf(0, axis)} />
            {#each unemployment.points as p, i (p.period)}
              <rect
                class="plot-hit"
                x={xOf(i, unemployment.points.length) - 2}
                y="0"
                width="4"
                height={CH_H}
                ><title>{periodLong(p.period, $lang)}: {number(p.value, 1, $lang)}%</title></rect
              >
            {/each}
          </svg>
          {@render xYears(xTicks(unemployment))}
        </div>
      </figure>
      <p class="cap">
        <span class="l-bg"
          >Това не са регистрираните в бюрата по труда, а хората, които изследването на работната
          сила брои: без работа през наблюдаваната седмица, търсили активно през последния месец и
          готови да започнат работа до две седмици. Който се е отказал да търси, не влиза нито в
          безработните, нито в работната сила, а един платен час през седмицата се брои за работа.</span
        >
        <span class="l-en"
          >These are not the people registered at the labour offices. They are the ones the labour
          force survey counts: out of work in the reference week, actively looking over the past
          four weeks, and available to start within two. Somebody who has given up looking counts as
          neither unemployed nor in the labour force, and one paid hour in the week counts as
          employed.</span
        >
      </p>
    {/if}

    <!-- A year to a row and a quarter to a column, so the whole series is on
         screen at once. One row per quarter is twenty-five rows of a single
         number each, which is either a very long column or a scroll box — and
         a scroll box on a reference page hides the half of the series a reader
         came for behind an affordance they have to notice first.

         `view/country.js#quarterGrid` does the placing. Nothing is combined on the way:
         a year row is four cells НСИ published, side by side, and the column a
         reader would expect at the end of it — the year's average — is exactly
         what their licence does not allow us to distribute. -->
    {#if calc.nationalWageGrid.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howColWage, $lang)}>
        <table class="fig-table">
          <!-- A caption rather than a column heading: with the quarters across
               the top and the years down the side there is no column left to
               say what the cells ARE, and a grid of bare euro amounts under a
               heading about unemployment names nothing. It is also what a
               screen reader announces on entering the table. -->
          <caption>
            <span class="l-bg">{COPY.howColWage.bg}</span>
            <span class="l-en">{COPY.howColWage.en}</span>
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span class="l-bg">{COPY.howColYear.bg}</span>
                <span class="l-en">{COPY.howColYear.en}</span>
              </th>
              {#each QUARTERS as quarter (quarter)}
                <th scope="col" class="num mono">{quarter}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each calc.nationalWageGrid as row (row.year)}
              <tr>
                <th scope="row" class="mono">{row.year}</th>
                {#each row.cells as cell, i (QUARTERS[i])}
                  <td class="num mono">
                    {#if cell}
                      {fmt0(cell.value)} €
                    {:else}
                      <span class="soft">—</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          ><a href={httpUrl(calc.payLadderRows.anchorUrl)} target="_blank" rel="noopener"
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcNsiWages.bg,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).bg,
            })}</a
          ></span
        >
        <span class="l-en"
          ><a href={httpUrl(calc.payLadderRows.anchorUrl)} target="_blank" rel="noopener"
            >{t(COPY.howSrc, "en", {
              s: COPY.srcNsiWages.en,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).en,
            })}</a
          ></span
        >
      </p>
    {/if}
  </section>

  <!-- Where a reader who has read the country's figures goes next, and both
       answers named rather than one. `/market/` was reachable from this page
       only through a clause inside §цената в обявите, which is a route for
       somebody who read that section and no route at all for the reader who
       came for the wedge. Each link says what it gives, because «Пазарът на
       жилища →» answers where it goes and not why anyone would follow it.

       Not in the contents list: `verify_render_country.mjs` holds that list to
       one entry per section on THIS page, which is what catches it drifting
       from the page, and an eighth entry pointing somewhere else would be
       bought by taking that check off. -->
  <nav class="onward" aria-label={t(COPY.howTitle, $lang)}>
    <p>
      <a href="/">
        <span class="l-bg">{COPY.howToCalculatorK.bg} →</span>
        <span class="l-en">{COPY.howToCalculatorK.en} →</span>
      </a>
      <span class="sub">
        <span class="l-bg">{COPY.howToCalculatorSub.bg}</span>
        <span class="l-en">{COPY.howToCalculatorSub.en}</span>
      </span>
    </p>
    <p>
      <a href="/market/">
        <span class="l-bg">{COPY.howToMarketK.bg} →</span>
        <span class="l-en">{COPY.howToMarketK.en} →</span>
      </a>
      <span class="sub">
        <span class="l-bg">{COPY.howToMarketSub.bg}</span>
        <span class="l-en">{COPY.howToMarketSub.en}</span>
      </span>
    </p>
  </nav>
</main>

<!-- The chart's two axes, drawn as HTML in a gutter beside the box rather than
     as text inside it: an SVG scaled to the viewport scales its type too, and
     an 11px label reaches a 360px phone at 6.2px. `chart.css` carries the grid
     that lands a percentage `top` on its own gridline, and `plot.js` decides
     the tick VALUES — a number a reader reads off an axis is not a component's
     to compute. -->
{#snippet yAxis(ticks)}
  <div class="yaxis" aria-hidden="true">
    {#each ticks as tick (tick.label)}
      <span class="plot-tick" style="top:{tick.at.toFixed(2)}%">{tick.label}</span>
    {/each}
  </div>
{/snippet}

{#snippet xYears(ticks)}
  <div class="xyears" aria-hidden="true">
    {#each ticks as tick (tick.year)}
      <span
        class="plot-tick"
        style="left:{tick.at.toFixed(2)}%; transform:translateX({tick.at < 5
          ? '0'
          : tick.at > 95
            ? '-100%'
            : '-50%'})">{tick.year}</span
      >
    {/each}
  </div>
{/snippet}

<SiteFooter page="how" />

<style>
  /* The column a FIGURE gets. A sentence gets `--measure` below and is
     narrower — the two were one number, which set every paragraph on this page
     85 characters wide. Tables and charts keep the column. */
  main.how {
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
  .lead {
    margin-top: 12px;
  }
  /* A source line is not prose: one string of mono at the 11px floor, and
     holding it to the reading measure wraps a period away from the publisher it
     belongs to. It takes the width of the figure it dates. */
  .cap {
    margin-top: 6px;
    max-width: none;
    font-family: var(--mono);
    font-size: var(--fs-micro);
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
  .onward p {
    margin: 0 0 12px;
    font-family: inherit;
    font-size: inherit;
  }
  /* On its own line rather than after the link, so the two routes read as two
     entries with a subtitle each. Beside it at 360px the second one wraps
     under the first and the pair looks like one sentence with a link in it. */
  .onward .sub {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: var(--fs-micro);
    line-height: 1.45;
  }

  /* The stat blocks. A wrapping flex row for the same reason the national
     strip is one: the count per section is 1, 2, 3 or 4 and no fixed column
     count divides all of them, so a grid leaves a hole on the last row. */
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
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
  }
  .stat .ss a {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px dotted var(--muted);
  }
  .stat .ss a:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
  /* WHO says this figure, at a weight that carries down a column of eighteen.
     The caption is one line at one size, so the separation is colour and
     weight rather than a second line — the period stays where the whole line
     was and only the publisher steps forward. `--ink-2` on `--surface` is a
     pair `verify_contrast.mjs` already computes, so this adds no ratio to
     check. */
  .stat .ss .pub {
    color: var(--ink-2);
    font-weight: 600;
  }
  .stat .ss a:hover .pub {
    color: inherit;
  }

  /* The chart draws to its own 320-unit box and this page's measure is 760, so
     unconstrained it renders at more than twice the size it was drawn for and
     its labels come out larger than the body text beside them. Capped at the
     width it is legible at, and left-aligned with the table it belongs to. */
  .wedge-fig {
    margin: 16px 0 0;
    max-width: 420px;
  }

  .fig-table thead th {
    font-weight: 600;
    color: var(--muted);
    font-size: var(--fs-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fig-table .code {
    color: var(--muted);
    font-size: var(--fs-micro);
    margin-right: 6px;
  }
  .fig-table .soft {
    color: var(--muted);
  }
  .fig-table caption {
    text-align: left;
    padding-bottom: 8px;
    font-size: var(--fs-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .fig-table .tag {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--real-ink);
    margin-left: 6px;
  }
  .fig-table a {
    color: var(--real-ink);
    text-decoration: none;
  }
</style>
